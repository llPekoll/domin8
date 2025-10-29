/**
 * Game Scheduler - Automated Game Progression (Risk-based Architecture)
 *
 * Handles scheduled execution of game state transitions:
 * 1. End game at endTimestamp (status: 0 → 1, winner selected on-chain)
 * 2. Send prize to winner (distributes funds)
 *
 * This module is called by ctx.scheduler.runAfter() from eventListener.ts
 */
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

// ============================================================================
// END GAME SCHEDULER
// ============================================================================

/**
 * Execute end game action (risk-based architecture)
 * Called at endTimestamp to end the game and select winner on-chain
 * Winner is determined by weighted randomness using VRF force seed
 */
export const executeEndGame = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, { roundId }) => {
    console.log(`\n[Scheduler] Executing end game for round ${roundId}`);

    try {
      // 1. Verify game is still open (status: 0)
      const latestState = await ctx.runQuery(internal.events.getLatestRoundState, {
        roundId,
      });

      if (!latestState) {
        console.log(`Round ${roundId}: No state found, skipping`);
        return;
      }

      if (latestState.status !== "waiting") {
        console.log(`Round ${roundId}: Already closed (status: ${latestState.status})`);

        // Recovery: If game is closed but prize not sent, schedule sendPrizeWinner
        if (latestState.status === "finished" && latestState.winner) {
          console.log(`Round ${roundId}: Game finished but checking if prize was sent...`);

          // Check if sendPrizeWinner already scheduled
          const prizeSent = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
            roundId,
            action: "send_prize",
          });

          if (!prizeSent) {
            console.log(`Round ${roundId}: Prize not sent yet, scheduling sendPrizeWinner`);
            await ctx.scheduler.runAfter(
              0, // Execute immediately
              internal.gameScheduler.executeSendPrize,
              { roundId }
            );
            return;
          } else {
            console.log(`Round ${roundId}: Prize already sent or scheduled`);
          }
        }

        return;
      }

      // 2. Verify time window has closed (with buffer for blockchain clock)
      const currentTime = Math.floor(Date.now() / 1000);
      const BLOCKCHAIN_CLOCK_BUFFER = 2; // seconds to account for blockchain clock drift

      if (currentTime < latestState.endTimestamp + BLOCKCHAIN_CLOCK_BUFFER) {
        const remaining = latestState.endTimestamp + BLOCKCHAIN_CLOCK_BUFFER - currentTime;
        console.log(
          `Round ${roundId}: Waiting for time window (${remaining}s remaining), skipping`
        );
        return;
      }

      // 3. Call Solana endGame()
      console.log(`Round ${roundId}: Calling endGame()...`);
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      const txSignature = await solanaClient.endGame(roundId);

      // 4. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: Game ended successfully. Tx: ${txSignature}`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "end_game",
        });

        // 5. Wait for blockchain to update, then schedule prize distribution
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const newState = await solanaClient.getGameRound(roundId);
        if (newState?.winner) {
          console.log(`Round ${roundId}: Winner selected: ${newState.winner}`);
          // Schedule sendPrizeWinner
          await ctx.scheduler.runAfter(
            1000, // 1 second delay
            internal.gameScheduler.executeSendPrize,
            { roundId }
          );
        } else {
          console.warn(`Round ${roundId}: No winner found after end_game`);
        }
      } else {
        console.error(`Round ${roundId}: Transaction confirmation failed: ${txSignature}`);

        // Mark job as failed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
          roundId,
          action: "end_game",
          error: `Transaction confirmation failed: ${txSignature}`,
        });
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error ending game:`, error);

      // Mark job as failed in database
      await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
        roundId,
        action: "end_game",
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - recovery cron will handle later
    }
  },
});

// ============================================================================
// SEND PRIZE SCHEDULER
// ============================================================================

/**
 * Execute send prize to winner (risk-based architecture)
 * Distributes the winner's prize from the game account
 */
export const executeSendPrize = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, { roundId }) => {
    console.log(`\n[Scheduler] Executing send prize for round ${roundId}`);

    try {
      // 1. Get latest game state
      const latestState = await ctx.runQuery(internal.events.getLatestRoundState, {
        roundId,
      });

      if (!latestState) {
        console.log(`Round ${roundId}: No state found, skipping`);
        return;
      }

      // Check if game is closed (status: "finished")
      if (latestState.status !== "finished") {
        console.log(`Round ${roundId}: Game not closed yet (status: ${latestState.status}), skipping`);
        return;
      }

      // Check if winner exists
      if (!latestState.winner) {
        console.warn(`Round ${roundId}: No winner determined yet, skipping`);
        return;
      }

      // 2. Call sendPrizeWinner
      console.log(`Round ${roundId}: Calling sendPrizeWinner()...`);
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      const txSignature = await solanaClient.sendPrizeWinner(roundId);

      // 3. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: ✓ Prize sent successfully. Tx: ${txSignature}`);
        console.log(`Round ${roundId}: Game complete, ready for next round`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "send_prize",
        });

        // Event listener will capture the updated state
      } else {
        console.error(`Round ${roundId}: Transaction confirmation failed: ${txSignature}`);

        // Mark job as failed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
          roundId,
          action: "send_prize",
          error: `Transaction confirmation failed: ${txSignature}`,
        });
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error sending prize:`, error);

      // Mark job as failed in database
      await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
        roundId,
        action: "send_prize",
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - recovery cron will handle later
    }
  },
});
