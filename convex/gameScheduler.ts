/**
 * Game Scheduler - Automated Game Progression
 *
 * Handles scheduled execution of game state transitions:
 * 1. Close betting window at endTimestamp (waiting → awaitingWinnerRandomness or finished)
 * 2. Check VRF fulfillment and select winner (awaitingWinnerRandomness → finished)
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

const MAX_VRF_ATTEMPTS = 10; // 20 seconds total (2s interval)

// ============================================================================
// CLOSE BETTING SCHEDULER
// ============================================================================

/**
 * Execute close betting window action
 * Called at endTimestamp to transition game from waiting to awaitingWinnerRandomness
 * (or to finished immediately if single-player game)
 */
export const executeCloseBetting = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, { roundId }) => {
    console.log(`\n[Scheduler] Executing close betting for round ${roundId}`);

    try {
      // 1. Verify game is still in "waiting" status
      const latestState = await ctx.runQuery(internal.events.getLatestRoundState, {
        roundId,
      });

      if (!latestState) {
        console.log(`Round ${roundId}: No state found, skipping`);
        return;
      }

      if (latestState.status !== "waiting") {
        console.log(
          `Round ${roundId}: Already progressed to ${latestState.status}, skipping`
        );
        return;
      }

      // 2. Verify betting window has actually closed (with buffer for blockchain clock)
      const currentTime = Math.floor(Date.now() / 1000);
      const BLOCKCHAIN_CLOCK_BUFFER = 2; // seconds to account for blockchain clock drift
      
      if (currentTime < latestState.endTimestamp + BLOCKCHAIN_CLOCK_BUFFER) {
        const remaining = latestState.endTimestamp + BLOCKCHAIN_CLOCK_BUFFER - currentTime;
        console.log(
          `Round ${roundId}: Waiting for blockchain clock buffer (${remaining}s remaining), skipping`
        );
        return;
      }

      // 3. Call Solana closeBettingWindow()
      console.log(`Round ${roundId}: Calling closeBettingWindow()...`);
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      const txSignature = await solanaClient.closeBettingWindow();

      // 4. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: Betting closed successfully. Tx: ${txSignature}`);

        // 5. Check if game finished immediately (single-player case)
        // Wait a moment for blockchain to update
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const newState = await solanaClient.getGameRound();
        if (newState?.status === "finished") {
          console.log(
            `Round ${roundId}: Single-player game completed (auto-refund processed)`
          );
          // Event listener will capture the "finished" state
          // No VRF check needed
        } else {
          console.log(
            `Round ${roundId}: Multi-player game, waiting for VRF (status: ${newState?.status})`
          );
          // Event listener will capture "awaitingWinnerRandomness" state
          // and schedule VRF check
        }
      } else {
        console.error(`Round ${roundId}: Transaction confirmation failed: ${txSignature}`);
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error closing betting:`, error);
      
      // Mark job as failed in database
      await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
        roundId,
        action: "close_betting",
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Don't throw - recovery cron will handle later
    }
  },
});

// ============================================================================
// VRF CHECK SCHEDULER
// ============================================================================

/**
 * Execute VRF fulfillment check
 * Polls VRF account every 2s until randomness is fulfilled
 * Then calls selectWinnerAndPayout()
 */
export const executeCheckVrf = internalAction({
  args: {
    roundId: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, { roundId, attempt }) => {
    console.log(`\n[Scheduler] VRF check for round ${roundId} (attempt ${attempt}/${MAX_VRF_ATTEMPTS})`);

    try {
      // 1. Get latest game state
      const latestState = await ctx.runQuery(internal.events.getLatestRoundState, {
        roundId,
      });

      if (!latestState) {
        console.log(`Round ${roundId}: No state found, skipping`);
        return;
      }

      // Already finished (manual crank or previous check succeeded)
      if (latestState.status === "finished") {
        console.log(`Round ${roundId}: Already finished, skipping`);
        return;
      }

      // Wrong state (shouldn't happen, but check anyway)
      if (latestState.status !== "awaitingWinnerRandomness") {
        console.warn(
          `Round ${roundId}: Unexpected state ${latestState.status}, expected awaitingWinnerRandomness`
        );
        return;
      }

      // 2. Check VRF fulfillment
          const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
        //   const vrfFulfilled = await solanaClient.checkVrfFulfillment(
        //     latestState.vrfRequestPubkey
        //   );
      const vrfFulfilled = true; // TEMP MOCK in localnet vrf always fulfilled because mocked

      if (vrfFulfilled) {
        // 3. VRF is ready! Call selectWinnerAndPayout
        console.log(`Round ${roundId}: ✓ VRF fulfilled on attempt ${attempt}`);
        console.log(`Round ${roundId}: Calling selectWinnerAndPayout()...`);

        const txSignature = await solanaClient.selectWinnerAndPayout(
          latestState.vrfRequestPubkey!
        );

        // 4. Wait for confirmation
        const confirmed = await solanaClient.confirmTransaction(txSignature);

        if (confirmed) {
          console.log(`Round ${roundId}: ✓ Winner selected successfully. Tx: ${txSignature}`);
          console.log(`Round ${roundId}: Game complete, ready for next round`);
          // Event listener will capture the "finished" state
        } else {
          console.error(
            `Round ${roundId}: Transaction confirmation failed: ${txSignature}`
          );
        }

        return; // Done!
      }

      // 5. VRF not ready yet - schedule next check
      if (attempt < MAX_VRF_ATTEMPTS) {
        console.log(
          `Round ${roundId}: VRF not ready, scheduling retry ${attempt + 1}/${MAX_VRF_ATTEMPTS} in 2s`
        );
        await ctx.scheduler.runAfter(
          2000, // 2 seconds
          internal.gameScheduler.executeCheckVrf,
          { roundId, attempt: attempt + 1 }
        );
      } else {
        // MAX attempts reached - log error
        console.error(
          `Round ${roundId}: ⚠️ VRF fulfillment timeout after ${MAX_VRF_ATTEMPTS} attempts (${MAX_VRF_ATTEMPTS * 2}s)`
        );
        console.error(
          `Round ${roundId}: VRF may still fulfill later - recovery cron will handle`
        );
        // Recovery mechanism will retry later (future feature)
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error checking VRF (attempt ${attempt}):`, error);

      

      // On error, retry if we haven't exceeded max attempts
      if (attempt < MAX_VRF_ATTEMPTS) {
        console.log(`Round ${roundId}: Scheduling retry after error...`);
        await ctx.scheduler.runAfter(
          2000,
          internal.gameScheduler.executeCheckVrf,
          { roundId, attempt: attempt + 1 }
        );
      } else {
            // Mark job as failed in database
            await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
                roundId,
                action: "check_vrf",
                error: error instanceof Error ? error.message : String(error),
            });
      }
    }
  },
});
