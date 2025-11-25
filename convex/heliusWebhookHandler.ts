/**
 * Helius Webhook Transaction Processor
 *
 * Fetches game account data from blockchain and updates gameRoundStates
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("7bHYHZVu7kWRU4xf7DWypCvefWvuDqW1CqVfsuwdGiR7");

/**
 * Get Solana connection
 */
function getConnection(): Connection {
  const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT!;
  return new Connection(rpcEndpoint, "confirmed");
}

/**
 * Derive game PDA for a given round ID
 */
function getGamePda(roundId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("domin8_game"), Buffer.from(roundId.toString().padStart(8, "0"))],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Parse game account data (raw buffer parsing without Anchor)
 * Returns the essential game state fields we need
 */
async function fetchGameAccount(roundId: number) {
  const connection = getConnection();
  const gamePda = getGamePda(roundId);

  const accountInfo = await connection.getAccountInfo(gamePda);
  if (!accountInfo) {
    throw new Error(`Game account not found for round ${roundId}`);
  }

  const data = accountInfo.data;

  // Skip the 8-byte discriminator
  let offset = 8;

  // Read game_round (u64 - 8 bytes)
  const gameRound = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // Read start_date (i64 - 8 bytes)
  const startDate = Number(data.readBigInt64LE(offset));
  offset += 8;

  // Read end_date (i64 - 8 bytes)
  const endDate = Number(data.readBigInt64LE(offset));
  offset += 8;

  // Read total_deposit (u64 - 8 bytes)
  const totalDeposit = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // Read rand (u64 - 8 bytes)
  const rand = data.readBigUInt64LE(offset);
  offset += 8;

  // Read map (u8 - 1 byte)
  const map = data.readUInt8(offset);
  offset += 1;

  // Read user_count (u64 - 8 bytes)
  const userCount = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // Skip force (32 bytes)
  offset += 32;

  // Read status (u8 - 1 byte)
  const status = data.readUInt8(offset);
  offset += 1;

  // Read vrf_requested (bool - 1 byte)
  const vrfRequested = data.readUInt8(offset) !== 0;
  offset += 1;

  // Read winner (Option<Pubkey> - 1 byte discriminator + 32 bytes if Some)
  const hasWinner = data.readUInt8(offset);
  offset += 1;
  let winner: string | null = null;
  if (hasWinner === 1) {
    const winnerPubkey = new PublicKey(data.subarray(offset, offset + 32));
    winner = winnerPubkey.toString();
    offset += 32;
  }

  // Read winner_prize (u64 - 8 bytes)
  const winnerPrize = Number(data.readBigUInt64LE(offset));
  offset += 8;

  // Read winning_bet_index (Option<u64> - 1 byte discriminator + 8 bytes if Some)
  const hasWinningBetIndex = data.readUInt8(offset);
  offset += 1;
  let winningBetIndex: number | undefined = undefined;
  if (hasWinningBetIndex === 1) {
    winningBetIndex = Number(data.readBigUInt64LE(offset));
    offset += 8;
  }

  // Read wallets Vec length (u32 - 4 bytes)
  const walletsLen = data.readUInt32LE(offset);
  offset += 4;

  // Skip wallets for now
  offset += walletsLen * 32;

  // Read bets Vec length (u32 - 4 bytes)
  const betsLen = data.readUInt32LE(offset);
  offset += 4;

  // Parse bets
  const betAmounts: number[] = [];
  const betSkin: number[] = [];
  const betPosition: [number, number][] = [];

  for (let i = 0; i < betsLen; i++) {
    // wallet_index (u16 - 2 bytes)
    const walletIndex = data.readUInt16LE(offset);
    offset += 2;

    // amount (u64 - 8 bytes)
    const amount = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // skin (u8 - 1 byte)
    const skin = data.readUInt8(offset);
    offset += 1;

    // position (2 x u16 - 4 bytes)
    const posX = data.readUInt16LE(offset);
    offset += 2;
    const posY = data.readUInt16LE(offset);
    offset += 2;

    betAmounts.push(amount);
    betSkin.push(skin);
    betPosition.push([posX, posY]);
  }

  return {
    gameRound,
    startDate,
    endDate,
    totalDeposit,
    rand,
    map,
    userCount,
    status,
    vrfRequested,
    winner,
    winnerPrize,
    winningBetIndex,
    betCount: betsLen,
    betAmounts,
    betSkin,
    betPosition,
  };
}

/**
 * Process a transaction from Helius webhook
 *
 * This is an ACTION (not mutation) because it needs to fetch data from blockchain using Node.js
 * It then calls a mutation to update the database
 */
export const processTransaction = internalAction({
  args: {
    signature: v.string(),
    slot: v.number(),
    timestamp: v.number(),
    events: v.any(), // Helius event data (optional)
    accountData: v.any(), // Helius account data (optional)
  },
  handler: async (ctx, args) => {
    try {
      console.log(`[Webhook Processor] Processing transaction: ${args.signature}`);

      // Parse events to extract round ID
      let roundId: number | null = null;

      // Try to extract round ID from Helius events
      if (args.events && typeof args.events === "object") {
        // Check for GameCreated event
        if ("GameCreated" in args.events) {
          roundId = args.events.GameCreated?.round_id || args.events.GameCreated?.roundId;
        }

        // Check for other event types that might contain round_id
        for (const eventKey of Object.keys(args.events)) {
          const event = args.events[eventKey];
          if (event && (event.round_id || event.roundId)) {
            roundId = event.round_id || event.roundId;
            break;
          }
        }
      }

      // If we still don't have a round ID, we can't process this transaction
      if (!roundId) {
        console.error("[Webhook Processor] No round ID found in transaction", args.signature);
        return { success: false, error: "No round ID found" };
      }

      console.log(`[Webhook Processor] Processing round ${roundId}`);

      // Fetch game account from blockchain
      let gameAccount;
      try {
        gameAccount = await fetchGameAccount(roundId);
      } catch (err) {
        console.error(
          `[Webhook Processor] Could not fetch game account for round ${roundId}:`,
          err
        );
        return { success: false, error: "Game account not found" };
      }

      // Convert blockchain state to database format
      const status =
        gameAccount.status === 0 ? "waiting" : gameAccount.status === 1 ? "open" : "closed";

      // Call mutation to update database
      await ctx.runMutation(internal.heliusWebhookMutations.updateGameRound, {
        roundId,
        status,
        startTimestamp: gameAccount.startDate,
        endTimestamp: gameAccount.endDate,
        mapId: gameAccount.map,
        betCount: gameAccount.betCount,
        betAmounts: gameAccount.betAmounts,
        betSkin: gameAccount.betSkin,
        betPosition: gameAccount.betPosition,
        totalPot: gameAccount.totalDeposit,
        winner: gameAccount.winner,
        winningBetIndex: gameAccount.winningBetIndex,
      });

      console.log(`[Webhook Processor] ✅ Processed round ${roundId} (${status})`);

      return { success: true, roundId, status };
    } catch (error) {
      console.error("[Webhook Processor] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Manually trigger processing of a specific round
 * Useful for debugging or recovering from missed webhooks
 */
export const manualProcessRound = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const { roundId } = args;
      console.log(`[Manual Processor] Processing round ${roundId}`);

      // Fetch game account from blockchain
      let gameAccount;
      try {
        gameAccount = await fetchGameAccount(roundId);
      } catch (err) {
        console.error(
          `[Manual Processor] Could not fetch game account for round ${roundId}:`,
          err
        );
        return { success: false, error: "Game account not found" };
      }

      // Convert blockchain state to database format
      const status =
        gameAccount.status === 0 ? "waiting" : gameAccount.status === 1 ? "open" : "closed";

      // Call mutation to update database
      await ctx.runMutation(internal.heliusWebhookMutations.updateGameRound, {
        roundId,
        status,
        startTimestamp: gameAccount.startDate,
        endTimestamp: gameAccount.endDate,
        mapId: gameAccount.map,
        betCount: gameAccount.betCount,
        betAmounts: gameAccount.betAmounts,
        betSkin: gameAccount.betSkin,
        betPosition: gameAccount.betPosition,
        totalPot: gameAccount.totalDeposit,
        winner: gameAccount.winner,
        winningBetIndex: gameAccount.winningBetIndex,
      });

      console.log(`[Manual Processor] ✅ Processed round ${roundId} (${status})`);

      return { success: true, roundId, status };
    } catch (error) {
      console.error("[Manual Processor] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
