"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SolanaClient } from "./lib/solana";
import { GameStatus } from "./lib/types";

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
    if (status === GameStatus.Waiting) {
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
 * Capture all bets for a round using event-based approach
 * Fetches BetPlaced events from recent transactions and stores them
 */
async function captureRoundBets(ctx: any, solanaClient: SolanaClient, roundId: number) {
  try {
    console.log(`[Event-Based] Fetching BetPlaced events for round ${roundId}`);

    // Get recent BetPlaced events from blockchain
    const betEvents = await solanaClient.getAllRecentBetEvents(50);

    // Filter events for this specific round
    const roundEvents = betEvents.filter(event => event.roundId === roundId);

    console.log(`[Event-Based] Found ${roundEvents.length} events for round ${roundId}`);

    for (const event of roundEvents) {
      // Check if signature already processed
      const alreadyProcessed = await ctx.runMutation(
        internal.eventProcessorMutations.isSignatureProcessed,
        {
          signature: event.signature,
        }
      );

      if (!alreadyProcessed) {
        // Store the event
        const result = await ctx.runMutation(
          internal.eventProcessorMutations.storeBetPlacedEvent,
          {
            signature: event.signature,
            slot: event.slot,
            roundId: event.roundId,
            eventData: {
              player: event.player,
              amount: event.amount,
              betCount: event.betCount,
              totalPot: event.totalPot,
              endTimestamp: event.endTimestamp,
              isFirstBet: event.isFirstBet,
              timestamp: event.timestamp,
              betIndex: event.betIndex,
            },
          }
        );

        // Process the event immediately into a bet record
        if (!result.alreadyExists) {
          await ctx.runMutation(
            internal.eventProcessorMutations.processBetPlacedEvent,
            {
              eventId: result.eventId,
            }
          );
          console.log(
            `✓ [Event-Based] Captured bet ${event.betIndex} for round ${roundId}: ${event.player.slice(0, 8)}... - ${event.amount / 1e9} SOL (tx: ${event.signature.slice(0, 8)}...)`
          );
        }
      }
    }
  } catch (error) {
    console.error(`[Event-Based] Error capturing bets for round ${roundId}:`, error);
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
    if (status === GameStatus.Waiting) {
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
    if (status === GameStatus.AwaitingWinnerRandomness) {
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

    // FINISHED STATE: Log completion and clean up all jobs
    if (status === GameStatus.Finished) {
      console.log(`✓ Round ${roundId} finished - ready for next game`);

      // Mark close_betting job as completed (in case of single-player auto-refund)
      await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
        roundId,
        action: "close_betting",
      });

      // Mark check_vrf job as completed (in case of multi-player game)
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
