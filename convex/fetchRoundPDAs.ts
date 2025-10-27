"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SolanaClient } from "./lib/solana";
import * as betMutations from "./betEventListenerMutations";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

export const fetchRoundPDAs = internalAction({
  handler: async (ctx) => {
    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
      await captureGameRoundState(ctx, solanaClient);
    } catch (error) {
      console.error("Error in blockchain event listener:", error);
    }
  },
});

async function captureGameRoundState(ctx: any, solanaClient: SolanaClient) {
  try {
    const gameRound = await solanaClient.getGameRound();
    if (!gameRound) {
      console.log("No active game round found on blockchain");
      return;
    }
    const { roundId, status } = gameRound;
    const existingState = await ctx.runMutation(
      internal.fetchRoundPDAsMutations.checkStateCaptured,
      {
        roundId,
        status,
      }
    );
    if (existingState) {
      await scheduleGameActions(ctx, gameRound);
      return; // Already captured this state
    }
    await ctx.runMutation(internal.fetchRoundPDAsMutations.saveGameRoundState, {
      gameRound,
    });
    console.log("Captured Round " + roundId + ": " + status);

    // ⭐ NEW: Capture individual bets when in WAITING state
    if (status === "waiting") {
      await captureRoundBets(ctx, solanaClient, roundId);
    }

    // ⭐ NEW: Schedule actions based on game state
    await scheduleGameActions(ctx, gameRound);
  } catch (error) {
    console.error("Error capturing game round state:", error);
    throw error;
  }
}

/**
 * Capture all bets for a round from blockchain
 * Fetches BetEntry PDAs and stores them in Convex database
 */
async function captureRoundBets(ctx: any, solanaClient: SolanaClient, roundId: number) {
  try {
    const bets = await solanaClient.getBetsForRound(roundId);

    console.log(`Fetched ${bets.length} bets for round ${roundId}`);

    for (const bet of bets) {
      // Check if bet already stored
      const existing = await ctx.runMutation(
        (internal as any).betEventListenerMutations.isBetStored,
        {
          roundId: bet.gameRoundId,
          betIndex: bet.betIndex,
        }
      );

      if (!existing) {
        await ctx.runMutation((internal as any).betEventListenerMutations.storeBetFromPDA, {
          bet: {
            gameRoundId: bet.gameRoundId,
            betIndex: bet.betIndex,
            wallet: bet.wallet,
            betAmount: bet.betAmount,
            timestamp: bet.timestamp,
            payoutCollected: bet.payoutCollected,
          },
        });
        console.log(
          `✓ Stored bet ${bet.betIndex} for round ${roundId}: ${bet.wallet} - ${bet.betAmount / 1e9} SOL`
        );
      }
    }
  } catch (error) {
    console.error(`Error capturing bets for round ${roundId}:`, error);
    // Don't throw - let game state capture succeed even if bet capture fails
  }
}

/**
 * Schedule automated actions based on game state
 * Called after capturing a new game state
 */
async function scheduleGameActions(ctx: any, gameRound: any) {
  const { roundId, status, endTimestamp } = gameRound;

  try {
    // WAITING STATE: Schedule close betting at endTimestamp
    if (status === "waiting") {
      // ⭐ Check if close betting already scheduled (prevent duplicates)
      const alreadyScheduled = await ctx.runMutation(
        internal.gameSchedulerMutations.isJobScheduled,
        {
          roundId,
          action: "close_betting",
        }
      );

      if (alreadyScheduled) {
        console.log(`Round ${roundId}: Close betting already scheduled, skipping`);
        return;
      }
      const currentTime = Math.floor(Date.now() / 1000);
      // Add 2 second buffer to ensure blockchain clock has definitely passed endTimestamp
      const CLOSE_BETTING_BUFFER = 2; // seconds
      const delay = Math.max(0, endTimestamp - currentTime + CLOSE_BETTING_BUFFER);

      if (delay > 0) {
        // Schedule for future (with buffer to avoid BettingWindowStillOpen error)
        const scheduledTime = endTimestamp + CLOSE_BETTING_BUFFER;
        const jobId = await ctx.scheduler.runAfter(
          delay * 1000, // Convert to milliseconds
          internal.gameScheduler.executeCloseBetting,
          { roundId }
        );

        // Track job in database
        await ctx.runMutation(internal.gameSchedulerMutations.saveScheduledJob, {
          jobId: jobId.toString(),
          roundId,
          action: "close_betting",
          scheduledTime,
        });

        console.log(
          `✓ Scheduled betting close for round ${roundId} in ${delay}s (at ${new Date(scheduledTime * 1000).toISOString()})`
        );
      } else {
        // Already past endTimestamp - trigger immediately
        const jobId = await ctx.scheduler.runAfter(0, internal.gameScheduler.executeCloseBetting, {
          roundId,
        });

        await ctx.runMutation(internal.gameSchedulerMutations.saveScheduledJob, {
          jobId: jobId.toString(),
          roundId,
          action: "close_betting",
          scheduledTime: currentTime,
        });

        console.log(
          `✓ Round ${roundId} betting window already closed, triggering close betting now`
        );
      }
    }

    // AWAITING WINNER RANDOMNESS STATE: Schedule VRF check
    if (status === "awaitingWinnerRandomness") {
      // Check if VRF check already scheduled (prevent duplicates)
      const alreadyScheduled = await ctx.runMutation(
        internal.gameSchedulerMutations.isJobScheduled,
        {
          roundId,
          action: "check_vrf",
        }
      );

      if (alreadyScheduled) {
        console.log(`Round ${roundId}: VRF check already scheduled, skipping`);
        return;
      }

      // Mark close betting job as completed
      await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
        roundId,
        action: "close_betting",
      });

      // Schedule first VRF check after 2 seconds
      const currentTime = Math.floor(Date.now() / 1000);
      const jobId = await ctx.scheduler.runAfter(2000, internal.gameScheduler.executeCheckVrf, {
        roundId,
        attempt: 1,
      });

      await ctx.runMutation(internal.gameSchedulerMutations.saveScheduledJob, {
        jobId: jobId.toString(),
        roundId,
        action: "check_vrf",
        scheduledTime: currentTime + 2,
      });

      console.log(`✓ Scheduled VRF check for round ${roundId} (starts in 2s)`);
    }

    // FINISHED STATE: Log completion
    if (status === "finished") {
      console.log(`✓ Round ${roundId} finished - ready for next game`);

      // Mark any previous job (check vrf) as completed
      await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
        roundId,
        action: "check_vrf",
      });
    }
  } catch (error) {
    console.error(`Error scheduling actions for round ${roundId}:`, error);
    // Don't throw - let event capture succeed even if scheduling fails
  }
}
