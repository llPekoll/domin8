/**
 * Test Queries - Verify event recording is working
 *
 * Use these queries in Convex dashboard to check if events are being captured
 */

import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all blockchain events (latest first)
 * Use this to verify events are being recorded
 */
export const getAllEvents = query({
  handler: async (ctx) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .order("desc")
      .take(20); // Last 20 events

    return events;
  },
});

/**
 * Get BetPlaced events only
 */
export const getBetPlacedEvents = query({
  handler: async (ctx) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_event_name", (q) => q.eq("eventName", "BetPlaced"))
      .order("desc")
      .take(20);

    return events;
  },
});

/**
 * Get events for a specific round
 */
export const getEventsByRound = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .collect();

    return events;
  },
});

/**
 * Get unprocessed events (should always be 0 or very low)
 */
export const getUnprocessedEvents = query({
  handler: async (ctx) => {
    const events = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_processed", (q) => q.eq("processed", false))
      .collect();

    return events;
  },
});

/**
 * Event statistics - shows if system is working
 */
export const getEventStats = query({
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("blockchainEvents").collect();

    const stats = {
      total: allEvents.length,
      processed: allEvents.filter(e => e.processed).length,
      unprocessed: allEvents.filter(e => !e.processed).length,
      byEventType: {
        BetPlaced: allEvents.filter(e => e.eventName === "BetPlaced").length,
        GameCreated: allEvents.filter(e => e.eventName === "GameCreated").length,
        WinnerSelected: allEvents.filter(e => e.eventName === "WinnerSelected").length,
      },
      latestEvent: allEvents.length > 0
        ? allEvents[allEvents.length - 1]
        : null,
    };

    return stats;
  },
});

/**
 * Compare events vs bets (should match)
 */
export const compareEventsAndBets = query({
  handler: async (ctx) => {
    const betEvents = await ctx.db
      .query("blockchainEvents")
      .withIndex("by_event_name", (q) => q.eq("eventName", "BetPlaced"))
      .collect();

    const bets = await ctx.db.query("bets").collect();

    return {
      totalBetEvents: betEvents.length,
      processedBetEvents: betEvents.filter(e => e.processed).length,
      totalBetsInDb: bets.length,
      match: betEvents.filter(e => e.processed).length === bets.length,
    };
  },
});
