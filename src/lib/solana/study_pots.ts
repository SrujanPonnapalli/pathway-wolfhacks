/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/study_pots.json`.
 */
export type StudyPots = {
  "address": "EzDQkSW3fEqD8Pea3cSvFn1C9mRNhtZ5JGUUJJEwdT43",
  "metadata": {
    "name": "studyPots",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "attest",
      "docs": [
        "Pathway attests a member's effort (planned / backed study blocks) as it happens. Before the",
        "lock the numbers move freely (members can still leave). The first attestation after the",
        "lock freezes `planned`; from then on `planned` can't change and `backed` can only go up."
      ],
      "discriminator": [
        83,
        148,
        120,
        119,
        144,
        139,
        117,
        160
      ],
      "accounts": [
        {
          "name": "pot",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "pot"
          ]
        }
      ],
      "args": [
        {
          "name": "member",
          "type": "pubkey"
        },
        {
          "name": "planned",
          "type": "u16"
        },
        {
          "name": "backed",
          "type": "u16"
        }
      ]
    },
    {
      "name": "createPot",
      "docs": [
        "Create a pot and its vault; the creator joins in the same transaction."
      ],
      "discriminator": [
        232,
        45,
        123,
        181,
        204,
        121,
        131,
        9
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "pot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "potId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "creatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "potId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "lockAt",
          "type": "i64"
        },
        {
          "name": "settleAfter",
          "type": "i64"
        }
      ]
    },
    {
      "name": "join",
      "docs": [
        "Join before the lock by staking the pot's stake."
      ],
      "discriminator": [
        206,
        55,
        2,
        106,
        113,
        220,
        17,
        163
      ],
      "accounts": [
        {
          "name": "pot",
          "writable": true
        },
        {
          "name": "member",
          "signer": true
        },
        {
          "name": "memberToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "pot"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "leave",
      "docs": [
        "Leave before the lock: full refund, no penalty."
      ],
      "discriminator": [
        59,
        234,
        148,
        108,
        107,
        149,
        173,
        112
      ],
      "accounts": [
        {
          "name": "pot",
          "writable": true
        },
        {
          "name": "member",
          "signer": true
        },
        {
          "name": "memberToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "pot"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "settle",
      "docs": [
        "Anyone can settle once the week is over (or cancel once locked with fewer than 2 members).",
        "`remaining_accounts`: each member's PATH token account, in `members` order."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "pot",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pot"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "pot"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "pot",
      "discriminator": [
        238,
        118,
        60,
        175,
        178,
        191,
        59,
        58
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badStake",
      "msg": "Stake must be 1 to 100 PATH"
    },
    {
      "code": 6001,
      "name": "badSchedule",
      "msg": "Need now < lock_at < settle_after"
    },
    {
      "code": 6002,
      "name": "notOpen",
      "msg": "Pot is not open"
    },
    {
      "code": 6003,
      "name": "locked",
      "msg": "Pot is locked for the week"
    },
    {
      "code": 6004,
      "name": "full",
      "msg": "Pot is full"
    },
    {
      "code": 6005,
      "name": "alreadyMember",
      "msg": "Already a member"
    },
    {
      "code": 6006,
      "name": "notMember",
      "msg": "Not a member of this pot"
    },
    {
      "code": 6007,
      "name": "weekOver",
      "msg": "The pot's week is over"
    },
    {
      "code": 6008,
      "name": "badProgress",
      "msg": "Backed blocks must not exceed planned or go down"
    },
    {
      "code": 6009,
      "name": "planFrozen",
      "msg": "The plan is frozen for this week"
    },
    {
      "code": 6010,
      "name": "tooEarly",
      "msg": "Too early to settle"
    },
    {
      "code": 6011,
      "name": "badAccounts",
      "msg": "Member token accounts missing or wrong"
    }
  ],
  "types": [
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "planned",
            "type": "u16"
          },
          {
            "name": "backed",
            "type": "u16"
          },
          {
            "name": "frozen",
            "type": "bool"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "phase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "pot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "potId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "lockAt",
            "type": "i64"
          },
          {
            "name": "settleAfter",
            "type": "i64"
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
