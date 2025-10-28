import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Store a BetPlaced event from blockchain logs
 * This is the first step - just store the raw event
 */
export const storeBetPlacedEvent = internalMutation({
  args: {
    signature: v.string(),
    slot: v.number(),
    roundId: v.number(),
    eventData: v.object({
      player: v.string(),
      amount: v.number(),
      betCount: v.number(),
      totalPot: v.number(),
      endTimestamp: v.number(),
      isFirstBet: v.boolean(),
      timestamp: v.number(),
      betIndex: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Check if event already stored
    const existing = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .filter((q) => q.eq(q.field("eventName"), "BetPlaced"))
      .first();

    if (existing) {
      console.log(`BetPlaced event already stored: ${args.signature}`);
      return { alreadyExists: true, eventId: existing._id };
    }

    // Store the event
    const eventId = await ctx.db.insert("blockchainEvents", {
      eventName: "BetPlaced",
      signature: args.signature,
      slot: args.slot,
      blockTime: args.eventData.timestamp,
      eventData: args.eventData,
      roundId: args.roundId,
      processed: false,
    });

    console.log(`✓ Stored BetPlaced event: Round ${args.roundId}, Bet ${args.eventData.betIndex}, ${args.eventData.player}`);

    return { alreadyExists: false, eventId };
  },
});

/**
 * Process a BetPlaced event into the bets table
 * This is the second step - convert event to database bet record
 */
export const processBetPlacedEvent = internalMutation({
  args: {
    eventId: v.id("blockchainEvents"),
  },
  handler: async (ctx, args) => {
    // Get the event
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error(`Event ${args.eventId} not found`);
    }

    if (event.processed) {
      console.log(`Event ${args.eventId} already processed`);
      return { skipped: true };
    }

    const eventData = event.eventData as any;

    // Verify roundId exists
    if (event.roundId === undefined) {
      console.log(`Event ${args.eventId} has no roundId, cannot process`);
      return { skipped: true, reason: "no_round_id" };
    }

    // Store roundId to satisfy TypeScript type narrowing
    const roundId = event.roundId;

    // Find the gameRoundStates document for this round
    const gameRoundState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
      .first();

    if (!gameRoundState) {
      console.log(`Game round state not found for round ${roundId}, will process later`);
      return { skipped: true, reason: "no_game_round_state" };
    }

    // Check if bet already exists
    const existingBet = await ctx.db
      .query("bets")
      .withIndex("by_round_index", (q) =>
        q.eq("roundId", gameRoundState._id).eq("betIndex", eventData.betIndex)
      )
      .first();

    if (existingBet) {
      // Mark event as processed even if bet exists
      await ctx.db.patch(args.eventId, {
        processed: true,
        processedAt: Date.now(),
      });
      console.log(`Bet already exists for round ${roundId}, index ${eventData.betIndex}`);
      return { skipped: true, reason: "bet_exists" };
    }

    // Create the bet record (simplified schema)
    const betId = await ctx.db.insert("bets", {
      roundId: gameRoundState._id,
      walletAddress: eventData.player,
      amount: eventData.amount / 1e9, // Convert lamports to SOL
      placedAt: eventData.timestamp,
      betIndex: eventData.betIndex,
      txSignature: event.signature,
      timestamp: eventData.timestamp,
    });

    // Mark event as processed
    await ctx.db.patch(args.eventId, {
      processed: true,
      processedAt: Date.now(),
    });

    console.log(
      `✓ Processed BetPlaced event: Round ${roundId}, Bet ${eventData.betIndex}, ` +
      `${eventData.player.slice(0, 8)}..., ${eventData.amount / 1e9} SOL`
    );

    return { betId, processed: true };
  },
});

/**
 * Check if a signature has been processed
 * Used to prevent duplicate event storage
 */
export const isSignatureProcessed = internalMutation({
  args: {
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .first();

    return existing !== null;
  },
});

/**
 * Get the most recent processed signature (by slot number)
 * Used for incremental event fetching - only fetch events after this signature
 */
export const getLatestProcessedSignature = internalMutation({
  handler: async (ctx) => {
    const latestEvent = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_slot")
      .order("desc")
      .first();

    return latestEvent?.signature || null;
  },
});
