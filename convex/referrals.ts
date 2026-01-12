import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Generate a unique referral code for a user
 * Creates a 6-character alphanumeric code (e.g., "ABC123")
 */
function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create or get referral code for a user
 * Returns existing code if already created, otherwise generates new one
 */
export const getOrCreateReferralCode = mutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already has a referral code
    const existingStats = await ctx.db
      .query("referralStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();

    if (existingStats) {
      return {
        code: existingStats.referralCode,
        totalReferred: existingStats.totalReferred,
        totalRevenue: existingStats.totalRevenue,
        accumulatedRewards: existingStats.accumulatedRewards || 0,
        totalPaidOut: existingStats.totalPaidOut || 0,
        lastPayoutDate: existingStats.lastPayoutDate,
        lastPayoutAmount: existingStats.lastPayoutAmount,
      };
    }

    // Generate unique code (retry if collision)
    let referralCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await ctx.db
        .query("referralStats")
        .withIndex("by_code", (q) => q.eq("referralCode", referralCode))
        .unique();

      if (!existing) break;

      referralCode = generateReferralCode();
      attempts++;
    }

    if (attempts >= 10) {
      throw new Error("Failed to generate unique referral code");
    }

    // Create new referral stats entry
    await ctx.db.insert("referralStats", {
      walletAddress: args.walletAddress,
      referralCode,
      totalReferred: 0,
      totalRevenue: 0,
      accumulatedRewards: 0,
      createdAt: Date.now(),
    });

    return {
      code: referralCode,
      totalReferred: 0,
      totalRevenue: 0,
      accumulatedRewards: 0,
      totalPaidOut: 0,
      lastPayoutDate: undefined,
      lastPayoutAmount: undefined,
    };
  },
});

/**
 * Track a new referral when someone signs up with a referral code
 */
export const trackReferral = mutation({
  args: {
    referralCode: v.string(),
    referredUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the referrer by code
    const referrerStats = await ctx.db
      .query("referralStats")
      .withIndex("by_code", (q) => q.eq("referralCode", args.referralCode))
      .unique();

    if (!referrerStats) {
      throw new Error("Invalid referral code");
    }

    // Don't allow self-referral
    if (referrerStats.walletAddress === args.referredUserId) {
      throw new Error("Cannot refer yourself");
    }

    // Check if user was already referred
    const existingReferral = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) =>
        q.eq("referredUserId", args.referredUserId)
      )
      .unique();

    if (existingReferral) {
      throw new Error("User was already referred");
    }

    // Create referral record
    await ctx.db.insert("referrals", {
      referrerId: referrerStats.walletAddress,
      referredUserId: args.referredUserId,
      referralCode: args.referralCode,
      signupDate: Date.now(),
      totalBetVolume: 0,
      status: "active",
    });

    // Update referrer stats
    await ctx.db.patch(referrerStats._id, {
      totalReferred: referrerStats.totalReferred + 1,
    });

    return { success: true };
  },
});

/**
 * Update bet volume for a referred user
 * Called whenever a user places a bet
 */
export const updateReferralRevenue = mutation({
  args: {
    userId: v.string(),
    betAmount: v.number(), // in lamports
  },
  handler: async (ctx, args) => {
    // Check if this user was referred
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) => q.eq("referredUserId", args.userId))
      .unique();

    if (!referral) {
      return { updated: false }; // User wasn't referred, that's fine
    }

    // Update the referral's bet volume
    await ctx.db.patch(referral._id, {
      totalBetVolume: referral.totalBetVolume + args.betAmount,
    });

    // Update referrer's total revenue and rewards (1.5% of bet amount)
    const referrerStats = await ctx.db
      .query("referralStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", referral.referrerId))
      .unique();

    if (referrerStats) {
      // Calculate 1% reward
      const rewardAmount = Math.floor(args.betAmount * 0.01); // 1% in lamports

      await ctx.db.patch(referrerStats._id, {
        totalRevenue: referrerStats.totalRevenue + args.betAmount,
        accumulatedRewards: (referrerStats.accumulatedRewards || 0) + rewardAmount,
      });
    }

    return { updated: true };
  },
});

/**
 * Get referral statistics for a specific user
 */
export const getReferralStats = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("referralStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();

    if (!stats) {
      return null;
    }

    return {
      referralCode: stats.referralCode,
      totalReferred: stats.totalReferred,
      totalRevenue: stats.totalRevenue,
      accumulatedRewards: stats.accumulatedRewards || 0,
      totalPaidOut: stats.totalPaidOut || 0,
      lastPayoutDate: stats.lastPayoutDate,
      lastPayoutAmount: stats.lastPayoutAmount,
      createdAt: stats.createdAt,
    };
  },
});

/**
 * Get list of users referred by a specific wallet
 */
export const getReferredUsers = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", args.walletAddress))
      .collect();

    // Get player info for each referred user
    const referredUsersData = await Promise.all(
      referrals.map(async (referral) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_wallet", (q) =>
            q.eq("walletAddress", referral.referredUserId)
          )
          .unique();

        return {
          walletAddress: referral.referredUserId,
          displayName: player?.displayName || "Anonymous",
          signupDate: referral.signupDate,
          totalBetVolume: referral.totalBetVolume,
          status: referral.status,
        };
      })
    );

    return referredUsersData;
  },
});

/**
 * Get global referral leaderboard
 * Returns top referrers sorted by revenue with calculated rank
 */
export const getLeaderboard = query({
  args: {
    limit: v.optional(v.number()), // Default to 100
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    // Get all referral stats sorted by revenue descending
    const allStats = await ctx.db
      .query("referralStats")
      .withIndex("by_revenue")
      .order("desc")
      .take(limit);

    // Get player info and calculate rank
    const leaderboard = await Promise.all(
      allStats.map(async (stats, index) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_wallet", (q) => q.eq("walletAddress", stats.walletAddress))
          .unique();

        return {
          rank: index + 1, // Calculated on-demand
          walletAddress: stats.walletAddress,
          displayName: player?.displayName || "Anonymous",
          referralCode: stats.referralCode,
          totalReferred: stats.totalReferred,
          totalRevenue: stats.totalRevenue,
        };
      })
    );

    return leaderboard;
  },
});

/**
 * Get user's rank in the leaderboard
 * Efficiently calculates rank by counting how many users have higher revenue
 */
export const getUserRank = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const userStats = await ctx.db
      .query("referralStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();

    if (!userStats) {
      return null;
    }

    // Count how many users have higher revenue
    const allStats = await ctx.db.query("referralStats").collect();
    const usersWithHigherRevenue = allStats.filter(
      (stats) => stats.totalRevenue > userStats.totalRevenue
    ).length;

    return {
      rank: usersWithHigherRevenue + 1,
      totalRevenue: userStats.totalRevenue,
      totalReferred: userStats.totalReferred,
    };
  },
});

/**
 * Record a manual payout to a referrer
 * Called by admin when sending monthly payouts
 */
export const recordPayout = mutation({
  args: {
    walletAddress: v.string(),
    payoutAmount: v.number(), // Amount paid out in lamports
    txHash: v.optional(v.string()), // Solana transaction hash
    note: v.optional(v.string()), // Optional note
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("referralStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();

    if (!stats) {
      throw new Error("Referrer not found");
    }

    const currentPaidOut = stats.totalPaidOut || 0;
    const pendingAmount = (stats.accumulatedRewards || 0) - currentPaidOut;

    if (args.payoutAmount > pendingAmount) {
      throw new Error(`Payout amount exceeds pending rewards. Pending: ${pendingAmount} lamports`);
    }

    const now = Date.now();

    // Update stats
    await ctx.db.patch(stats._id, {
      totalPaidOut: currentPaidOut + args.payoutAmount,
      lastPayoutDate: now,
      lastPayoutAmount: args.payoutAmount,
    });

    // Record in payout history
    await ctx.db.insert("payoutHistory", {
      walletAddress: args.walletAddress,
      amount: args.payoutAmount,
      paidAt: now,
      txHash: args.txHash,
      note: args.note,
    });

    return {
      success: true,
      newTotalPaidOut: currentPaidOut + args.payoutAmount,
      remainingPending: pendingAmount - args.payoutAmount,
    };
  },
});

/**
 * Get payout history for a user
 */
export const getPayoutHistory = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("payoutHistory")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .collect();

    return payouts;
  },
});

/**
 * Get all referrers with pending payouts
 * Useful for admin to see who needs to be paid
 */
export const getPendingPayouts = query({
  args: {},
  handler: async (ctx) => {
    const allStats = await ctx.db.query("referralStats").collect();

    const pendingPayouts = allStats
      .map((stats) => {
        const totalPaidOut = stats.totalPaidOut || 0;
        const pendingAmount = (stats.accumulatedRewards || 0) - totalPaidOut;
        return {
          walletAddress: stats.walletAddress,
          referralCode: stats.referralCode,
          totalReferred: stats.totalReferred,
          accumulatedRewards: stats.accumulatedRewards || 0,
          totalPaidOut,
          pendingAmount,
          lastPayoutDate: stats.lastPayoutDate,
        };
      })
      .filter((stats) => stats.pendingAmount > 0)
      .sort((a, b) => b.pendingAmount - a.pendingAmount);

    return pendingPayouts;
  },
});

