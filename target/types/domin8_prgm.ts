/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/domin8_prgm.json`.
 */
export type Domin8Prgm = {
  "address": "3F4opHXEzCKmh3xEbm1fsW4NE7f6g5Bwca67swp1v1R3",
  "metadata": {
    "name": "domin8Prgm",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "bet",
      "docs": [
        "Place a bet in the current game round",
        "",
        "Parameters:",
        "- round_id: u64 - Round ID for the game",
        "- bet_amount: u64 - Bet amount in lamports",
        "- skin: u8 - Character skin ID (0-255)",
        "- position: [u16; 2] - Spawn position [x, y]"
      ],
      "discriminator": [
        94,
        203,
        166,
        126,
        20,
        243,
        169,
        82
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "activeGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  118,
                  101,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "betAmount",
          "type": "u64"
        },
        {
          "name": "skin",
          "type": "u8"
        },
        {
          "name": "position",
          "type": {
            "array": [
              "u16",
              2
            ]
          }
        }
      ]
    },
    {
      "name": "createGameRound",
      "docs": [
        "Create new game round (admin only, no bets yet)",
        "",
        "Parameters:",
        "- round_id: u64 - Round ID for the game",
        "- map: u8 - Map/background ID (0-255)"
      ],
      "discriminator": [
        96,
        168,
        23,
        66,
        170,
        244,
        145,
        171
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "activeGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  118,
                  101,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "map",
          "type": "u8"
        }
      ]
    },
    {
      "name": "deleteGame",
      "docs": [
        "Delete a game round from the blockchain (admin only)",
        "",
        "Parameters:",
        "- round_id: u64 - Round ID for the game to delete"
      ],
      "discriminator": [
        248,
        14,
        241,
        11,
        84,
        218,
        245,
        234
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "endGame",
      "docs": [
        "End game, draw winner, and distribute prizes (admin only)",
        "",
        "Parameters:",
        "- round_id: u64 - Round ID for the game"
      ],
      "discriminator": [
        224,
        135,
        245,
        99,
        67,
        175,
        121,
        252
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "activeGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  118,
                  101,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "Initialize global domin8 configuration (admin only)",
        "",
        "Parameters:",
        "- treasury: Pubkey - Treasury wallet for house fees",
        "- house_fee: u64 - House fee in basis points (e.g., 500 = 5%)",
        "- min_deposit_amount: u64 - Minimum bet amount in lamports",
        "- max_deposit_amount: u64 - Maximum bet amount in lamports",
        "- round_time: u64 - Game duration in seconds"
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "activeGame",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  99,
                  116,
                  105,
                  118,
                  101,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "houseFee",
          "type": "u64"
        },
        {
          "name": "minDepositAmount",
          "type": "u64"
        },
        {
          "name": "maxDepositAmount",
          "type": "u64"
        },
        {
          "name": "roundTime",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sendPrizeWinner",
      "docs": [
        "Send prize to the winner of a completed game",
        "",
        "Parameters:",
        "- round_id: u64 - Round ID for the game"
      ],
      "discriminator": [
        246,
        192,
        68,
        84,
        41,
        59,
        100,
        166
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  111,
                  109,
                  105,
                  110,
                  56,
                  95,
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "vrfCallback",
      "docs": [
        "VRF callback - called automatically by Magic Block VRF",
        "",
        "Parameters:",
        "- randomness: [u8; 32] - 32 bytes of verifiable randomness"
      ],
      "discriminator": [
        248,
        224,
        55,
        227,
        56,
        10,
        108,
        36
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "This check ensures that the vrf_program_identity (which is a PDA) is a signer",
            "enforcing the callback is executed by the VRF program through CPI"
          ],
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "game",
          "docs": [
            "Game account passed via accounts_metas in VRF request"
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "domin8Config",
      "discriminator": [
        240,
        160,
        179,
        138,
        97,
        149,
        175,
        203
      ]
    },
    {
      "name": "domin8Game",
      "discriminator": [
        242,
        172,
        164,
        162,
        16,
        216,
        9,
        28
      ]
    }
  ],
  "events": [
    {
      "name": "betPlaced",
      "discriminator": [
        88,
        88,
        145,
        226,
        126,
        206,
        32,
        0
      ]
    },
    {
      "name": "gameCreated",
      "discriminator": [
        218,
        25,
        150,
        94,
        177,
        112,
        96,
        2
      ]
    },
    {
      "name": "gameEnded",
      "discriminator": [
        35,
        93,
        113,
        153,
        29,
        144,
        200,
        109
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized access - admin only"
    },
    {
      "code": 6001,
      "name": "gameLocked",
      "msg": "Game system is locked"
    },
    {
      "code": 6002,
      "name": "gameNotOpen",
      "msg": "Game is not open for betting"
    },
    {
      "code": 6003,
      "name": "gameNotEnded",
      "msg": "Game has not ended yet"
    },
    {
      "code": 6004,
      "name": "insufficientBet",
      "msg": "Bet amount below minimum required"
    },
    {
      "code": 6005,
      "name": "excessiveBet",
      "msg": "Bet amount exceeds maximum allowed"
    },
    {
      "code": 6006,
      "name": "gameAlreadyExists",
      "msg": "Game round already exists"
    },
    {
      "code": 6007,
      "name": "randomnessNotReady",
      "msg": "VRF randomness not ready"
    },
    {
      "code": 6008,
      "name": "noWinnerFound",
      "msg": "No winner could be determined"
    },
    {
      "code": 6009,
      "name": "invalidWinner",
      "msg": "Invalid winner account"
    },
    {
      "code": 6010,
      "name": "invalidGameStatus",
      "msg": "Invalid game status for this operation"
    },
    {
      "code": 6011,
      "name": "gameExpired",
      "msg": "Game round has expired"
    },
    {
      "code": 6012,
      "name": "insufficientFunds",
      "msg": "Insufficient funds for bet"
    },
    {
      "code": 6013,
      "name": "arithmeticError",
      "msg": "Arithmetic operation failed"
    },
    {
      "code": 6014,
      "name": "invalidVrfForce",
      "msg": "Invalid VRF force seed format"
    },
    {
      "code": 6015,
      "name": "invalidWallet",
      "msg": "Invalid wallet address"
    },
    {
      "code": 6016,
      "name": "feeTooHigh",
      "msg": "Fee percentage too high"
    },
    {
      "code": 6017,
      "name": "invalidRoundTime",
      "msg": "Round time out of bounds"
    },
    {
      "code": 6018,
      "name": "noBets",
      "msg": "Game has no bets"
    },
    {
      "code": 6019,
      "name": "gameActive",
      "msg": "Cannot modify active game"
    },
    {
      "code": 6020,
      "name": "userBetLimitExceeded",
      "msg": "User has exceeded maximum bets per game"
    },
    {
      "code": 6021,
      "name": "invalidSkin",
      "msg": "Invalid skin ID"
    },
    {
      "code": 6022,
      "name": "invalidPosition",
      "msg": "Invalid position coordinates"
    },
    {
      "code": 6023,
      "name": "invalidGameAccount",
      "msg": "Invalid game account provided"
    }
  ],
  "types": [
    {
      "name": "betInfo",
      "docs": [
        "Bet information with game-specific data for domin8"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "walletIndex",
            "type": "u16"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "skin",
            "type": "u8"
          },
          {
            "name": "position",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          }
        ]
      }
    },
    {
      "name": "betPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalPot",
            "type": "u64"
          },
          {
            "name": "betIndex",
            "type": "u64"
          },
          {
            "name": "isNewUser",
            "type": "bool"
          },
          {
            "name": "skin",
            "type": "u8"
          },
          {
            "name": "position",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "domin8Config",
      "docs": [
        "Global configuration for domin8 game"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "gameRound",
            "type": "u64"
          },
          {
            "name": "houseFee",
            "type": "u64"
          },
          {
            "name": "minDepositAmount",
            "type": "u64"
          },
          {
            "name": "maxDepositAmount",
            "type": "u64"
          },
          {
            "name": "roundTime",
            "type": "u64"
          },
          {
            "name": "lock",
            "type": "bool"
          },
          {
            "name": "force",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "domin8Game",
      "docs": [
        "Main game state account"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameRound",
            "type": "u64"
          },
          {
            "name": "startDate",
            "type": "i64"
          },
          {
            "name": "endDate",
            "type": "i64"
          },
          {
            "name": "totalDeposit",
            "type": "u64"
          },
          {
            "name": "rand",
            "type": "u64"
          },
          {
            "name": "map",
            "type": "u8"
          },
          {
            "name": "userCount",
            "type": "u64"
          },
          {
            "name": "force",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "vrfRequested",
            "type": "bool"
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "winnerPrize",
            "type": "u64"
          },
          {
            "name": "winningBetIndex",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "wallets",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bets",
            "type": {
              "vec": {
                "defined": {
                  "name": "betInfo"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "gameCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "initialBet",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "vrfForce",
            "type": "string"
          },
          {
            "name": "vrfForceBytes",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "gameEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "winningBetIndex",
            "type": "u64"
          },
          {
            "name": "winningBetAmount",
            "type": "u64"
          },
          {
            "name": "totalPot",
            "type": "u64"
          },
          {
            "name": "prize",
            "type": "u64"
          },
          {
            "name": "houseFee",
            "type": "u64"
          },
          {
            "name": "houseFeePercentage",
            "type": "u64"
          },
          {
            "name": "totalBets",
            "type": "u64"
          },
          {
            "name": "uniqueUsers",
            "type": "u64"
          },
          {
            "name": "winProbability",
            "type": "u64"
          },
          {
            "name": "vrfForce",
            "type": "string"
          },
          {
            "name": "vrfForceBytes",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "randomness",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"anchor\""
    }
  ]
};
