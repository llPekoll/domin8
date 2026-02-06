/**
 * CHOP Weekly Jackpot System
 *
 * - Tracks weekly prize pool (Saturday to Saturday)
 * - Real-time counter incremented on every payment
 * - Automatic snapshot at week end
 * - Manual payout by admin after validation
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the current week ID and boundaries (Saturday to Saturday)
 */
function getCurrentWeekInfo(): { weekId: string; weekStart: number; weekEnd: number } {
  const now = new Date();

  // Find the most recent Saturday 00:00 UTC
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const daysSinceSaturday = (dayOfWeek + 1) % 7; // Days since last Saturday

  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceSaturday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  // Generate week ID (ISO week format based on Saturday start)
  const year = weekStart.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(
    ((weekStart.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7
  );

  const weekId = `${year}-W${weekNumber.toString().padStart(2, "0")}`;

  return {
    weekId,
    weekStart: weekStart.getTime(),
    weekEnd: weekEnd.getTime(),
  };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get the current active jackpot (creates one if doesn't exist)
 */
export const getCurrentJackpot = query({
  args: {},
  handler: async (ctx) => {
    const { weekId, weekStart, weekEnd } = getCurrentWeekInfo();

    const jackpot = await ctx.db
      .query("chopJackpots")
      .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
      .first();

    if (!jackpot) {
      // Return default values (will be created on first payment)
      return {
        weekId,
        weekStart,
        weekEnd,
        totalPool: 0,
        totalSessions: 0,
        totalContinues: 0,
        status: "active",
        timeRemaining: weekEnd - Date.now(),
      };
    }

    return {
      ...jackpot,
      timeRemaining: weekEnd - Date.now(),
    };
  },
});

/**
 * Get previous jackpots (history)
 */
export const getJackpotHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const jackpots = await ctx.db
      .query("chopJackpots")
      .withIndex("by_status", (q) => q.eq("status", "ended"))
      .order("desc")
      .take(limit);

    return jackpots;
  },
});

/**
 * Get jackpot by week ID
 */
export const getJackpotByWeek = query({
  args: {
    weekId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chopJackpots")
      .withIndex("by_weekId", (q) => q.eq("weekId", args.weekId))
      .first();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Increment jackpot pool (called when player pays)
 * This is called internally from chopSolo actions
 */
export const incrementJackpot = internalMutation({
  args: {
    amount: v.number(), // Amount in lamports
    type: v.string(), // "session" | "continue"
  },
  handler: async (ctx, args) => {
    const { weekId, weekStart, weekEnd } = getCurrentWeekInfo();

    const jackpot = await ctx.db
      .query("chopJackpots")
      .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
      .first();

    if (jackpot) {
      // Update existing jackpot
      await ctx.db.patch(jackpot._id, {
        totalPool: jackpot.totalPool + args.amount,
        totalSessions: jackpot.totalSessions + (args.type === "session" ? 1 : 0),
        totalContinues: jackpot.totalContinues + (args.type === "continue" ? 1 : 0),
      });
    } else {
      // Create new jackpot for this week
      await ctx.db.insert("chopJackpots", {
        weekId,
        weekStart,
        weekEnd,
        totalPool: args.amount,
        totalSessions: args.type === "session" ? 1 : 0,
        totalContinues: args.type === "continue" ? 1 : 0,
        status: "active",
        createdAt: Date.now(),
      });
    }

    return { weekId, amount: args.amount };
  },
});

/**
 * End the current week and snapshot the leaderboard
 * Called by cron at Saturday 00:00 UTC
 */
export const endWeekAndSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find active jackpot that should be ended
    const now = Date.now();

    const activeJackpots = await ctx.db
      .query("chopJackpots")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const jackpot of activeJackpots) {
      // Check if this jackpot's week has ended
      if (now >= jackpot.weekEnd) {
        // Get top 20 from leaderboard
        const topPlayers = await ctx.db
          .query("chopSoloLeaderboard")
          .withIndex("by_high_score")
          .order("desc")
          .take(20);

        const leaderboardSnapshot = topPlayers.map((player, index) => ({
          walletAddress: player.walletAddress,
          highScore: player.highScore,
          rank: index + 1,
        }));

        // Update jackpot with snapshot
        await ctx.db.patch(jackpot._id, {
          status: "ended",
          endedAt: now,
          leaderboardSnapshot,
        });

        console.log(`CHOP Jackpot: Ended week ${jackpot.weekId} with pool ${jackpot.totalPool} lamports`);
      }
    }

    // Create new jackpot for current week if needed
    const { weekId, weekStart, weekEnd } = getCurrentWeekInfo();

    const currentJackpot = await ctx.db
      .query("chopJackpots")
      .withIndex("by_weekId", (q) => q.eq("weekId", weekId))
      .first();

    if (!currentJackpot) {
      await ctx.db.insert("chopJackpots", {
        weekId,
        weekStart,
        weekEnd,
        totalPool: 0,
        totalSessions: 0,
        totalContinues: 0,
        status: "active",
        createdAt: Date.now(),
      });

      console.log(`CHOP Jackpot: Created new week ${weekId}`);
    }

    return { success: true };
  },
});

/**
 * Record a payout (admin action after manual payment)
 */
export const recordPayout = mutation({
  args: {
    weekId: v.string(),
    walletAddress: v.string(),
    rank: v.number(),
    amount: v.number(),
    txHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const jackpot = await ctx.db
      .query("chopJackpots")
      .withIndex("by_weekId", (q) => q.eq("weekId", args.weekId))
      .first();

    if (!jackpot) {
      throw new Error("Jackpot not found");
    }

    const winners = jackpot.winners || [];
    winners.push({
      walletAddress: args.walletAddress,
      rank: args.rank,
      amount: args.amount,
      paidAt: Date.now(),
      txHash: args.txHash,
    });

    await ctx.db.patch(jackpot._id, {
      winners,
      status: "paid",
    });

    return { success: true };
  },
});
