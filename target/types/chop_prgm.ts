/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/chop_prgm.json`.
 */
export type ChopPrgm = {
  "address": "4gNQMwQ7vxABctopEkyrxK9VkAqa8FBPtgHV7o1xnZqq",
  "metadata": {
    "name": "chopPrgm",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "CHOP - Timberman-style PVP skill game on Solana"
  },
  "instructions": [
    {
      "name": "cancelLobby",
      "docs": [
        "Cancel a lobby (refund creator if no one has joined)"
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
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  111,
                  112,
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
                  99,
                  104,
                  111,
                  112,
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
                "path": "lobby.lobby_id",
                "account": "chopLobby"
              }
            ]
          }
        },
        {
          "name": "creator",
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
        "Create a new CHOP lobby (creator deposits SOL, waits for opponent)"
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
                  99,
                  104,
                  111,
                  112,
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
                  99,
                  104,
                  111,
                  112,
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
                "account": "chopConfig"
              }
            ]
          }
        },
        {
          "name": "creator",
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
          "name": "betAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "endGame",
      "docs": [
        "End game and distribute funds (called by Convex backend with winner)",
        "Winner is determined by skill-based game logic in Convex, not VRF"
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  111,
                  112,
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
                  99,
                  104,
                  111,
                  112,
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
                "path": "lobby.lobby_id",
                "account": "chopLobby"
              }
            ]
          }
        },
        {
          "name": "admin",
          "docs": [
            "Admin must match the config admin (Convex backend wallet)"
          ],
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "winnerAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "winner",
          "type": "pubkey"
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
                  99,
                  104,
                  111,
                  112,
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
          "name": "platformFeeBps",
          "type": "u16"
        },
        {
          "name": "creatorFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "joinLobby",
      "docs": [
        "Join an existing lobby (player deposits matching SOL)"
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  111,
                  112,
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
                  99,
                  104,
                  111,
                  112,
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
                "path": "lobby.lobby_id",
                "account": "chopLobby"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "chopConfig",
      "discriminator": [
        63,
        130,
        134,
        182,
        35,
        252,
        237,
        214
      ]
    },
    {
      "name": "chopLobby",
      "discriminator": [
        75,
        251,
        81,
        67,
        107,
        154,
        69,
        28
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
      "name": "lobbyFull",
      "msg": "Lobby is already full"
    },
    {
      "code": 6003,
      "name": "insufficientFunds",
      "msg": "Insufficient funds for bet"
    },
    {
      "code": 6004,
      "name": "betBelowMinimum",
      "msg": "Bet amount is below minimum required"
    },
    {
      "code": 6005,
      "name": "invalidFeeConfiguration",
      "msg": "Fee configuration error: total fees exceed maximum"
    },
    {
      "code": 6006,
      "name": "invalidWinner",
      "msg": "Winner must be a player in the lobby"
    },
    {
      "code": 6007,
      "name": "distributionError",
      "msg": "Fund distribution failed"
    },
    {
      "code": 6008,
      "name": "selfPlayNotAllowed",
      "msg": "Self-play not allowed: creator cannot join their own lobby"
    },
    {
      "code": 6009,
      "name": "lobbyNotTimedOut",
      "msg": "Lobby has not timed out yet"
    },
    {
      "code": 6010,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized: only admin can perform this action"
    },
    {
      "code": 6011,
      "name": "unauthorizedCancel",
      "msg": "Unauthorized: only creator can cancel this lobby"
    },
    {
      "code": 6012,
      "name": "cannotCancelWithPlayers",
      "msg": "Cannot cancel: lobby already has players"
    }
  ],
  "types": [
    {
      "name": "chopConfig",
      "docs": [
        "Global configuration account for the CHOP program"
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
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "creatorFeeBps",
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
      "name": "chopLobby",
      "docs": [
        "A single CHOP lobby (skill-based game)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lobbyId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "betAmount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lockedAt",
            "type": "i64"
          },
          {
            "name": "players",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "totalPot",
            "type": "u64"
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    }
  ]
};
