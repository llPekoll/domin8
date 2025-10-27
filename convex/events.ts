/**
 * Query Functions for Blockchain Data
 * 
 * Simple read-only queries to view:
 * 1. Blockchain events from the domin8 program
 * 2. Game round state snapshots
 */
import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// BLOCKCHAIN EVENTS QUERIES
// ============================================================================

/**
 * Get all blockchain events (paginated)
 */
export const getAllEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const events = await ctx.db
      .query("blockchainEvents")
      .order("desc")
      .take(limit);

    return events;
  },
});

/**
 * Get events by type/name
 */
export const getEventsByName = query({
  args: {
    eventName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_event_name", (q) => q.eq("eventName", args.eventName))
      .order("desc")
      .take(limit);

    return events;
  },
});

/**
 * Get events for a specific round
 */
export const getEventsByRound = query({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .order("desc")
      .collect();

    return events;
  },
});

/**
 * Get recent events (last N)
 */
export const getRecentEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_block_time")
      .order("desc")
      .take(limit);

    return events;
  },
});

// ============================================================================
// GAME ROUND STATES QUERIES
// ============================================================================

/**
 * Get all states for a specific round
 * Returns array ordered by capturedAt: [waiting, awaitingWinnerRandomness, finished]
 */
export const getRoundStates = query({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .order("asc") // Chronological order
      .collect();

    return states;
  },
});

/**
 * Get current round state (latest captured state)
 */
export const getCurrentRoundState = query({
  args: {},
  handler: async (ctx) => {
    const latestState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_captured_at")
      .order("desc")
      .first();

    return latestState;
  },
});

/**
 * Get latest state for a specific round
 * Used by scheduler to check current status before executing actions
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
 * Get specific round state by roundId and status
 */
export const getRoundStateByStatus = query({
  args: {
    roundId: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", args.status)
      )
      .first();

    return state;
  },
});

/**
 * Get all rounds in a specific status
 */
export const getRoundsByStatus = query({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const rounds = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);

    return rounds;
  },
});

/**
 * Get state transition history for a round
 * Shows progression: waiting → awaitingWinnerRandomness → finished
 */
export const getRoundStateHistory = query({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const states = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .order("asc") // Chronological order by capturedAt
      .collect();

    // Return with transition metadata
    return states.map((state, index) => ({
      ...state,
      transitionOrder: index + 1,
      isInitialState: index === 0,
      isFinalState: index === states.length - 1,
    }));
  },
});

/**
 * Get all rounds (with their latest state)
 */
export const getAllRounds = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    // Get all states, grouped by roundId
    const allStates = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_captured_at")
      .order("desc")
      .take(limit * 3); // Get enough to cover multiple rounds

    // Group by roundId and get latest state for each
    const roundMap = new Map();
    for (const state of allStates) {
      if (!roundMap.has(state.roundId)) {
        roundMap.set(state.roundId, state);
      }
    }

    const rounds = Array.from(roundMap.values())
      .sort((a, b) => b.roundId - a.roundId) // Sort by roundId descending
      .slice(0, limit);

    return rounds;
  },
});

/**
 * Get statistics about captured states
 */
export const getStateStats = query({
  args: {},
  handler: async (ctx) => {
    const allStates = await ctx.db.query("gameRoundStates").collect();

    // Count by status
    const statusCounts = allStates.reduce((acc, state) => {
      acc[state.status] = (acc[state.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count unique rounds
    const uniqueRounds = new Set(allStates.map((s) => s.roundId)).size;

    return {
      totalStates: allStates.length,
      uniqueRounds,
      statusCounts,
      latestRoundId: allStates.length > 0 ? Math.max(...allStates.map((s) => s.roundId)) : 0,
    };
  },
});
