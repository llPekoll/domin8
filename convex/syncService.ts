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
import { GAME_STATUS, GAME_TIMING } from "./constants";

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
 * Schedule endGame action for a specific round
 * Checks if already scheduled and calculates proper delay with blockchain clock buffer
 */
async function scheduleEndGameAction(ctx: any, roundId: number, endTimestamp: number) {
  try {
    // Check if endGame action already scheduled
    const alreadyScheduled = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
      roundId,
      action: "end_game",
    });

    if (alreadyScheduled) {
      console.log(`[Sync Service] endGame already scheduled for round ${roundId}`);
      return;
    }

    // Calculate delay: schedule for endTimestamp + buffer
    const now = Math.floor(Date.now() / 1000);
    const targetTime = endTimestamp + GAME_TIMING.BLOCKCHAIN_CLOCK_BUFFER;
    const delayMs = Math.max(0, (targetTime - now) * 1000);

    console.log(
      `[Sync Service] Scheduling endGame for round ${roundId} at ${new Date(targetTime * 1000).toISOString()} (${delayMs}ms from now)`
    );

    // Schedule endGame action for endTimestamp + 1 second
    const jobId = await ctx.scheduler.runAfter(delayMs, internal.gameScheduler.executeEndGame, {
      roundId,
    });

    // Upsert job to database for tracking (avoid duplicates)
    await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
      jobId: jobId.toString(),
      roundId,
      action: "end_game",
      scheduledTime: targetTime,
    });

    console.log(`[Sync Service] Scheduled endGame for round ${roundId} (jobId: ${jobId})`);
  } catch (error) {
    console.error(`[Sync Service] Error scheduling endGame for round ${roundId}:`, error);
    throw error;
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

    await scheduleEndGameAction(ctx, activeGame.gameRound, activeGame.endDate);
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
    const finishedGames = await ctx.runQuery(
      internal.syncServiceMutations.getFinishedGamesNeedingPrize,
      {
        limit: 5, // Only check last 5 games for rate limiting
      }
    );

    if (finishedGames.length === 0) {
      console.log("[Sync Service] No finished games needing prize distribution found in database");
      return;
    }

    console.log(
      `[Sync Service] Found ${finishedGames.length} finished games needing prize distribution`
    );

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
    console.log(
      `\n[Bulk Prize Distribution] Starting bulk prize send from round ${startRound}, count: ${count}`
    );

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
            console.log(
              `[Bulk Prize] Round ${roundId}: Not finished yet (status: ${blockchainGame.status})`
            );
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

          console.log(
            `[Bulk Prize] Round ${roundId}: ✅ Scheduled prize distribution (jobId: ${jobId})`
          );
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

// GAME_STATUS imported from ./constants

/**
 * MAIN GAME LOOP CRON - Primary scheduler for game progression
 *
 * Runs every 60 seconds (matching betting round duration).
 * Uses blockchain state as source of truth via SolanaClient.getActiveGame().
 *
 * Logic:
 * 1. Fetch active game PDA from blockchain
 * 2. If status is OPEN (0) and endTimestamp set → schedule precise jobs if not already scheduled
 * 3. If status is OPEN (0) and end_date passed → execute end_game immediately (recovery)
 * 4. If status is CLOSED (1) and winnerPrize > 0 → schedule send_prize
 * 5. If status is CLOSED (1) and winnerPrize = 0 → schedule create_game
 * 6. If no active game and system unlocked → create new game
 *
 * All operations check for existing scheduled jobs to avoid duplicates.
 */
export const checkAndEndOpenGames = internalAction({
  handler: async (ctx) => {
    console.log("\n[Game Loop] Running game state check...");

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      const now = Math.floor(Date.now() / 1000);

      // 1. Fetch active game from blockchain (source of truth)
      const activeGame = await solanaClient.getActiveGame();
      const config = await solanaClient.getGameConfig();

      if (!config) {
        console.log("[Game Loop] Config not found");
        return { checked: true, action: "none", reason: "no_config" };
      }

      console.log(`[Game Loop] Config: lock=${config.lock}, gameRound=${config.gameRound}`);

      // 2. No active game - check if we should create one
      if (!activeGame) {
        console.log("[Game Loop] No active game found on blockchain");

        if (!config.lock) {
          // Check if create_game already scheduled
          const alreadyScheduled = await ctx.runQuery(
            internal.gameSchedulerMutations.isActionScheduled,
            { roundId: config.gameRound, action: "create_game" }
          );

          if (alreadyScheduled) {
            console.log(`[Game Loop] create_game already scheduled for round ${config.gameRound}`);
            return { checked: true, action: "none", reason: "already_scheduled" };
          }

          console.log(`[Game Loop] System unlocked, creating game round ${config.gameRound}...`);

          const jobId = await ctx.scheduler.runAfter(
            0,
            internal.gameScheduler.executeCreateGameRound,
            {}
          );

          await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
            jobId: jobId.toString(),
            roundId: config.gameRound,
            action: "create_game",
            scheduledTime: now,
          });

          return { checked: true, action: "create_game", roundId: config.gameRound };
        }

        return { checked: true, action: "none", reason: "system_locked" };
      }

      console.log(`[Game Loop] Active game:`, {
        roundId: activeGame.gameRound,
        status: activeGame.status,
        betCount: activeGame.bets?.length || 0,
        endDate: activeGame.endDate ? new Date(activeGame.endDate * 1000).toISOString() : "not set",
        winner: activeGame.winner,
        winnerPrize: activeGame.winnerPrize,
      });

      // 3. Game is WAITING (status=2) - no bets yet, skip
      if (activeGame.status === GAME_STATUS.WAITING) {
        console.log(`[Game Loop] Game ${activeGame.gameRound} is WAITING for first bet`);
        return { checked: true, action: "none", reason: "waiting_for_bets" };
      }

      // 4. Game is OPEN (status=0) - schedule jobs or execute if expired
      if (activeGame.status === GAME_STATUS.OPEN) {
        // Check if end_game already scheduled
        const endGameScheduled = await ctx.runQuery(
          internal.gameSchedulerMutations.isActionScheduled,
          { roundId: activeGame.gameRound, action: "end_game" }
        );

        if (endGameScheduled) {
          const remaining = Math.max(0, activeGame.endDate + GAME_TIMING.BLOCKCHAIN_CLOCK_BUFFER - now);
          console.log(`[Game Loop] Jobs already scheduled for round ${activeGame.gameRound}, ${remaining}s remaining`);
          return { checked: true, action: "none", reason: "already_scheduled", remainingSeconds: remaining };
        }

        // Jobs not scheduled yet - schedule the entire chain
        const endTime = activeGame.endDate + GAME_TIMING.BLOCKCHAIN_CLOCK_BUFFER;
        const endGameDelayMs = Math.max(0, (endTime - now) * 1000);
        const sendPrizeDelayMs = endGameDelayMs + GAME_TIMING.SEND_PRIZE_DELAY;
        const createGameDelayMs = sendPrizeDelayMs + GAME_TIMING.CREATE_GAME_DELAY;

        console.log(`[Game Loop] Scheduling job chain for round ${activeGame.gameRound}:`);
        console.log(`  - end_game in ${Math.round(endGameDelayMs / 1000)}s`);
        console.log(`  - send_prize in ${Math.round(sendPrizeDelayMs / 1000)}s`);
        console.log(`  - create_game in ${Math.round(createGameDelayMs / 1000)}s`);

        // Schedule end_game
        const endGameJobId = await ctx.scheduler.runAfter(
          endGameDelayMs,
          internal.gameScheduler.executeEndGame,
          { roundId: activeGame.gameRound }
        );

        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: endGameJobId.toString(),
          roundId: activeGame.gameRound,
          action: "end_game",
          scheduledTime: endTime,
        });

        // Schedule send_prize
        const sendPrizeJobId = await ctx.scheduler.runAfter(
          sendPrizeDelayMs,
          internal.gameScheduler.executeSendPrize,
          { roundId: activeGame.gameRound }
        );

        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: sendPrizeJobId.toString(),
          roundId: activeGame.gameRound,
          action: "send_prize",
          scheduledTime: endTime + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
        });

        // Schedule create_game (next round)
        const createGameJobId = await ctx.scheduler.runAfter(
          createGameDelayMs,
          internal.gameScheduler.executeCreateGameRound,
          {}
        );

        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: createGameJobId.toString(),
          roundId: activeGame.gameRound + 1,
          action: "create_game",
          scheduledTime: endTime + (GAME_TIMING.SEND_PRIZE_DELAY + GAME_TIMING.CREATE_GAME_DELAY) / 1000,
        });

        console.log(`[Game Loop] ✅ All jobs scheduled for round ${activeGame.gameRound}`);
        return { checked: true, action: "scheduled_job_chain", roundId: activeGame.gameRound };
      }

      // 5. Game is CLOSED (status=1) - check if prize needs sending or next game needs creating
      if (activeGame.status === GAME_STATUS.CLOSED) {
        // Check if prize still needs to be sent
        if (activeGame.winnerPrize > 0 && activeGame.winner) {
          const sendPrizeScheduled = await ctx.runQuery(
            internal.gameSchedulerMutations.isActionScheduled,
            { roundId: activeGame.gameRound, action: "send_prize" }
          );

          if (!sendPrizeScheduled) {
            console.log(`[Game Loop] ⚠️ RECOVERY: Prize not sent for round ${activeGame.gameRound}, scheduling...`);

            const jobId = await ctx.scheduler.runAfter(
              0,
              internal.gameScheduler.executeSendPrize,
              { roundId: activeGame.gameRound }
            );

            await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
              jobId: jobId.toString(),
              roundId: activeGame.gameRound,
              action: "send_prize",
              scheduledTime: now,
            });

            return { checked: true, action: "send_prize_recovery", roundId: activeGame.gameRound };
          }

          return { checked: true, action: "none", reason: "send_prize_already_scheduled" };
        }

        // Prize already sent, check if next game needs creating
        const createGameScheduled = await ctx.runQuery(
          internal.gameSchedulerMutations.isActionScheduled,
          { roundId: activeGame.gameRound + 1, action: "create_game" }
        );

        if (!createGameScheduled) {
          console.log(`[Game Loop] ⚠️ RECOVERY: Next game not scheduled, creating round ${activeGame.gameRound + 1}...`);

          const jobId = await ctx.scheduler.runAfter(
            0,
            internal.gameScheduler.executeCreateGameRound,
            {}
          );

          await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
            jobId: jobId.toString(),
            roundId: activeGame.gameRound + 1,
            action: "create_game",
            scheduledTime: now,
          });

          return { checked: true, action: "create_next_game_recovery", nextRoundId: activeGame.gameRound + 1 };
        }

        console.log(`[Game Loop] Game ${activeGame.gameRound} is CLOSED, next game already scheduled`);
        return { checked: true, action: "none", reason: "next_game_already_scheduled" };
      }

      return { checked: true, action: "none", reason: "unknown_status" };
    } catch (error) {
      console.error("[Game Loop] Error:", error);
      return {
        checked: false,
        action: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
});
