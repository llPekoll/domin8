/**
 * Helius Webhook Mutations
 *
 * Internal mutations for updating gameRoundStates from webhook data
 * Called by heliusWebhookHandler actions after fetching blockchain data
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log a received webhook to the database
 */
export const logWebhook = internalMutation({
  args: {
    signature: v.string(),
    timestamp: v.number(),
    slot: v.optional(v.number()),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookLogs", {
      signature: args.signature,
      timestamp: args.timestamp,
      slot: args.slot,
      status: "processing",
      payload: args.payload,
    });
  },
});

/**
 * Update webhook log status after processing
 */
export const updateWebhookStatus = internalMutation({
  args: {
    signature: v.string(),
    status: v.string(),
    roundId: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const webhook = await ctx.db
      .query("webhookLogs")
      .withIndex("by_signature", (q) => q.eq("signature", args.signature))
      .first();

    if (webhook) {
      await ctx.db.patch(webhook._id, {
        status: args.status,
        roundId: args.roundId,
        error: args.error,
      });
    }
  },
});

/**
 * Update or insert a game round state in the database
 */
export const updateGameRound = internalMutation({
  args: {
    roundId: v.number(),
    status: v.string(),
    startTimestamp: v.number(),
    endTimestamp: v.number(),
    mapId: v.number(),
    betCount: v.number(),
    betAmounts: v.array(v.number()),
    betSkin: v.array(v.number()),
    betPosition: v.array(v.array(v.number())),
    totalPot: v.number(),
    winner: v.union(v.string(), v.null()),
    winningBetIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if this state already exists
    const existing = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", args.status)
      )
      .first();

    const gameState = {
      roundId: args.roundId,
      status: args.status,
      startTimestamp: args.startTimestamp,
      endTimestamp: args.endTimestamp,
      capturedAt: Date.now(),
      mapId: args.mapId,
      betCount: args.betCount,
      betAmounts: args.betAmounts,
      betSkin: args.betSkin,
      betPosition: args.betPosition,
      totalPot: args.totalPot,
      winner: args.winner,
      winningBetIndex: args.winningBetIndex,
      prizeSent: false, // Will be updated when prize is sent
    };

    if (existing) {
      // Update existing state
      await ctx.db.patch(existing._id, gameState);
      console.log(`[Webhook Mutations] ✅ Updated round ${args.roundId} (${args.status})`);
    } else {
      // Insert new state
      await ctx.db.insert("gameRoundStates", gameState);
      console.log(
        `[Webhook Mutations] ✅ Created new state for round ${args.roundId} (${args.status})`
      );
    }

    return { success: true };
  },
});
