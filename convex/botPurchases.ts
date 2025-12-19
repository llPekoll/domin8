import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Bot tier pricing in lamports (1 SOL = 1_000_000_000 lamports)
export const BOT_PRICES = {
  rookie: 100_000_000, // 0.1 SOL
  pro: 500_000_000, // 0.5 SOL
  elite: 1_000_000_000, // 1.0 SOL
} as const;

export type BotTier = keyof typeof BOT_PRICES;

// Tier hierarchy for upgrades
const TIER_ORDER: BotTier[] = ["rookie", "pro", "elite"];

/**
 * Get user's active bot purchase
 */
export const getUserBotPurchase = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    // First try to get the active bot
    const purchases = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Return the active bot, or the highest tier if none is active
    const activeBot = purchases.find((p) => p.isActiveBot);
    if (activeBot) return activeBot;

    // Fallback: return highest tier bot (for backwards compatibility)
    const tierOrder: Record<string, number> = { rookie: 1, pro: 2, elite: 3 };
    return purchases.sort((a, b) => (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0))[0] || null;
  },
});

/**
 * Get all bots owned by user
 */
export const getAllUserBots = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const purchases = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    return purchases;
  },
});

/**
 * Get bot tier info (pricing, features)
 */
export const getBotTierInfo = query({
  args: {},
  handler: async () => {
    return {
      tiers: [
        {
          id: "rookie",
          name: "Rookie",
          price: BOT_PRICES.rookie,
          priceSOL: BOT_PRICES.rookie / 1_000_000_000,
          features: [
            "Fixed bet amount",
            "Single character",
            "Budget limit",
            "Auto-betting when away",
          ],
        },
        {
          id: "pro",
          name: "Pro",
          price: BOT_PRICES.pro,
          priceSOL: BOT_PRICES.pro / 1_000_000_000,
          features: [
            "Everything in Rookie",
            "Bet range (min/max)",
            "Stop-loss protection",
            "Win streak multiplier",
            "Cooldown between bets",
            "Character rotation",
          ],
        },
        {
          id: "elite",
          name: "Elite",
          price: BOT_PRICES.elite,
          priceSOL: BOT_PRICES.elite / 1_000_000_000,
          features: [
            "Everything in Pro",
            "Take profit auto-stop",
            "Martingale strategy",
            "Anti-Martingale strategy",
            "Time scheduling",
            "Smart pot sizing",
            "Performance stats",
          ],
        },
      ],
    };
  },
});

/**
 * Purchase a bot tier
 * Called after user has sent SOL to treasury wallet
 * Users can own multiple bots (one of each tier)
 */
export const purchaseBot = mutation({
  args: {
    walletAddress: v.string(),
    tier: v.string(),
    transactionSignature: v.string(),
    purchaseAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, tier, transactionSignature, purchaseAmount } = args;

    // Validate tier
    if (!TIER_ORDER.includes(tier as BotTier)) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Check if user already owns this specific tier
    const existingTierPurchase = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet_and_tier", (q) =>
        q.eq("walletAddress", walletAddress).eq("tier", tier)
      )
      .first();

    if (existingTierPurchase) {
      throw new Error(`You already own a ${tier} bot.`);
    }

    // Validate purchase amount matches tier price
    const expectedPrice = BOT_PRICES[tier as BotTier];
    if (purchaseAmount < expectedPrice) {
      throw new Error(
        `Insufficient payment. Expected ${expectedPrice} lamports, got ${purchaseAmount}`
      );
    }

    // Check if user has any other bots (to determine if this should be active)
    const existingBots = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .collect();

    const isFirstBot = existingBots.length === 0;

    // Record purchase (set as active if it's the first bot)
    const purchaseId = await ctx.db.insert("botPurchases", {
      walletAddress,
      tier,
      purchasedAt: Date.now(),
      transactionSignature,
      purchaseAmount,
      isActiveBot: isFirstBot,
    });

    // Create default bot configuration for this tier
    await ctx.db.insert("botConfigurations", {
      walletAddress,
      tier,
      isActive: false,
      fixedBetAmount: 1_000_000, // 0.001 SOL default
      selectedCharacter: 1, // Default character
      budgetLimit: 100_000_000, // 0.1 SOL default budget
      currentSpent: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalProfit: 0,
      totalBets: 0,
      totalWins: 0,
      sessionSignerEnabled: false,
      lastUpdated: Date.now(),
    });

    return purchaseId;
  },
});

/**
 * Set which bot tier is currently active for the user
 * Only one bot can be active at a time
 */
export const setActiveBot = mutation({
  args: {
    walletAddress: v.string(),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, tier } = args;

    // Validate tier
    if (!TIER_ORDER.includes(tier as BotTier)) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Check if user owns this tier
    const targetBot = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet_and_tier", (q) =>
        q.eq("walletAddress", walletAddress).eq("tier", tier)
      )
      .first();

    if (!targetBot) {
      throw new Error(`You don't own a ${tier} bot.`);
    }

    // Get all user's bots and deactivate them
    const allBots = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .collect();

    for (const bot of allBots) {
      if (bot._id !== targetBot._id && bot.isActiveBot) {
        await ctx.db.patch(bot._id, { isActiveBot: false });
      }
    }

    // Activate the target bot
    await ctx.db.patch(targetBot._id, { isActiveBot: true });

    return targetBot._id;
  },
});

/**
 * Get the price for a bot tier
 * Returns full price (no upgrade discounts - users buy each tier separately)
 */
export const getBotPrice = query({
  args: {
    walletAddress: v.string(),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, tier } = args;

    if (!TIER_ORDER.includes(tier as BotTier)) {
      return { error: "Invalid tier", cost: 0, costSOL: 0 };
    }

    // Check if user already owns this tier
    const existingPurchase = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet_and_tier", (q) =>
        q.eq("walletAddress", walletAddress).eq("tier", tier)
      )
      .first();

    if (existingPurchase) {
      return {
        error: "Already owned",
        cost: 0,
        costSOL: 0,
        owned: true,
      };
    }

    const price = BOT_PRICES[tier as BotTier];
    return {
      cost: price,
      costSOL: price / 1_000_000_000,
      owned: false,
    };
  },
});

/**
 * Internal mutation to record purchase (called from backend after tx verification)
 */
export const recordPurchaseInternal = internalMutation({
  args: {
    walletAddress: v.string(),
    tier: v.string(),
    transactionSignature: v.string(),
    purchaseAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, tier, transactionSignature, purchaseAmount } = args;

    // Check if user already owns this specific tier (idempotent)
    const existingTierPurchase = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet_and_tier", (q) =>
        q.eq("walletAddress", walletAddress).eq("tier", tier)
      )
      .first();

    if (existingTierPurchase) {
      console.log(`[BotPurchase] User ${walletAddress.slice(0, 8)}... already has ${tier} bot`);
      return existingTierPurchase._id;
    }

    // Check if user has any other bots (to determine if this should be active)
    const existingBots = await ctx.db
      .query("botPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .collect();

    const isFirstBot = existingBots.length === 0;

    // Record purchase
    const purchaseId = await ctx.db.insert("botPurchases", {
      walletAddress,
      tier,
      purchasedAt: Date.now(),
      transactionSignature,
      purchaseAmount,
      isActiveBot: isFirstBot,
    });

    // Create default bot configuration for this tier
    await ctx.db.insert("botConfigurations", {
      walletAddress,
      tier,
      isActive: false,
      fixedBetAmount: 1_000_000,
      selectedCharacter: 1,
      budgetLimit: 100_000_000,
      currentSpent: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      totalProfit: 0,
      totalBets: 0,
      totalWins: 0,
      sessionSignerEnabled: false,
      lastUpdated: Date.now(),
    });

    console.log(`[BotPurchase] Recorded ${tier} bot purchase for ${walletAddress.slice(0, 8)}...`);
    return purchaseId;
  },
});
