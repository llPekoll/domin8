import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all bets for a specific round
 * Used by frontend to display bets and animate new ones
 */
export const getBetsForRound = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    const bets = await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), args.roundId as any))
      .collect();
    
    // Sort by bet index (chronological order)
    return bets.sort((a, b) => (a.betIndex || 0) - (b.betIndex || 0));
  },
});

/**
 * Get latest bets across all rounds (for global bet ticker)
 * Shows recent betting activity
 */
export const getLatestBets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    const bets = await ctx.db
      .query("bets")
      .order("desc")
      .take(limit);
    
    return bets;
  },
});

/**
 * Get bet statistics for a round
 * Used to display pot size, player count, etc.
 */
export const getRoundBetStats = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    const bets = await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), args.roundId as any))
      .collect();

    const totalPot = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const uniquePlayers = new Set(bets.map((bet) => bet.walletAddress)).size;

    return {
      totalBets: bets.length,
      totalPot,
      uniquePlayers,
      averageBet: bets.length > 0 ? totalPot / bets.length : 0,
      bets: bets.sort((a, b) => (a.betIndex || 0) - (b.betIndex || 0)),
    };
  },
});

/**
 * Get bets for a specific wallet address
 * Used to show user their betting history
 */
export const getBetsByWallet = query({
  args: { 
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    const bets = await ctx.db
      .query("bets")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(limit);
    
    return bets;
  },
});

/**
 * Get current game round state
 * Used to display round info and status
 */
export const getCurrentRound = query({
  handler: async (ctx) => {
    // Get the most recent game round state
    const latestState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_captured_at")
      .order("desc")
      .first();
    
    if (!latestState) return null;
    
    // Get bets for this round
    const bets = await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), latestState.roundId as any))
      .collect();
    
    return {
      ...latestState,
      bets: bets.sort((a, b) => (a.betIndex || 0) - (b.betIndex || 0)),
    };
  },
});
