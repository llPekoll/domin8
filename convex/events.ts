/**
 * Game Round State Queries
 * Queries for accessing game round state data from the blockchain
 */
import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get the latest state for a specific round
 * Used by gameScheduler to check current game status
 */
export const getLatestRoundState = internalQuery({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .order("desc") // Most recent first
      .first();

    return states;
  },
});

/**
 * Get all states for a specific round (useful for debugging)
 */
export const getRoundStates = query({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .order("desc")
      .collect();
  },
});

/**
 * Get all rounds with a specific status
 */
export const getRoundsByStatus = query({
  args: {
    status: v.string(), // "waiting" | "finished"
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();
  },
});

/**
 * Get the current active game (status: "waiting")
 */
export const getCurrentGame = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .order("desc")
      .first();
  },
});
