/**
 * Blockchain Event Listener
 *
 * Primary data ingestion mechanism - listens for Solana program events
 * and stores them in the blockchainEvents table for processing.
 *
 * This replaces the old PDA polling approach with event-driven architecture.
 *
 * Events captured:
 * - BetPlaced: When users place bets (most frequent)
 * - GameCreated: When a new game round starts
 * - GameLocked: When betting window closes
 * - WinnerSelected: When winner is determined
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

/**
 * Main event listener - runs every 3 seconds
 * Fetches recent blockchain events and stores them for processing
 */
export const listenForEvents = internalAction({
  handler: async (ctx) => {
    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      // Fetch recent BetPlaced events (most frequent)
      await captureBetPlacedEvents(ctx, solanaClient);

      // TODO: Add listeners for other event types:
      // - GameCreated (when first bet creates a round)
      // - GameLocked (when betting closes)
      // - WinnerSelected (when winner is determined)

    } catch (error) {
      console.error("[Event Listener] Error:", error);
    }
  },
});

/**
 * Capture BetPlaced events from blockchain
 * These are emitted every time a user places a bet
 */
async function captureBetPlacedEvents(ctx: any, solanaClient: SolanaClient) {
  try {
    // Fetch last 50 transactions (should capture ~15-30s worth of bets)
    const betEvents = await solanaClient.getAllRecentBetEvents(50);

    if (betEvents.length === 0) {
      return; // No new events
    }

    console.log(`[Event Listener] Found ${betEvents.length} BetPlaced events`);

    let newEvents = 0;
    let duplicates = 0;

    for (const event of betEvents) {
      // Check if signature already processed (deduplication)
      const alreadyProcessed = await ctx.runMutation(
        internal.eventProcessorMutations.isSignatureProcessed,
        { signature: event.signature }
      );

      if (alreadyProcessed) {
        duplicates++;
        continue;
      }

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

      if (!result.alreadyExists) {
        newEvents++;

        // Immediately process the event into a bet record
        await ctx.runMutation(
          internal.eventProcessorMutations.processBetPlacedEvent,
          { eventId: result.eventId }
        );

        console.log(
          `✓ [Event] Round ${event.roundId}, Bet ${event.betIndex}: ` +
          `${event.player.slice(0, 8)}... - ${event.amount / 1e9} SOL ` +
          `(tx: ${event.signature.slice(0, 8)}...)`
        );
      }
    }

    if (newEvents > 0 || duplicates > 0) {
      console.log(
        `[Event Listener] Processed: ${newEvents} new, ${duplicates} duplicates, ` +
        `${betEvents.length - newEvents - duplicates} other`
      );
    }

  } catch (error) {
    console.error("[Event Listener] Error capturing BetPlaced events:", error);
  }
}
