import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get user's bot configuration
 */
export const getConfiguration = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    return config;
  },
});

/**
 * Save bot configuration
 * Validates settings based on tier before saving
 */
export const saveConfiguration = mutation({
  args: {
    walletAddress: v.string(),
    config: v.object({
      // Rookie settings
      fixedBetAmount: v.optional(v.number()),
      selectedCharacter: v.optional(v.number()),
      budgetLimit: v.optional(v.number()),

      // Pro settings
      betMin: v.optional(v.number()),
      betMax: v.optional(v.number()),
      stopLoss: v.optional(v.number()),
      winStreakMultiplier: v.optional(v.number()),
      cooldownRounds: v.optional(v.number()),
      characterRotation: v.optional(v.array(v.number())),

      // Elite settings
      takeProfit: v.optional(v.number()),
      martingaleEnabled: v.optional(v.boolean()),
      antiMartingaleEnabled: v.optional(v.boolean()),
      scheduleStart: v.optional(v.number()),
      scheduleEnd: v.optional(v.number()),
      smartSizing: v.optional(v.boolean()),
      smartSizingThreshold: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const { walletAddress, config } = args;

    const existingConfig = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!existingConfig) {
      throw new Error("No bot configuration found. Purchase a bot first.");
    }

    const tier = existingConfig.tier;

    // Validate settings based on tier
    const updates: Record<string, unknown> = {
      lastUpdated: Date.now(),
    };

    // Rookie settings (all tiers)
    if (config.fixedBetAmount !== undefined) {
      if (config.fixedBetAmount < 1_000_000) {
        throw new Error("Minimum bet is 0.001 SOL");
      }
      updates.fixedBetAmount = config.fixedBetAmount;
    }
    if (config.selectedCharacter !== undefined) {
      updates.selectedCharacter = config.selectedCharacter;
    }
    if (config.budgetLimit !== undefined) {
      if (config.budgetLimit < 10_000_000) {
        throw new Error("Minimum budget is 0.01 SOL");
      }
      updates.budgetLimit = config.budgetLimit;
    }

    // Pro settings (pro and elite tiers)
    if (tier === "pro" || tier === "elite") {
      if (config.betMin !== undefined) {
        updates.betMin = config.betMin;
      }
      if (config.betMax !== undefined) {
        updates.betMax = config.betMax;
      }
      if (config.stopLoss !== undefined) {
        updates.stopLoss = config.stopLoss;
      }
      if (config.winStreakMultiplier !== undefined) {
        if (config.winStreakMultiplier < 1 || config.winStreakMultiplier > 5) {
          throw new Error("Win streak multiplier must be between 1 and 5");
        }
        updates.winStreakMultiplier = config.winStreakMultiplier;
      }
      if (config.cooldownRounds !== undefined) {
        if (config.cooldownRounds < 0 || config.cooldownRounds > 10) {
          throw new Error("Cooldown rounds must be between 0 and 10");
        }
        updates.cooldownRounds = config.cooldownRounds;
      }
      if (config.characterRotation !== undefined) {
        updates.characterRotation = config.characterRotation;
      }
    }

    // Elite settings (elite tier only)
    if (tier === "elite") {
      if (config.takeProfit !== undefined) {
        updates.takeProfit = config.takeProfit;
      }
      if (config.martingaleEnabled !== undefined) {
        // Can't enable both martingale and anti-martingale
        if (config.martingaleEnabled && existingConfig.antiMartingaleEnabled) {
          updates.antiMartingaleEnabled = false;
        }
        updates.martingaleEnabled = config.martingaleEnabled;
      }
      if (config.antiMartingaleEnabled !== undefined) {
        // Can't enable both martingale and anti-martingale
        if (config.antiMartingaleEnabled && existingConfig.martingaleEnabled) {
          updates.martingaleEnabled = false;
        }
        updates.antiMartingaleEnabled = config.antiMartingaleEnabled;
      }
      if (config.scheduleStart !== undefined) {
        if (config.scheduleStart < 0 || config.scheduleStart > 23) {
          throw new Error("Schedule start must be between 0 and 23");
        }
        updates.scheduleStart = config.scheduleStart;
      }
      if (config.scheduleEnd !== undefined) {
        if (config.scheduleEnd < 0 || config.scheduleEnd > 23) {
          throw new Error("Schedule end must be between 0 and 23");
        }
        updates.scheduleEnd = config.scheduleEnd;
      }
      if (config.smartSizing !== undefined) {
        updates.smartSizing = config.smartSizing;
      }
      if (config.smartSizingThreshold !== undefined) {
        updates.smartSizingThreshold = config.smartSizingThreshold;
      }
    }

    await ctx.db.patch(existingConfig._id, updates);

    return existingConfig._id;
  },
});

/**
 * Toggle bot active state
 */
export const toggleBotActive = mutation({
  args: {
    walletAddress: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, isActive } = args;

    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!config) {
      throw new Error("No bot configuration found");
    }

    // Validate that session signer is enabled before activating
    if (isActive && !config.sessionSignerEnabled) {
      throw new Error("Please enable session signer before activating the bot");
    }

    // Validate that budget limit is set
    if (isActive && (!config.budgetLimit || config.budgetLimit <= 0)) {
      throw new Error("Please set a budget limit before activating the bot");
    }

    await ctx.db.patch(config._id, {
      isActive,
      lastUpdated: Date.now(),
    });

    return { success: true, isActive };
  },
});

/**
 * Update session signer state
 */
export const updateSessionSignerState = mutation({
  args: {
    walletAddress: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, enabled } = args;

    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!config) {
      throw new Error("No bot configuration found");
    }

    // If disabling session signer, also deactivate the bot
    const updates: Record<string, unknown> = {
      sessionSignerEnabled: enabled,
      lastUpdated: Date.now(),
    };

    if (!enabled) {
      updates.isActive = false;
    }

    await ctx.db.patch(config._id, updates);

    return { success: true, sessionSignerEnabled: enabled };
  },
});

/**
 * Refill bot budget
 * Called after user sends additional SOL to treasury
 */
export const refillBudget = mutation({
  args: {
    walletAddress: v.string(),
    additionalBudget: v.number(),
    transactionSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, additionalBudget, transactionSignature } = args;

    if (additionalBudget < 10_000_000) {
      throw new Error("Minimum refill is 0.01 SOL");
    }

    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!config) {
      throw new Error("No bot configuration found");
    }

    const currentBudget = config.budgetLimit || 0;
    const newBudget = currentBudget + additionalBudget;

    await ctx.db.patch(config._id, {
      budgetLimit: newBudget,
      lastUpdated: Date.now(),
    });

    console.log(
      `[BotConfig] Budget refilled for ${walletAddress.slice(0, 8)}...: +${additionalBudget} lamports (tx: ${transactionSignature.slice(0, 8)}...)`
    );

    return { success: true, newBudget };
  },
});

/**
 * Reset bot stats (internal - called from bot executor after game ends)
 */
export const resetStreakAfterGame = internalMutation({
  args: {
    walletAddress: v.string(),
    won: v.boolean(),
    profit: v.number(),
    betAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, won, profit, betAmount } = args;

    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!config) return;

    const updates: Record<string, unknown> = {
      totalBets: (config.totalBets || 0) + 1,
      totalProfit: (config.totalProfit || 0) + profit,
      currentSpent: (config.currentSpent || 0) + betAmount,
      lastUpdated: Date.now(),
    };

    if (won) {
      updates.totalWins = (config.totalWins || 0) + 1;
      updates.consecutiveWins = (config.consecutiveWins || 0) + 1;
      updates.consecutiveLosses = 0;
    } else {
      updates.consecutiveLosses = (config.consecutiveLosses || 0) + 1;
      updates.consecutiveWins = 0;
    }

    await ctx.db.patch(config._id, updates);
  },
});

/**
 * Get all active bots (internal - used by bot executor)
 */
export const getActiveBots = internalQuery({
  args: {},
  handler: async (ctx) => {
    const activeBots = await ctx.db
      .query("botConfigurations")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter for bots with session signer enabled
    return activeBots.filter((bot) => bot.sessionSignerEnabled);
  },
});

/**
 * Deactivate bot (internal - called when budget exhausted or limits hit)
 */
export const deactivateBot = internalMutation({
  args: {
    walletAddress: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, reason } = args;

    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (!config) return;

    await ctx.db.patch(config._id, {
      isActive: false,
      lastUpdated: Date.now(),
    });

    console.log(`[BotConfig] Bot deactivated for ${walletAddress.slice(0, 8)}...: ${reason}`);
  },
});

/**
 * Increment skipped rounds counter (internal - for cooldown tracking)
 */
export const incrementSkippedRounds = internalMutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!config) return;

    await ctx.db.patch(config._id, {
      roundsSkipped: (config.roundsSkipped || 0) + 1,
      lastUpdated: Date.now(),
    });
  },
});

/**
 * Reset skipped rounds after betting (internal)
 */
export const resetSkippedRounds = internalMutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!config) return;

    await ctx.db.patch(config._id, {
      roundsSkipped: 0,
      lastUpdated: Date.now(),
    });
  },
});

/**
 * Get bot stats for display
 */
export const getBotStats = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("botConfigurations")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!config) {
      return null;
    }

    const totalBets = config.totalBets || 0;
    const totalWins = config.totalWins || 0;
    const totalProfit = config.totalProfit || 0;
    const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;

    return {
      totalBets,
      totalWins,
      totalLosses: totalBets - totalWins,
      winRate: winRate.toFixed(1),
      totalProfit,
      totalProfitSOL: totalProfit / 1_000_000_000,
      currentSpent: config.currentSpent || 0,
      budgetRemaining: (config.budgetLimit || 0) - (config.currentSpent || 0),
      consecutiveWins: config.consecutiveWins || 0,
      consecutiveLosses: config.consecutiveLosses || 0,
      isActive: config.isActive,
      sessionSignerEnabled: config.sessionSignerEnabled,
    };
  },
});

/**
 * Record a bot bet in performance history
 */
export const recordBotBet = internalMutation({
  args: {
    walletAddress: v.string(),
    roundId: v.number(),
    betAmount: v.number(),
    character: v.number(),
    position: v.array(v.number()),
    strategy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Record initial bet - result will be updated later
    await ctx.db.insert("botPerformanceStats", {
      walletAddress: args.walletAddress,
      roundId: args.roundId,
      betAmount: args.betAmount,
      result: "pending",
      profit: 0,
      timestamp: Date.now(),
      strategy: args.strategy,
    });
  },
});

/**
 * Update bot bet result after game ends
 */
export const updateBotBetResult = internalMutation({
  args: {
    walletAddress: v.string(),
    roundId: v.number(),
    result: v.string(),
    prizeAmount: v.optional(v.number()),
    profit: v.number(),
  },
  handler: async (ctx, args) => {
    const stat = await ctx.db
      .query("botPerformanceStats")
      .withIndex("by_wallet_and_round", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("roundId", args.roundId)
      )
      .first();

    if (stat) {
      await ctx.db.patch(stat._id, {
        result: args.result,
        prizeAmount: args.prizeAmount,
        profit: args.profit,
      });
    }
  },
});

/**
 * Get recent bot performance history
 */
export const getRecentBotPerformance = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const stats = await ctx.db
      .query("botPerformanceStats")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(limit);

    return stats.map((stat) => ({
      roundId: stat.roundId,
      betAmount: stat.betAmount,
      betAmountSOL: stat.betAmount / 1_000_000_000,
      result: stat.result,
      profit: stat.profit,
      profitSOL: stat.profit / 1_000_000_000,
      prizeAmount: stat.prizeAmount,
      prizeAmountSOL: stat.prizeAmount ? stat.prizeAmount / 1_000_000_000 : undefined,
      timestamp: stat.timestamp,
      strategy: stat.strategy,
    }));
  },
});

/**
 * Check if bot has already bet in this round
 */
export const hasBotBetThisRound = internalQuery({
  args: {
    walletAddress: v.string(),
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const bet = await ctx.db
      .query("botPerformanceStats")
      .withIndex("by_wallet_and_round", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("roundId", args.roundId)
      )
      .first();

    return bet !== null;
  },
});

/**
 * Get all bot bets for a specific round
 */
export const getBotBetsForRound = internalQuery({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all bets with pending result for this round
    const allStats = await ctx.db
      .query("botPerformanceStats")
      .collect();

    // Filter by roundId (since we don't have a dedicated index for roundId only)
    return allStats.filter((stat) => stat.roundId === args.roundId);
  },
});
