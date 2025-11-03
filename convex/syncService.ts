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
import { v } from "convex/values";
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

      // Fetch active game from blockchain
      console.log("cabrimol");
      const activeGame = await solanaClient.getActiveGame();
      console.log({ activeGame });

      // 1. Sync active game to database
      await syncActiveGame(ctx, activeGame);

      // 2. Check if the active game needs to be ended
      await processEndedGames(ctx, activeGame);

      // 3. Check for past ended games that need to be processed
      await processPastEndedGames(ctx);

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
async function syncActiveGame(ctx: any, activeGame: any) {
  try {

    if (!activeGame) {
      console.log("[Sync Service] No active game on blockchain");
      return;
    }

    console.log(
      `[Sync Service] Found active game: round ${activeGame.gameRound}, status: ${activeGame.status}`
    );

    // Upsert game state to database
    await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
      gameRound: {
        roundId: activeGame.gameRound,
        status: activeGame.status,
        startTimestamp: activeGame.startDate,
        endTimestamp: activeGame.endDate,
        map: activeGame.map,
        betCount: activeGame.bets?.length,
        betAmounts: activeGame.bets?.map((b: any) => b.amount),
        betSkin: activeGame.bets?.map((b: any) => b.skin),
        betPosition: activeGame.bets?.map((b: any) => b.position),
        totalPot: activeGame.totalDeposit,
        winner: activeGame.winner,
        winningBetIndex: activeGame.winningBetIndex ?? undefined,
        prizeSent: activeGame.prizeSent,
      },
    });

    console.log(`[Sync Service] Synced game round ${activeGame.gameRound} to database`);
  } catch (error) {
    console.error("[Sync Service] Error syncing active game:", error);
  }
}

/**
 * Check if the active game has ended and needs to be processed
 * This only checks the current active_game PDA
 */
async function processEndedGames(ctx: any, activeGame: any) {
  try {
    if (!activeGame) {
      console.log("[Sync Service] No active game on blockchain");
      return;
    }

    console.log(
      `[Sync Service] Found active game: round ${activeGame.gameRound}, status: ${activeGame.status}`
    );

    // Check if game is still open (status: 0)
    if (activeGame.status !== 0) {
      console.log(
        `[Sync Service] Game ${activeGame.gameRound} already closed (status: ${activeGame.status})`
      );
      return;
    }

    // Check if game has ended (current time >= endDate)
    const now = Math.floor(Date.now() / 1000);
    const endTimestamp = activeGame.endDate;

    if (now < endTimestamp) {
      const remaining = endTimestamp - now;
      console.log(
        `[Sync Service] Game ${activeGame.gameRound} still active (${remaining}s remaining)`
      );
      return;
    }

    console.log(`[Sync Service] Game ${activeGame.gameRound} has ended, scheduling endGame action`);

    // Check if endGame action already scheduled
    const alreadyScheduled = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
      roundId: activeGame.gameRound,
      action: "end_game",
    });

    if (alreadyScheduled) {
      console.log(`[Sync Service] endGame already scheduled for round ${activeGame.gameRound}`);
      return;
    }

    // Schedule endGame action
    const jobId = await ctx.scheduler.runAfter(
      0, // Execute immediately
      internal.gameScheduler.executeEndGame,
      { roundId: activeGame.gameRound }
    );

    // Upsert job to database for tracking (avoid duplicates)
    await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
      jobId: jobId.toString(),
      roundId: activeGame.gameRound,
      action: "end_game",
      scheduledTime: now,
    });

    console.log(`[Sync Service] Scheduled endGame for round ${activeGame.gameRound} (jobId: ${jobId})`);
  } catch (error) {
    console.error("[Sync Service] Error processing ended games:", error);
  }
}

/**
 * Check for finished games that need prize distribution
 * This scans the gameRoundStates table to find games that:
 * 1. Are in "finished" status (closed)
 * 2. Have prizeSent = false (prize not yet sent)
 * 3. Haven't been scheduled for prize distribution yet
 *
 * Rate limiting: Only processes last 10 games with 500ms delay between checks
 */
async function processPastEndedGames(ctx: any) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Query database for "finished" games that need prize distribution
    const finishedGames = await ctx.runQuery(internal.syncServiceMutations.getFinishedGamesNeedingPrize, {
      limit: 5, // Only check last 5 games for rate limiting
    });

    if (finishedGames.length === 0) {
      console.log("[Sync Service] No finished games needing prize distribution found in database");
      return;
    }

    console.log(`[Sync Service] Found ${finishedGames.length} finished games needing prize distribution`);

    // Process each finished game with rate limiting
    for (const game of finishedGames) {
      try {
        console.log(
          `[Sync Service] Game ${game.roundId} needs prize distribution (winner: ${game.winner})`
        );

        // Check if sendPrize action already scheduled
        const alreadyScheduled = await ctx.runQuery(
          internal.gameSchedulerMutations.isActionScheduled,
          {
            roundId: game.roundId,
            action: "send_prize",
          }
        );

        if (alreadyScheduled) {
          console.log(`[Sync Service] sendPrize already scheduled for round ${game.roundId}`);
          continue;
        }

        // Schedule sendPrize action
        const jobId = await ctx.scheduler.runAfter(
          0, // Execute immediately
          internal.gameScheduler.executeSendPrize,
          { roundId: game.roundId }
        );

        // Upsert job to database for tracking
        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: jobId.toString(),
          roundId: game.roundId,
          action: "send_prize",
          scheduledTime: now,
        });

        console.log(
          `[Sync Service] Scheduled sendPrize for round ${game.roundId} (jobId: ${jobId})`
        );

        // Rate limiting: 500ms delay between checks
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[Sync Service] Error processing finished game ${game.roundId}:`, error);
        // Continue with next game
      }
    }
  } catch (error) {
    console.error("[Sync Service] Error in processPastEndedGames:", error);
  }
}

/**
 * Manual bulk prize distribution for historical games
 * This is a manually-triggered action to process prize distribution for older game rounds
 *
 * Use this for:
 * - Backfilling prize distribution for historical games
 * - Recovery after system downtime
 * - Batch processing specific round ranges
 *
 * @param startRound - Starting round ID (inclusive)
 * @param count - Number of rounds to process
 *
 * Rate limiting: 500ms delay between blockchain checks to avoid RPC rate limits
 */
export const bulkSendPrizes = internalAction({
  args: {
    startRound: v.number(),
    count: v.number(),
  },
  handler: async (ctx, { startRound, count }) => {
    console.log(`\n[Bulk Prize Distribution] Starting bulk prize send from round ${startRound}, count: ${count}`);

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      const now = Math.floor(Date.now() / 1000);

      const results = {
        processed: 0,
        scheduled: 0,
        alreadySent: 0,
        notFinished: 0,
        notFound: 0,
        errors: [] as string[],
      };

      // Process each round in the range
      for (let roundId = startRound; roundId < startRound + count; roundId++) {
        try {
          console.log(`\n[Bulk Prize] Checking round ${roundId}...`);

          // Fetch game from blockchain
          const blockchainGame = await solanaClient.getGameRound(roundId);

          if (!blockchainGame) {
            console.log(`[Bulk Prize] Round ${roundId}: Not found on blockchain`);
            results.notFound++;
            // Rate limiting even for not found
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          results.processed++;

          // Check if game is finished
          if (blockchainGame.status !== 1) {
            console.log(`[Bulk Prize] Round ${roundId}: Not finished yet (status: ${blockchainGame.status})`);
            results.notFinished++;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          // Check if prize already sent
          if (blockchainGame.winnerPrize === 0) {
            console.log(`[Bulk Prize] Round ${roundId}: Prize already sent`);
            results.alreadySent++;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          // Prize needs to be sent!
          console.log(
            `[Bulk Prize] Round ${roundId}: Found unclaimed prize: ${blockchainGame.winnerPrize} lamports to ${blockchainGame.winner}`
          );

          // Check if sendPrize action already scheduled
          const alreadyScheduled = await ctx.runQuery(
            internal.gameSchedulerMutations.isActionScheduled,
            {
              roundId,
              action: "send_prize",
            }
          );

          if (alreadyScheduled) {
            console.log(`[Bulk Prize] Round ${roundId}: Already scheduled, skipping`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          // Schedule sendPrize action
          const jobId = await ctx.scheduler.runAfter(
            0, // Execute immediately
            internal.gameScheduler.executeSendPrize,
            { roundId }
          );

          // Save job to database
          await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
            jobId: jobId.toString(),
            roundId,
            action: "send_prize",
            scheduledTime: now,
          });

          console.log(`[Bulk Prize] Round ${roundId}: ✅ Scheduled prize distribution (jobId: ${jobId})`);
          results.scheduled++;

          // Rate limiting: 500ms delay between blockchain checks
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          const errorMsg = `Round ${roundId}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[Bulk Prize] Error processing round ${roundId}:`, error);
          results.errors.push(errorMsg);
          // Continue with next round even on error
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Summary
      console.log(`\n[Bulk Prize Distribution] SUMMARY:`);
      console.log(`  Total processed: ${results.processed}`);
      console.log(`  Scheduled: ${results.scheduled}`);
      console.log(`  Already sent: ${results.alreadySent}`);
      console.log(`  Not finished: ${results.notFinished}`);
      console.log(`  Not found: ${results.notFound}`);
      console.log(`  Errors: ${results.errors.length}`);

      if (results.errors.length > 0) {
        console.log(`\n[Bulk Prize Distribution] Errors:`);
        results.errors.forEach((err) => console.log(`  - ${err}`));
      }

      console.log(`\n[Bulk Prize Distribution] Complete`);

      return results;
    } catch (error) {
      console.error("[Bulk Prize Distribution] Fatal error:", error);
      throw error;
    }
  },
});
