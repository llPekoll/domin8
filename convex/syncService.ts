/**
 * Sync Service - Blockchain to Convex Database Sync
 *
 * This service is modeled after risk.fun's worker pattern:
 * 1. syncActiveGames() - Fetches active game from blockchain and syncs to DB
 * 2. processEndedGames() - Finds games past endDate and schedules endGame action
 *
 * Runs every 5 seconds via cron
 */
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

/**
 * Main sync action - called by cron every 5 seconds
 * Syncs blockchain state to Convex database
 */
export const syncBlockchainState = internalAction({
  handler: async (ctx) => {
    console.log("\n[Sync Service] Running blockchain sync...");

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      // 1. Sync active game to database
      console.log("ada");
      await syncActiveGame(ctx, solanaClient);
      console.log("cabrimol");

      // 2. Check if any games need to be ended
      await processEndedGames(ctx, solanaClient);

      console.log("[Sync Service] Sync complete");
    } catch (error) {
      console.error("[Sync Service] Error:", error);
    }
  },
});

/**
 * Sync active game from blockchain to Convex database
 * Similar to risk.fun's syncActiveGames()
 */
async function syncActiveGame(ctx: any, solanaClient: SolanaClient) {
  try {
    // Fetch active game from blockchain
    console.log("cabrimol");
    const activeGame = await solanaClient.getActiveGame();
    console.log({ activeGame });

    if (!activeGame) {
      console.log("[Sync Service] No active game on blockchain");
      return;
    }

    console.log(
      `[Sync Service] Found active game: round ${activeGame.roundId}, status: ${activeGame.status}`
    );

    // Upsert game state to database
    await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
      gameRound: activeGame,
    });

    console.log(`[Sync Service] Synced game round ${activeGame.roundId} to database`);
  } catch (error) {
    console.error("[Sync Service] Error syncing active game:", error);
  }
}

/**
 * Check for games that have ended and need to be processed
 * Similar to risk.fun's processEndedGames()
 */
async function processEndedGames(ctx: any, solanaClient: SolanaClient) {
  try {
    // Fetch active game
    const activeGame = await solanaClient.getActiveGame();

    if (!activeGame) {
      return; // No active game
    }

    // Check if game is still open (status: 0)
    if (activeGame.status !== 0) {
      console.log(
        `[Sync Service] Game ${activeGame.roundId} already closed (status: ${activeGame.status})`
      );
      return;
    }

    // Check if game has ended (current time >= endDate)
    const now = Math.floor(Date.now() / 1000);
    const endTimestamp = activeGame.endTimestamp || activeGame.endDate;

    if (now < endTimestamp) {
      const remaining = endTimestamp - now;
      console.log(
        `[Sync Service] Game ${activeGame.roundId} still active (${remaining}s remaining)`
      );
      return;
    }

    console.log(`[Sync Service] Game ${activeGame.roundId} has ended, scheduling endGame action`);

    // Check if endGame action already scheduled
    const alreadyScheduled = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
      roundId: activeGame.roundId,
      action: "end_game",
    });

    if (alreadyScheduled) {
      console.log(`[Sync Service] endGame already scheduled for round ${activeGame.roundId}`);
      return;
    }

    // Schedule endGame action
    await ctx.scheduler.runAfter(
      0, // Execute immediately
      internal.gameScheduler.executeEndGame,
      { roundId: activeGame.roundId }
    );

    console.log(`[Sync Service] Scheduled endGame for round ${activeGame.roundId}`);
  } catch (error) {
    console.error("[Sync Service] Error processing ended games:", error);
  }
}
