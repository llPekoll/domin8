/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/domin8_1v1_prgm.json`.
 */
export type Domin81v1Prgm = {
  "address": "56T1ZkHmNp32HcickAkZ1JUf7kB4vFZXZir3FgMHzXL5",
  "metadata": {
    "name": "domin81v1Prgm",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelLobby",
      "docs": [
        "Cancel a 1v1 lobby (Player A refunds if status = created)"
      ],
      "discriminator": [
        241,
        47,
        118,
        95,
        81,
        67,
        137,
        13
      ],
      "accounts": [
        {
          "name": "lobby",
          "writable": true
        },
        {
          "name": "playerA",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createLobby",
      "docs": [
        "Create a new 1v1 lobby (Player A creates, funds it, requests VRF)"
      ],
      "discriminator": [
        116,
        55,
        74,
        48,
        40,
        51,
        135,
        155
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
                  49,
                  118,
                  49,
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
          "name": "lobby",
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
                  49,
                  118,
                  49,
                  95,
                  108,
                  111,
                  98,
                  98,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config.lobby_count",
                "account": "domin81v1Config"
              }
            ]
          }
        },
        {
          "name": "playerA",
          "writable": true,
          "signer": true
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "The caller (frontend) is responsible for creating this account",
            "and passing the correct randomness account here"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "skinA",
          "type": "u8"
        },
        {
          "name": "positionA",
          "type": {
            "array": [
              "u16",
              2
            ]
          }
        },
        {
          "name": "map",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "Initialize the global configuration account"
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
                  49,
                  118,
                  49,
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
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "houseFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "joinLobby",
      "docs": [
        "Join an existing 1v1 lobby (Player B joins, funds it, resolves game)"
      ],
      "discriminator": [
        127,
        102,
        119,
        190,
        215,
        223,
        212,
        159
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
                  49,
                  118,
                  49,
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
          "name": "lobby",
          "writable": true
        },
        {
          "name": "playerA",
          "writable": true
        },
        {
          "name": "playerB",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "randomnessAccountData"
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "skinB",
          "type": "u8"
        },
        {
          "name": "positionB",
          "type": {
            "array": [
              "u16",
              2
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "domin81v1Config",
      "discriminator": [
        171,
        136,
        42,
        50,
        175,
        187,
        107,
        140
      ]
    },
    {
      "name": "domin81v1Lobby",
      "discriminator": [
        14,
        128,
        181,
        20,
        193,
        94,
        51,
        199
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "lobbyNotFound",
      "msg": "Lobby not found or invalid PDA"
    },
    {
      "code": 6001,
      "name": "invalidLobbyStatus",
      "msg": "Lobby is not in the correct status"
    },
    {
      "code": 6002,
      "name": "unauthorizedCancellation",
      "msg": "Unauthorized: only player A can cancel"
    },
    {
      "code": 6003,
      "name": "unauthorizedJoin",
      "msg": "Unauthorized: only player B can join"
    },
    {
      "code": 6004,
      "name": "alreadyJoined",
      "msg": "Lobby is already joined by a second player"
    },
    {
      "code": 6005,
      "name": "insufficientFunds",
      "msg": "Insufficient funds for bet"
    },
    {
      "code": 6006,
      "name": "randomnessNotResolved",
      "msg": "Switchboard randomness not yet resolved"
    },
    {
      "code": 6007,
      "name": "randomnessAlreadyRevealed",
      "msg": "Switchboard randomness already revealed for this slot"
    },
    {
      "code": 6008,
      "name": "invalidBetAmount",
      "msg": "Invalid bet amount"
    },
    {
      "code": 6009,
      "name": "invalidHouseFee",
      "msg": "House fee configuration error"
    },
    {
      "code": 6010,
      "name": "winnerDeterminationError",
      "msg": "Unable to determine winner from randomness"
    },
    {
      "code": 6011,
      "name": "distributionError",
      "msg": "Fund distribution failed"
    }
  ],
  "types": [
    {
      "name": "domin81v1Config",
      "docs": [
        "Global configuration account for the 1v1 program"
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
            "name": "houseFeeBps",
            "type": "u16"
          },
          {
            "name": "lobbyCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "domin81v1Lobby",
      "docs": [
        "A single 1v1 lobby (coinflip game)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lobbyId",
            "type": "u64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "randomnessAccount",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "skinA",
            "type": "u8"
          },
          {
            "name": "skinB",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "positionA",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "positionB",
            "type": {
              "option": {
                "array": [
                  "u16",
                  2
                ]
              }
            }
          },
          {
            "name": "map",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
