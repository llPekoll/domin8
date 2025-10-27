/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/domin8_prgm.json`.
 */
export type Domin8Prgm = {
  address: "93swWR5KYURGFWhDbgat9HxRdJAS5pQKssPffnj9bfXK";
  metadata: {
    name: "domin8_prgm";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "claim_house_fee";
      docs: ["Claim house fee manually (if automatic transfer failed)"];
      discriminator: [180, 5, 102, 97, 75, 143, 204, 151];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "game_round";
          docs: ["The game round where house fee needs to be claimed"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "arg";
                path: "round_id";
              },
            ];
          };
        },
        {
          name: "vault";
          docs: ["The vault PDA that holds unclaimed funds"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "treasury";
          docs: ["The treasury claiming the house fee"];
          writable: true;
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "round_id";
          type: "u64";
        },
      ];
    },
    {
      name: "claim_winner_prize";
      docs: ["Claim winner prize manually (if automatic transfer failed)"];
      discriminator: [188, 250, 72, 170, 173, 90, 110, 201];
      accounts: [
        {
          name: "game_round";
          docs: ["The game round where winner needs to claim"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "arg";
                path: "round_id";
              },
            ];
          };
        },
        {
          name: "vault";
          docs: ["The vault PDA that holds unclaimed funds"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "winner";
          docs: ["The winner claiming their prize"];
          writable: true;
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "round_id";
          type: "u64";
        },
      ];
    },
    {
      name: "cleanup_old_game";
      docs: ["Cleanup old game round (backend-triggered after 1 week)"];
      discriminator: [108, 187, 63, 87, 253, 127, 241, 166];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "arg";
                path: "round_id";
              },
            ];
          };
        },
        {
          name: "crank";
          docs: ["The crank authority (backend wallet)"];
          writable: true;
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "round_id";
          type: "u64";
        },
      ];
    },
    {
      name: "close_betting_window";
      docs: ["Close betting window and lock game for winner selection"];
      discriminator: [145, 48, 50, 174, 220, 228, 120, 9];
      accounts: [
        {
          name: "counter";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
            ];
          };
        },
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "crank";
          docs: ["The crank authority"];
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "create_game";
      docs: ["Create a new game round with the first bet (called by first player)"];
      discriminator: [124, 69, 75, 66, 184, 220, 72, 206];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
            ];
          };
        },
        {
          name: "bet_entry";
          docs: ["First bet entry PDA (bet_index = 0)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 101, 116];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
              {
                kind: "const";
                value: [0, 0, 0, 0];
              },
            ];
          };
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "vrf_program";
          docs: ["ORAO VRF Program"];
          address: "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y";
        },
        {
          name: "network_state";
          docs: ["ORAO Network State (validated as PDA from ORAO VRF program)"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110,
                ];
              },
            ];
            program: {
              kind: "const";
              value: [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120,
              ];
            };
          };
        },
        {
          name: "treasury";
          docs: ["ORAO Treasury"];
          writable: true;
        },
        {
          name: "vrf_request";
          docs: ["VRF Request Account (will be created by ORAO VRF program)"];
          writable: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "emergency_refund_vrf_timeout";
      docs: ["Emergency refund if VRF timeout (10+ minutes with no randomness)"];
      discriminator: [110, 59, 80, 228, 36, 158, 137, 208];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
            ];
          };
        },
        {
          name: "vault";
          docs: ["The vault PDA that holds bet funds to refund"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "authority";
          docs: ["The authority (backend crank or admin)"];
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "emergency_unlock";
      docs: ["Emergency unlock bets (admin only, for stuck states)"];
      discriminator: [17, 106, 80, 63, 244, 220, 225, 70];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "authority";
          signer: true;
        },
      ];
      args: [];
    },
    {
      name: "initialize";
      docs: ["Initialize the game with configuration"];
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "vault";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "treasury";
          type: "pubkey";
        },
      ];
    },
    {
      name: "place_bet";
      docs: ["Place an additional bet in the current game round (called by subsequent players)"];
      discriminator: [222, 62, 67, 220, 63, 166, 126, 33];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
            ];
          };
        },
        {
          name: "bet_entry";
          docs: ["CREATE: BetEntry PDA for storing bet details"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 101, 116];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
              {
                kind: "account";
                path: "game_round.bet_count";
                account: "GameRound";
              },
            ];
          };
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "rotate_force";
      docs: ["Rotate force field (admin only, for fixing stuck VRF states)"];
      discriminator: [128, 255, 188, 140, 215, 206, 245, 254];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "authority";
          signer: true;
        },
      ];
      args: [];
    },
    {
      name: "select_winner_and_payout";
      docs: ["Select winner using VRF and distribute payouts"];
      discriminator: [84, 212, 130, 51, 181, 63, 89, 24];
      accounts: [
        {
          name: "counter";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "game_round";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 114, 111, 117, 110, 100];
              },
              {
                kind: "account";
                path: "counter.current_round_id";
                account: "GameCounter";
              },
            ];
          };
        },
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "vault";
          docs: ["The vault PDA that holds game funds"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [118, 97, 117, 108, 116];
              },
            ];
          };
        },
        {
          name: "crank";
          docs: ["The crank authority"];
          signer: true;
        },
        {
          name: "vrf_request";
          docs: ["VRF Request Account containing fulfilled randomness"];
        },
        {
          name: "treasury";
          docs: ["Treasury account for receiving house fees"];
          writable: true;
        },
        {
          name: "system_program";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "set_counter";
      docs: ["Set counter value (admin only, for fixing stuck states)"];
      discriminator: [98, 68, 192, 166, 115, 7, 171, 39];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "counter";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 97, 109, 101, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        {
          name: "authority";
          signer: true;
        },
      ];
      args: [
        {
          name: "new_value";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "BetEntry";
      discriminator: [32, 21, 144, 65, 176, 182, 3, 204];
    },
    {
      name: "GameConfig";
      discriminator: [45, 146, 146, 33, 170, 69, 96, 133];
    },
    {
      name: "GameCounter";
      discriminator: [117, 67, 148, 185, 138, 194, 249, 87];
    },
    {
      name: "GameRound";
      discriminator: [69, 45, 252, 31, 254, 31, 101, 146];
    },
    {
      name: "NetworkState";
      discriminator: [212, 237, 148, 56, 97, 245, 51, 169];
    },
  ];
  events: [
    {
      name: "BetPlaced";
      discriminator: [88, 88, 145, 226, 126, 206, 32, 0];
    },
    {
      name: "GameCleaned";
      discriminator: [69, 18, 9, 249, 93, 112, 186, 255];
    },
    {
      name: "GameCreated";
      discriminator: [218, 25, 150, 94, 177, 112, 96, 2];
    },
    {
      name: "GameInitialized";
      discriminator: [82, 221, 11, 2, 244, 52, 240, 250];
    },
    {
      name: "GameLocked";
      discriminator: [137, 134, 142, 42, 168, 51, 224, 76];
    },
    {
      name: "GameReset";
      discriminator: [171, 230, 62, 202, 158, 128, 127, 240];
    },
    {
      name: "WinnerSelected";
      discriminator: [245, 110, 152, 173, 193, 48, 133, 5];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "InvalidGameStatus";
      msg: "Invalid game status for this action";
    },
    {
      code: 6001;
      name: "Unauthorized";
      msg: "Unauthorized: only authority can perform this action";
    },
    {
      code: 6002;
      name: "BettingPhaseClosed";
      msg: "Betting phase is closed";
    },
    {
      code: 6003;
      name: "BetTooSmall";
      msg: "Bet amount is below minimum required";
    },
    {
      code: 6004;
      name: "BetTooLarge";
      msg: "Bet amount exceeds maximum allowed";
    },
    {
      code: 6005;
      name: "MaxPlayersReached";
      msg: "Maximum number of players reached";
    },
    {
      code: 6006;
      name: "PlayerNotFound";
      msg: "Player not found in current game";
    },
    {
      code: 6007;
      name: "RandomnessNotResolved";
      msg: "Switchboard randomness value is not yet available for the committed slot";
    },
    {
      code: 6008;
      name: "InvalidRandomnessAccount";
      msg: "The provided Switchboard randomness account is not valid for the current game round";
    },
    {
      code: 6009;
      name: "CommitSlotNotElapsed";
      msg: "The committed slot has not elapsed yet";
    },
    {
      code: 6010;
      name: "NotASpectator";
      msg: "A finalist cannot place a spectator bet";
    },
    {
      code: 6011;
      name: "FinalistNotFound";
      msg: "Target finalist not found";
    },
    {
      code: 6012;
      name: "InsufficientFunds";
      msg: "Insufficient funds for bet";
    },
    {
      code: 6013;
      name: "MathOverflow";
      msg: "Mathematical overflow occurred";
    },
    {
      code: 6014;
      name: "NoWinnerDetermined";
      msg: "No winner has been determined yet";
    },
    {
      code: 6015;
      name: "InvalidGameType";
      msg: "Invalid game type for this operation";
    },
    {
      code: 6016;
      name: "NoWinnerSet";
      msg: "No winner has been set";
    },
    {
      code: 6017;
      name: "NoFinalistsSet";
      msg: "No finalists have been set";
    },
    {
      code: 6018;
      name: "PayoutExceedsAvailableFunds";
      msg: "Payout amount exceeds available funds";
    },
    {
      code: 6019;
      name: "AlreadyClaimed";
      msg: "Winnings have already been claimed";
    },
    {
      code: 6020;
      name: "NoWinningsFound";
      msg: "No winnings found for this wallet";
    },
    {
      code: 6021;
      name: "HouseFeeAlreadyCollected";
      msg: "House fee has already been collected";
    },
    {
      code: 6022;
      name: "GameAlreadyReset";
      msg: "Game has already been reset";
    },
    {
      code: 6023;
      name: "InvalidVrfAccount";
      msg: "VRF account is invalid";
    },
    {
      code: 6024;
      name: "RandomnessNotFulfilled";
      msg: "Randomness not yet fulfilled";
    },
    {
      code: 6025;
      name: "VrfRequestFailed";
      msg: "VRF request failed";
    },
    {
      code: 6026;
      name: "InvalidVrfSeed";
      msg: "Invalid VRF seed";
    },
    {
      code: 6027;
      name: "InvalidWinnerAccount";
      msg: "Invalid winner account";
    },
    {
      code: 6028;
      name: "InvalidTreasury";
      msg: "Invalid treasury account";
    },
    {
      code: 6029;
      name: "NoPlayers";
      msg: "No players in game";
    },
    {
      code: 6030;
      name: "InvalidBetAmount";
      msg: "Invalid bet amount";
    },
    {
      code: 6031;
      name: "ArithmeticOverflow";
      msg: "Arithmetic overflow occurred";
    },
    {
      code: 6032;
      name: "EmergencyTimeNotElapsed";
      msg: "Emergency time threshold not yet elapsed";
    },
    {
      code: 6033;
      name: "NoFundsToRefund";
      msg: "No funds available to refund";
    },
    {
      code: 6034;
      name: "BettingWindowClosed";
      msg: "Betting window has closed";
    },
    {
      code: 6035;
      name: "BettingWindowStillOpen";
      msg: "Betting window is still open";
    },
    {
      code: 6036;
      name: "BetsLocked";
      msg: "Bets are locked during resolution";
    },
    {
      code: 6037;
      name: "CannotCleanupActiveGame";
      msg: "Cannot cleanup active or current game";
    },
    {
      code: 6038;
      name: "GameTooRecentToCleanup";
      msg: "Game is too recent to cleanup (must be older than 1 week)";
    },
    {
      code: 6039;
      name: "MaxBetsReached";
      msg: "Maximum number of bets reached (64 max)";
    },
    {
      code: 6040;
      name: "InvalidBetEntry";
      msg: "Invalid bet entry account";
    },
  ];
  types: [
    {
      name: "BetEntry";
      docs: [
        "Individual bet stored as separate PDA",
        'Seeds: [b"bet", game_round_id.to_le_bytes(), bet_index.to_le_bytes()]',
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "game_round_id";
            type: "u64";
          },
          {
            name: "bet_index";
            type: "u32";
          },
          {
            name: "wallet";
            type: "pubkey";
          },
          {
            name: "bet_amount";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "i64";
          },
          {
            name: "payout_collected";
            type: "bool";
          },
        ];
      };
    },
    {
      name: "BetPlaced";
      docs: ["Event emitted when a bet is placed"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "player";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "bet_count";
            type: "u8";
          },
          {
            name: "total_pot";
            type: "u64";
          },
          {
            name: "end_timestamp";
            type: "i64";
          },
          {
            name: "is_first_bet";
            type: "bool";
          },
          {
            name: "timestamp";
            type: "i64";
          },
          {
            name: "bet_index";
            type: "u32";
          },
        ];
      };
    },
    {
      name: "GameCleaned";
      docs: ["Event emitted when old game is cleaned up and closed"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "game_age_seconds";
            type: "i64";
          },
          {
            name: "rent_reclaimed";
            type: "u64";
          },
          {
            name: "had_unclaimed_prize";
            type: "bool";
          },
          {
            name: "unclaimed_amount";
            type: "u64";
          },
          {
            name: "crank_authority";
            type: "pubkey";
          },
          {
            name: "timestamp";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "GameConfig";
      docs: ["Global game configuration stored as singleton PDA", 'Seeds: [b"game_config"]'];
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "treasury";
            type: "pubkey";
          },
          {
            name: "house_fee_basis_points";
            type: "u16";
          },
          {
            name: "min_bet_lamports";
            type: "u64";
          },
          {
            name: "max_bet_lamports";
            type: "u64";
          },
          {
            name: "small_game_duration_config";
            type: {
              defined: {
                name: "GameDurationConfig";
              };
            };
          },
          {
            name: "bets_locked";
            type: "bool";
          },
          {
            name: "force";
            type: {
              array: ["u8", 32];
            };
          },
        ];
      };
    },
    {
      name: "GameCounter";
      docs: ["Global counter tracking current game round", 'Seeds: [b"game_counter"]'];
      type: {
        kind: "struct";
        fields: [
          {
            name: "current_round_id";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "GameCreated";
      docs: ["Event emitted when a new game is created (first bet)"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "initial_bet";
            type: "u64";
          },
          {
            name: "start_time";
            type: "i64";
          },
          {
            name: "end_time";
            type: "i64";
          },
          {
            name: "vrf_seed_used";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "next_vrf_seed";
            type: {
              array: ["u8", 32];
            };
          },
        ];
      };
    },
    {
      name: "GameDurationConfig";
      docs: ["Configuration for game durations"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "waiting_phase_duration";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "GameInitialized";
      docs: ["Event emitted when a new game round is initialized"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "start_timestamp";
            type: "i64";
          },
          {
            name: "end_timestamp";
            type: "i64";
          },
        ];
      };
    },
    {
      name: "GameLocked";
      docs: ["Event emitted when game is locked (betting window closes)"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "final_bet_count";
            type: "u8";
          },
          {
            name: "total_pot";
            type: "u64";
          },
          {
            name: "vrf_request_pubkey";
            type: "pubkey";
          },
        ];
      };
    },
    {
      name: "GameReset";
      docs: ["Event emitted when game is reset for next round"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "old_round_id";
            type: "u64";
          },
          {
            name: "new_round_id";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "GameRound";
      docs: [
        "Current game round state stored as PDA per round",
        'Seeds: [b"game_round", round_id.to_le_bytes()]',
        "Bets are stored both as separate PDAs AND in arrays for efficient winner selection",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "GameStatus";
              };
            };
          },
          {
            name: "start_timestamp";
            type: "i64";
          },
          {
            name: "end_timestamp";
            type: "i64";
          },
          {
            name: "bet_count";
            type: "u32";
          },
          {
            name: "total_pot";
            type: "u64";
          },
          {
            name: "bet_amounts";
            type: {
              array: ["u64", 64];
            };
          },
          {
            name: "winner";
            type: "pubkey";
          },
          {
            name: "winning_bet_index";
            type: "u32";
          },
          {
            name: "winner_prize_unclaimed";
            type: "u64";
          },
          {
            name: "house_fee_unclaimed";
            type: "u64";
          },
          {
            name: "vrf_request_pubkey";
            type: "pubkey";
          },
          {
            name: "vrf_seed";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "randomness_fulfilled";
            type: "bool";
          },
        ];
      };
    },
    {
      name: "GameStatus";
      docs: ["Game status enumeration"];
      repr: {
        kind: "rust";
      };
      type: {
        kind: "enum";
        variants: [
          {
            name: "Waiting";
          },
          {
            name: "AwaitingWinnerRandomness";
          },
          {
            name: "Finished";
          },
        ];
      };
    },
    {
      name: "NetworkConfiguration";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "treasury";
            type: "pubkey";
          },
          {
            name: "request_fee";
            type: "u64";
          },
          {
            name: "fulfillment_authorities";
            type: {
              vec: "pubkey";
            };
          },
          {
            name: "token_fee_config";
            type: {
              option: {
                defined: {
                  name: "OraoTokenFeeConfig";
                };
              };
            };
          },
        ];
      };
    },
    {
      name: "NetworkState";
      type: {
        kind: "struct";
        fields: [
          {
            name: "config";
            type: {
              defined: {
                name: "NetworkConfiguration";
              };
            };
          },
          {
            name: "num_received";
            docs: ["Total number of received requests."];
            type: "u64";
          },
        ];
      };
    },
    {
      name: "OraoTokenFeeConfig";
      type: {
        kind: "struct";
        fields: [
          {
            name: "mint";
            docs: ["ORAO token mint address."];
            type: "pubkey";
          },
          {
            name: "treasury";
            docs: ["ORAO token treasury account."];
            type: "pubkey";
          },
          {
            name: "fee";
            docs: ["Fee in ORAO SPL token smallest units."];
            type: "u64";
          },
        ];
      };
    },
    {
      name: "WinnerSelected";
      docs: ["Event emitted when winner is determined"];
      type: {
        kind: "struct";
        fields: [
          {
            name: "round_id";
            type: "u64";
          },
          {
            name: "winner";
            type: "pubkey";
          },
          {
            name: "winning_bet_index";
            type: "u32";
          },
          {
            name: "winning_bet_amount";
            type: "u64";
          },
          {
            name: "total_pot";
            type: "u64";
          },
          {
            name: "house_fee";
            type: "u64";
          },
          {
            name: "winner_payout";
            type: "u64";
          },
          {
            name: "win_probability_bps";
            type: "u64";
          },
          {
            name: "total_bets";
            type: "u32";
          },
          {
            name: "auto_transfer_success";
            type: "bool";
          },
          {
            name: "house_fee_transfer_success";
            type: "bool";
          },
          {
            name: "vrf_randomness";
            type: "u64";
          },
          {
            name: "vrf_seed_hex";
            type: "string";
          },
          {
            name: "timestamp";
            type: "i64";
          },
        ];
      };
    },
  ];
};
