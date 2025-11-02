/**
 * Sync Service - Blockchain to Convex Database Sync
 *
 * This service is modeled after risk.fun's worker pattern:
 * 1. syncActiveGame() - Fetches active game from blockchain and syncs to DB
 * 2. processEndedGames() - Checks if active game has ended and schedules endGame action
 * 3. processPastEndedGames() - Scans DB for historical games past endDate and schedules endGame action
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
      await syncActiveGame(ctx, solanaClient);

      // 2. Check if the active game needs to be ended
      await processEndedGames(ctx, solanaClient);

      // 3. Check for past ended games that need to be processed
      await processPastEndedGames(ctx, solanaClient);

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
 * Check if the active game has ended and needs to be processed
 * This only checks the current active_game PDA
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
    const jobId = await ctx.scheduler.runAfter(
      0, // Execute immediately
      internal.gameScheduler.executeEndGame,
      { roundId: activeGame.roundId }
    );

    // Upsert job to database for tracking (avoid duplicates)
    await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
      jobId: jobId.toString(),
      roundId: activeGame.roundId,
      action: "end_game",
      scheduledTime: now,
    });

    console.log(`[Sync Service] Scheduled endGame for round ${activeGame.roundId} (jobId: ${jobId})`);
  } catch (error) {
    console.error("[Sync Service] Error processing ended games:", error);
  }
}

/**
 * Check for past ended games that need to be processed
 * This scans historical game rounds in the database to find games that:
 * 1. Are in "waiting" status (open)
 * 2. Have passed their endTimestamp
 * 3. Haven't been scheduled for ending yet
 * 
 * Similar to risk.fun's processEndedGames() but for historical games
 */
async function processPastEndedGames(ctx: any, solanaClient: SolanaClient) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Query database for all "waiting" games that have passed their end time
    const endedGames = await ctx.runQuery(internal.syncServiceMutations.getEndedWaitingGames, {
      currentTime: now,
    });

    if (endedGames.length === 0) {
      console.log("[Sync Service] No past ended games found in database");
      return;
    }

    console.log(`[Sync Service] Found ${endedGames.length} past ended games to process`);

    // Process each ended game
    for (const game of endedGames) {
      try {
        // Fetch the game from blockchain to verify it still exists and check status
        const blockchainGame = await solanaClient.getGameRound(game.roundId);

        if (!blockchainGame) {
          console.log(`[Sync Service] Game ${game.roundId} not found on blockchain, skipping`);
          continue;
        }

        // Skip if already closed on blockchain
        if (blockchainGame.status !== 0) {
          console.log(
            `[Sync Service] Game ${game.roundId} already closed on blockchain (status: ${blockchainGame.status})`
          );
          // Sync the closed state to database
          await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
            gameRound: blockchainGame,
          });
          continue;
        }

        // Check if endGame action already scheduled
        const alreadyScheduled = await ctx.runQuery(
          internal.gameSchedulerMutations.isActionScheduled,
          {
            roundId: game.roundId,
            action: "end_game",
          }
        );

        if (alreadyScheduled) {
          console.log(`[Sync Service] endGame already scheduled for round ${game.roundId}`);
          continue;
        }

        console.log(
          `[Sync Service] Game ${game.roundId} ended ${now - game.endTimestamp}s ago, scheduling endGame action`
        );

        // Schedule endGame action
        const jobId = await ctx.scheduler.runAfter(
          0, // Execute immediately
          internal.gameScheduler.executeEndGame,
          { roundId: game.roundId }
        );

        // Upsert job to database for tracking
        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: jobId.toString(),
          roundId: game.roundId,
          action: "end_game",
          scheduledTime: now,
        });

        console.log(
          `[Sync Service] Scheduled endGame for past round ${game.roundId} (jobId: ${jobId})`
        );
      } catch (error) {
        console.error(`[Sync Service] Error processing past game ${game.roundId}:`, error);
        // Continue with next game
      }
    }
  } catch (error) {
    console.error("[Sync Service] Error in processPastEndedGames:", error);
  }
}
