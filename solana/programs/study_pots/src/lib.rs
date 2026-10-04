// Study Pots: weekly accountability pots for study buddies, staked in PATH (a devnet test token).
//
// The program guarantees where the tokens can go: only back to pot members, only by the split
// rule below. Nobody, including Pathway, can withdraw a pot. Pathway's server is the pot's
// `authority`: during the week it attests each member's effort (planned / backed study blocks)
// on-chain as it happens. Settlement is permissionless: after the week anyone can crank `settle`,
// and the program itself decides who finished (backed >= 80% of planned) and pays out.
// On-chain: wallet addresses, amounts, block counts, a random pot id and times. No names or courses.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("EzDQkSW3fEqD8Pea3cSvFn1C9mRNhtZ5JGUUJJEwdT43");

pub const MAX_MEMBERS: usize = 6;
pub const MAX_STAKE: u64 = 100;

#[program]
pub mod study_pots {
    use super::*;

    /// Create a pot and its vault; the creator joins in the same transaction.
    pub fn create_pot(ctx: Context<CreatePot>, pot_id: [u8; 16], stake: u64, lock_at: i64, settle_after: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!((1..=MAX_STAKE).contains(&stake), PotError::BadStake);
        require!(now < lock_at && lock_at < settle_after, PotError::BadSchedule);
        let a = ctx.accounts;
        a.pot.set_inner(Pot {
            pot_id,
            authority: a.authority.key(),
            mint: a.mint.key(),
            stake,
            lock_at,
            settle_after,
            phase: Phase::Open,
            bump: ctx.bumps.pot,
            members: vec![],
        });
        stake_in(&mut a.pot, &a.creator, &a.creator_token, &a.vault, &a.mint, &a.token_program)
    }

    /// Join before the lock by staking the pot's stake.
    pub fn join(ctx: Context<Membership>) -> Result<()> {
        let a = ctx.accounts;
        stake_in(&mut a.pot, &a.member, &a.member_token, &a.vault, &a.mint, &a.token_program)
    }

    /// Leave before the lock: full refund, no penalty.
    pub fn leave(ctx: Context<Membership>) -> Result<()> {
        let a = ctx.accounts;
        require!(a.pot.phase == Phase::Open, PotError::NotOpen);
        require!(Clock::get()?.unix_timestamp < a.pot.lock_at, PotError::Locked);
        let i = a.pot.index_of(&a.member.key()).ok_or(PotError::NotMember)?;
        pay(&a.pot, &a.vault, &a.mint, a.member_token.to_account_info(), &a.token_program, a.pot.stake)?;
        a.pot.members.remove(i);
        Ok(())
    }

    /// Pathway attests a member's effort (planned / backed study blocks) as it happens. Before the
    /// lock the numbers move freely (members can still leave). The first attestation after the
    /// lock freezes `planned`; from then on `planned` can't change and `backed` can only go up.
    pub fn attest(ctx: Context<Attest>, member: Pubkey, planned: u16, backed: u16) -> Result<()> {
        let pot = &mut ctx.accounts.pot;
        let now = Clock::get()?.unix_timestamp;
        require!(pot.phase == Phase::Open, PotError::NotOpen);
        require!(now < pot.settle_after, PotError::WeekOver);
        require!(backed <= planned, PotError::BadProgress);
        let locked = now >= pot.lock_at;
        let i = pot.index_of(&member).ok_or(PotError::NotMember)?;
        let m = &mut pot.members[i];
        if m.frozen {
            require!(planned == m.planned, PotError::PlanFrozen);
            require!(backed >= m.backed, PotError::BadProgress);
        }
        m.planned = planned;
        m.backed = backed;
        m.frozen = locked;
        Ok(())
    }

    /// Anyone can settle once the week is over (or cancel once locked with fewer than 2 members).
    /// `remaining_accounts`: each member's PATH token account, in `members` order.
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let a = ctx.accounts;
        let now = Clock::get()?.unix_timestamp;
        let n = a.pot.members.len();
        let cancel = n < 2;
        require!(a.pot.phase == Phase::Open, PotError::NotOpen);
        require!(now >= a.pot.settle_after || (cancel && now >= a.pot.lock_at), PotError::TooEarly);
        require!(ctx.remaining_accounts.len() == n, PotError::BadAccounts);

        let finished: Vec<bool> = a.pot.members.iter().map(Member::finished).collect();
        let amounts = if cancel { vec![a.pot.stake; n] } else { payouts(a.pot.stake, &finished) };
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            let ta = InterfaceAccount::<TokenAccount>::try_from(acc)?;
            require_keys_eq!(ta.owner, a.pot.members[i].wallet, PotError::BadAccounts);
            require_keys_eq!(ta.mint, a.pot.mint, PotError::BadAccounts);
            if amounts[i] > 0 {
                pay(&a.pot, &a.vault, &a.mint, acc.clone(), &a.token_program, amounts[i])?;
            }
        }
        for (m, amount) in a.pot.members.iter_mut().zip(amounts) {
            m.payout = amount;
        }
        a.pot.phase = if cancel { Phase::Cancelled } else { Phase::Settled };
        Ok(())
    }
}

/// The split rule. Mirrored exactly in src/lib/solana/payout.ts; both are tested on the same cases.
/// Everyone or no one finished: full refund. Otherwise finishers split the whole pot equally and
/// the integer-division remainder goes to the first finisher in member order.
pub fn payouts(stake: u64, finished: &[bool]) -> Vec<u64> {
    let n = finished.iter().filter(|f| **f).count() as u64;
    if n == 0 || n == finished.len() as u64 {
        return vec![stake; finished.len()];
    }
    let total = stake * finished.len() as u64;
    let share = total / n;
    let mut rem = total - share * n;
    finished
        .iter()
        .map(|&f| {
            if !f {
                return 0;
            }
            let extra = rem;
            rem = 0;
            share + extra
        })
        .collect()
}

fn stake_in<'info>(
    pot: &mut Account<'info, Pot>,
    member: &Signer<'info>,
    from: &InterfaceAccount<'info, TokenAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    require!(pot.phase == Phase::Open, PotError::NotOpen);
    require!(Clock::get()?.unix_timestamp < pot.lock_at, PotError::Locked);
    require!(pot.members.len() < MAX_MEMBERS, PotError::Full);
    require!(pot.index_of(&member.key()).is_none(), PotError::AlreadyMember);
    let accounts = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: vault.to_account_info(),
        authority: member.to_account_info(),
    };
    transfer_checked(CpiContext::new(token_program.key(), accounts), pot.stake, mint.decimals)?;
    pot.members.push(Member { wallet: member.key(), planned: 0, backed: 0, frozen: false, payout: 0 });
    Ok(())
}

// Vault → member, signed by the pot PDA (the vault's owner).
fn pay<'info>(
    pot: &Account<'info, Pot>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let bump = [pot.bump];
    let seeds: &[&[u8]] = &[b"pot", &pot.pot_id, &bump];
    let accounts = TransferChecked { from: vault.to_account_info(), mint: mint.to_account_info(), to, authority: pot.to_account_info() };
    transfer_checked(CpiContext::new_with_signer(token_program.key(), accounts, &[seeds]), amount, mint.decimals)
}

#[account]
#[derive(InitSpace)]
pub struct Pot {
    pub pot_id: [u8; 16],
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub stake: u64,
    pub lock_at: i64,
    pub settle_after: i64,
    pub phase: Phase,
    pub bump: u8,
    #[max_len(6)]
    pub members: Vec<Member>,
}

impl Pot {
    fn index_of(&self, wallet: &Pubkey) -> Option<usize> {
        self.members.iter().position(|m| m.wallet == *wallet)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Member {
    pub wallet: Pubkey,
    pub planned: u16,
    pub backed: u16,
    pub frozen: bool,
    pub payout: u64,
}

impl Member {
    /// Finished = at least one planned block and backed / planned >= 80%.
    pub fn finished(&self) -> bool {
        self.planned > 0 && 5 * self.backed as u32 >= 4 * self.planned as u32
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Phase {
    Open,
    Settled,
    Cancelled,
}

#[derive(Accounts)]
#[instruction(pot_id: [u8; 16])]
pub struct CreatePot<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub creator: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Pot::INIT_SPACE, seeds = [b"pot", pot_id.as_ref()], bump)]
    pub pot: Account<'info, Pot>,
    #[account(
        init, payer = authority, seeds = [b"vault", pot.key().as_ref()], bump,
        token::mint = mint, token::authority = pot, token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = creator, token::token_program = token_program)]
    pub creator_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Membership<'info> {
    #[account(mut, has_one = mint)]
    pub pot: Account<'info, Pot>,
    pub member: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = member, token::token_program = token_program)]
    pub member_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", pot.key().as_ref()], bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Attest<'info> {
    #[account(mut, has_one = authority)]
    pub pot: Account<'info, Pot>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut, has_one = mint)]
    pub pot: Account<'info, Pot>,
    #[account(mut, seeds = [b"vault", pot.key().as_ref()], bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum PotError {
    #[msg("Stake must be 1 to 100 PATH")]
    BadStake,
    #[msg("Need now < lock_at < settle_after")]
    BadSchedule,
    #[msg("Pot is not open")]
    NotOpen,
    #[msg("Pot is locked for the week")]
    Locked,
    #[msg("Pot is full")]
    Full,
    #[msg("Already a member")]
    AlreadyMember,
    #[msg("Not a member of this pot")]
    NotMember,
    #[msg("The pot's week is over")]
    WeekOver,
    #[msg("Backed blocks must not exceed planned or go down")]
    BadProgress,
    #[msg("The plan is frozen for this week")]
    PlanFrozen,
    #[msg("Too early to settle")]
    TooEarly,
    #[msg("Member token accounts missing or wrong")]
    BadAccounts,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_rule() {
        assert_eq!(payouts(20, &[true, true, true]), vec![20, 20, 20]); // everyone finished: refund
        assert_eq!(payouts(20, &[false, false]), vec![20, 20]); // nobody finished: refund
        assert_eq!(payouts(20, &[false, true, false]), vec![0, 60, 0]); // 1 of 3 gets 3x
        assert_eq!(payouts(5, &[false, true, true]), vec![0, 8, 7]); // 15 → 8 + 7, remainder to first finisher
        assert_eq!(payouts(20, &[true, true, false]), vec![30, 30, 0]);
    }

    #[test]
    fn finished_is_80_percent() {
        let m = |planned, backed| Member { wallet: Pubkey::default(), planned, backed, frozen: true, payout: 0 };
        assert!(m(5, 4).finished());
        assert!(!m(5, 3).finished());
        assert!(!m(0, 0).finished());
        assert!(m(1, 1).finished());
        assert!(!m(4, 3).finished()); // 75%
    }
}
