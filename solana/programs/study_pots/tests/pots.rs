// End-to-end pot weeks in LiteSVM with a warped clock. Run: anchor build && cargo test
use {
    anchor_lang::{prelude::*, solana_program::instruction::Instruction, system_program, AccountDeserialize, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    litesvm_token::{get_spl_account, spl_token::state::Account as TokenAccount, CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    study_pots::{accounts, instruction, Phase, Pot},
};

const T0: i64 = 1_800_000_000;
const LOCK: i64 = T0 + 100;
const SETTLE: i64 = T0 + 1000;
const TOKEN: Pubkey = anchor_spl::token_2022::ID;

struct Env {
    svm: LiteSVM,
    auth: Keypair,
    mint: Pubkey,
}

struct User {
    kp: Keypair,
    ata: Pubkey,
}

impl Env {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program(study_pots::id(), include_bytes!("../../../target/deploy/study_pots.so")).unwrap();
        let auth = Keypair::new();
        svm.airdrop(&auth.pubkey(), 10_000_000_000).unwrap();
        let mint = CreateMint::new(&mut svm, &auth).decimals(0).token_program_id(&TOKEN).send().unwrap();
        let mut env = Env { svm, auth, mint };
        env.at(T0);
        env
    }

    fn at(&mut self, t: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = t;
        self.svm.set_sysvar(&clock);
    }

    fn user(&mut self) -> User {
        let kp = Keypair::new();
        let ata = CreateAssociatedTokenAccount::new(&mut self.svm, &self.auth, &self.mint).owner(&kp.pubkey()).token_program_id(&TOKEN).send().unwrap();
        MintTo::new(&mut self.svm, &self.auth, &self.mint, &ata, 100).token_program_id(&TOKEN).send().unwrap();
        User { kp, ata }
    }

    fn bal(&self, u: &User) -> u64 {
        get_spl_account::<TokenAccount>(&self.svm, &u.ata).unwrap().amount
    }

    // The server key pays every fee; members only sign for their own stake.
    fn send(&mut self, ix: Instruction, extra: &[&Keypair]) -> std::result::Result<(), String> {
        self.svm.expire_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&self.auth.pubkey()), &self.svm.latest_blockhash());
        let mut signers = vec![&self.auth];
        signers.extend(extra.iter().filter(|k| k.pubkey() != self.auth.pubkey()));
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
    }

    fn pot(&self, pot: &Pubkey) -> Pot {
        Pot::try_deserialize(&mut &self.svm.get_account(pot).unwrap().data[..]).unwrap()
    }

    fn create(&mut self, creator: &User, stake: u64) -> std::result::Result<Pubkey, String> {
        let pot_id: [u8; 16] = rand_id();
        let pot = Pubkey::find_program_address(&[b"pot", &pot_id], &study_pots::id()).0;
        let vault = vault_of(&pot);
        let ix = Instruction::new_with_bytes(
            study_pots::id(),
            &instruction::CreatePot { pot_id, stake, lock_at: LOCK, settle_after: SETTLE }.data(),
            accounts::CreatePot {
                authority: self.auth.pubkey(),
                creator: creator.kp.pubkey(),
                pot,
                vault,
                mint: self.mint,
                creator_token: creator.ata,
                token_program: TOKEN,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(ix, &[&creator.kp]).map(|_| pot)
    }

    fn membership(&mut self, pot: Pubkey, u: &User, join: bool) -> std::result::Result<(), String> {
        let metas = accounts::Membership { pot, member: u.kp.pubkey(), member_token: u.ata, vault: vault_of(&pot), mint: self.mint, token_program: TOKEN }.to_account_metas(None);
        let data = if join { instruction::Join {}.data() } else { instruction::Leave {}.data() };
        self.send(Instruction::new_with_bytes(study_pots::id(), &data, metas), &[&u.kp])
    }

    fn attest_as(&mut self, signer: &Keypair, pot: Pubkey, u: &User, planned: u16, backed: u16) -> std::result::Result<(), String> {
        let metas = accounts::Attest { pot, authority: signer.pubkey() }.to_account_metas(None);
        let ix = Instruction::new_with_bytes(study_pots::id(), &instruction::Attest { member: u.kp.pubkey(), planned, backed }.data(), metas);
        let signer = signer.insecure_clone();
        self.send(ix, &[&signer])
    }

    fn attest(&mut self, pot: Pubkey, u: &User, planned: u16, backed: u16) -> std::result::Result<(), String> {
        let auth = self.auth.insecure_clone();
        self.attest_as(&auth, pot, u, planned, backed)
    }

    fn settle(&mut self, pot: Pubkey, atas: &[Pubkey]) -> std::result::Result<(), String> {
        let mut metas = accounts::Settle { pot, vault: vault_of(&pot), mint: self.mint, token_program: TOKEN }.to_account_metas(None);
        metas.extend(atas.iter().map(|a| AccountMeta::new(*a, false)));
        self.send(Instruction::new_with_bytes(study_pots::id(), &instruction::Settle {}.data(), metas), &[])
    }
}

fn vault_of(pot: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", pot.as_ref()], &study_pots::id()).0
}

fn rand_id() -> [u8; 16] {
    Keypair::new().pubkey().to_bytes()[..16].try_into().unwrap()
}

// A pot with `n` members (stake each), locked and attested with (planned, backed) per member.
fn week(stake: u64, progress: &[(u16, u16)]) -> (Env, Pubkey, Vec<User>) {
    let mut env = Env::new();
    let users: Vec<User> = progress.iter().map(|_| env.user()).collect();
    let pot = env.create(&users[0], stake).unwrap();
    for u in &users[1..] {
        env.membership(pot, u, true).unwrap();
    }
    env.at(LOCK + 1);
    for (u, (p, b)) in users.iter().zip(progress) {
        env.attest(pot, u, *p, *b).unwrap();
    }
    env.at(SETTLE);
    (env, pot, users)
}

fn settle_all(env: &mut Env, pot: Pubkey, users: &[User]) -> Vec<u64> {
    let atas: Vec<Pubkey> = users.iter().map(|u| u.ata).collect();
    env.settle(pot, &atas).unwrap();
    users.iter().map(|u| env.bal(u)).collect()
}

#[test]
fn create_join_leave_before_lock() {
    let mut env = Env::new();
    let (a, b) = (env.user(), env.user());
    assert!(env.create(&a, 0).is_err(), "stake 0 rejected");
    assert!(env.create(&a, 101).is_err(), "stake over 100 rejected");
    let pot = env.create(&a, 20).unwrap();
    assert_eq!(env.bal(&a), 80);
    env.membership(pot, &b, true).unwrap();
    assert!(env.membership(pot, &b, true).is_err(), "no double join");
    assert_eq!(env.bal(&b), 80);
    assert_eq!(env.pot(&pot).members.len(), 2);
    env.membership(pot, &b, false).unwrap();
    assert_eq!(env.bal(&b), 100, "leaving refunds in full");
    assert_eq!(env.pot(&pot).members.len(), 1);
}

#[test]
fn join_and_leave_rejected_after_lock() {
    let mut env = Env::new();
    let (a, b, c) = (env.user(), env.user(), env.user());
    let pot = env.create(&a, 20).unwrap();
    env.membership(pot, &b, true).unwrap();
    env.at(LOCK);
    assert!(env.membership(pot, &c, true).is_err());
    assert!(env.membership(pot, &b, false).is_err());
}

#[test]
fn attest_rules() {
    let mut env = Env::new();
    let (a, b) = (env.user(), env.user());
    let pot = env.create(&a, 20).unwrap();
    env.membership(pot, &b, true).unwrap();
    env.attest(pot, &a, 3, 2).unwrap();
    env.attest(pot, &a, 4, 0).unwrap(); // before the lock the numbers move freely
    assert!(!env.pot(&pot).members[0].frozen);
    env.at(LOCK);
    let stranger = Keypair::new();
    assert!(env.attest_as(&stranger, pot, &a, 5, 1).is_err(), "only the pot authority");
    assert!(env.attest(pot, &a, 3, 4).is_err(), "backed can't exceed planned");
    env.attest(pot, &a, 5, 1).unwrap();
    assert!(env.attest(pot, &a, 4, 4).is_err(), "plan is frozen after the first attestation");
    assert!(env.attest(pot, &a, 5, 0).is_err(), "backed never goes down");
    env.attest(pot, &a, 5, 4).unwrap();
    let outsider = env.user();
    assert!(env.attest(pot, &outsider, 1, 1).is_err(), "members only");
    env.at(SETTLE);
    assert!(env.attest(pot, &a, 5, 5).is_err(), "week is over");
    let m = &env.pot(&pot).members[0];
    assert_eq!((m.planned, m.backed, m.frozen), (5, 4, true));
}

#[test]
fn settle_timing_and_accounts() {
    let mut env = Env::new();
    let (a, b) = (env.user(), env.user());
    let pot = env.create(&a, 20).unwrap();
    env.membership(pot, &b, true).unwrap();
    env.at(SETTLE - 1);
    assert!(env.settle(pot, &[a.ata, b.ata]).is_err(), "too early");
    env.at(SETTLE);
    assert!(env.settle(pot, &[b.ata, a.ata]).is_err(), "accounts must be in member order");
    assert!(env.settle(pot, &[a.ata]).is_err(), "every member's account");
    env.settle(pot, &[a.ata, b.ata]).unwrap(); // permissionless: only the fee payer signs
    assert!(env.settle(pot, &[a.ata, b.ata]).is_err(), "settles once");
    assert!(env.pot(&pot).phase == Phase::Settled);
}

#[test]
fn one_of_three_finishers_takes_the_pot() {
    let (mut env, pot, users) = week(20, &[(5, 2), (4, 4), (3, 0)]);
    assert_eq!(settle_all(&mut env, pot, &users), vec![80, 140, 80]);
    let p = env.pot(&pot);
    assert_eq!(p.members.iter().map(|m| m.payout).collect::<Vec<_>>(), vec![0, 60, 0]);
}

#[test]
fn remainder_goes_to_first_finisher() {
    let (mut env, pot, users) = week(5, &[(5, 1), (5, 4), (5, 5)]);
    assert_eq!(settle_all(&mut env, pot, &users), vec![95, 103, 102]); // 15 → 8 + 7
}

#[test]
fn everyone_or_no_one_finished_refunds() {
    let (mut env, pot, users) = week(20, &[(5, 5), (4, 4), (1, 1)]);
    assert_eq!(settle_all(&mut env, pot, &users), vec![100, 100, 100]);
    let (mut env, pot, users) = week(20, &[(5, 0), (4, 3), (0, 0)]);
    assert_eq!(settle_all(&mut env, pot, &users), vec![100, 100, 100]);
}

#[test]
fn unattested_member_has_not_finished() {
    let mut env = Env::new();
    let (a, b) = (env.user(), env.user());
    let pot = env.create(&a, 20).unwrap();
    env.membership(pot, &b, true).unwrap();
    env.at(LOCK);
    env.attest(pot, &a, 2, 2).unwrap();
    env.at(SETTLE);
    assert_eq!(settle_all(&mut env, pot, &[a, b]), vec![120, 80]);
}

#[test]
fn lone_member_is_cancelled_and_refunded_at_lock() {
    let mut env = Env::new();
    let a = env.user();
    let pot = env.create(&a, 20).unwrap();
    assert!(env.settle(pot, &[a.ata]).is_err(), "not before the lock");
    env.at(LOCK);
    env.settle(pot, &[a.ata]).unwrap();
    assert_eq!(env.bal(&a), 100);
    assert!(env.pot(&pot).phase == Phase::Cancelled);
}

#[test]
fn six_members_max() {
    let mut env = Env::new();
    let users: Vec<User> = (0..7).map(|_| env.user()).collect();
    let pot = env.create(&users[0], 10).unwrap();
    for u in &users[1..6] {
        env.membership(pot, u, true).unwrap();
    }
    assert!(env.membership(pot, &users[6], true).is_err());
    assert_eq!(env.pot(&pot).members.len(), 6);
}

