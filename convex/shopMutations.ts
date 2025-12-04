/**
 * Shop Mutations - Non-action functions for the shop system
 * Separated from shop.ts because "use node" files can only contain actions
 */

import { mutation, internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Item types that can be purchased
const itemTypes = v.union(v.literal("aura"), v.literal("character"));

/**
 * Offer/gift an item for free (admin/system use)
 * No payment required - used for promotions, rewards, etc.
 */
export const offerItem = mutation({
  args: {
    walletAddress: v.string(),
    itemType: itemTypes,
    itemId: v.number(),
    reason: v.optional(v.string()), // "promotion", "reward", "gift", etc.
  },
  handler: async (ctx, args) => {
    const { walletAddress, itemType, itemId, reason } = args;

    // Check ownership based on item type
    if (itemType === "aura") {
      const existingOwnership = await ctx.db
        .query("playerAuras")
        .withIndex("by_wallet_and_aura", (q) =>
          q.eq("walletAddress", walletAddress).eq("auraId", itemId)
        )
        .first();

      if (existingOwnership) {
        throw new Error("Player already owns this aura");
      }

      // Get aura details
      const aura = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", itemId))
        .first();

      if (!aura) {
        throw new Error("Aura not found");
      }

      if (!aura.isActive) {
        throw new Error("Aura is not available");
      }

      // Unlock the aura
      await ctx.db.insert("playerAuras", {
        walletAddress,
        auraId: itemId,
        unlockedAt: Date.now(),
        unlockedBy: "offer",
      });

      // Record in shop purchases
      await ctx.db.insert("shopPurchases", {
        txSignature: `offer_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        walletAddress,
        itemType: "aura",
        itemId,
        amountLamports: 0,
        status: "completed",
        attemptedAt: Date.now(),
        completedAt: Date.now(),
      });

      return { success: true, itemName: aura.name, reason };
    }

    // Future: Handle character offers
    if (itemType === "character") {
      throw new Error("Character purchases not yet implemented");
    }

    throw new Error("Unknown item type");
  },
});

/**
 * Create a purchase record at the start of a purchase
 * Called when user initiates a purchase
 */
export const createPurchase = mutation({
  args: {
    walletAddress: v.string(),
    itemType: v.string(),
    itemId: v.number(),
    amountLamports: v.number(),
  },
  handler: async (ctx, args) => {
    const purchaseId = await ctx.db.insert("shopPurchases", {
      walletAddress: args.walletAddress,
      itemType: args.itemType,
      itemId: args.itemId,
      amountLamports: args.amountLamports,
      status: "pending",
      attemptedAt: Date.now(),
    });

    return { purchaseId };
  },
});

/**
 * Update a purchase status
 * Called at each step of the purchase process
 */
export const updatePurchase = mutation({
  args: {
    purchaseId: v.id("shopPurchases"),
    status: v.string(),
    txSignature: v.optional(v.string()),
    error: v.optional(v.string()),
    errorStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { purchaseId, status, txSignature, error, errorStep } = args;

    const updateData: {
      status: string;
      txSignature?: string;
      error?: string;
      errorStep?: string;
      completedAt?: number;
    } = { status };

    if (txSignature) {
      updateData.txSignature = txSignature;
    }

    if (error) {
      updateData.error = error;
    }

    if (errorStep) {
      updateData.errorStep = errorStep;
    }

    // Mark as completed if final state
    if (status === "completed" || status === "failed") {
      updateData.completedAt = Date.now();
    }

    await ctx.db.patch(purchaseId, updateData);

    return { success: true };
  },
});

/**
 * Complete a purchase - unlock the item after tx is confirmed
 * Called after transaction is confirmed on-chain
 */
export const completePurchase = mutation({
  args: {
    purchaseId: v.id("shopPurchases"),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const { purchaseId, txSignature } = args;

    // Get the purchase record
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) {
      throw new Error("Purchase not found");
    }

    // Check for double-spend (tx signature already used by another purchase)
    const existingTx = await ctx.db
      .query("shopPurchases")
      .withIndex("by_signature", (q) => q.eq("txSignature", txSignature))
      .first();

    if (existingTx && existingTx._id !== purchaseId) {
      throw new Error("Transaction already used for a purchase");
    }

    const { walletAddress, itemType, itemId, amountLamports } = purchase;
    let itemName = "Unknown";

    // Handle based on item type
    if (itemType === "aura") {
      // Check if already owns
      const existingOwnership = await ctx.db
        .query("playerAuras")
        .withIndex("by_wallet_and_aura", (q) =>
          q.eq("walletAddress", walletAddress).eq("auraId", itemId)
        )
        .first();

      if (existingOwnership) {
        throw new Error("Player already owns this aura");
      }

      // Get aura details
      const aura = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", itemId))
        .first();

      if (!aura) {
        throw new Error("Aura not found");
      }

      if (!aura.isActive) {
        throw new Error("Aura is not available");
      }

      // Verify price matches (allow some tolerance for fees)
      if (aura.purchasePrice && Math.abs(aura.purchasePrice - amountLamports) > 1000) {
        throw new Error(`Price mismatch: expected ${aura.purchasePrice}, got ${amountLamports}`);
      }

      itemName = aura.name;

      // Unlock the aura
      await ctx.db.insert("playerAuras", {
        walletAddress,
        auraId: itemId,
        unlockedAt: Date.now(),
        unlockedBy: "purchase",
      });
    } else if (itemType === "character") {
      // Future: Handle character purchases
      throw new Error("Character purchases not yet implemented");
    } else {
      throw new Error("Unknown item type");
    }

    // Update purchase record as completed
    await ctx.db.patch(purchaseId, {
      status: "completed",
      txSignature,
      completedAt: Date.now(),
    });

    // Update player last active
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (player) {
      await ctx.db.patch(player._id, {
        lastActive: Date.now(),
      });
    }

    return { success: true, itemName };
  },
});

/**
 * Get purchase history for a wallet (includes all attempts)
 */
export const getPurchaseHistory = query({
  args: {
    walletAddress: v.string(),
    status: v.optional(v.string()), // Filter by status
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("shopPurchases")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress));

    const purchases = await query.order("desc").take(args.limit ?? 50);

    // Filter by status if provided
    if (args.status) {
      return purchases.filter((p) => p.status === args.status);
    }

    return purchases;
  },
});

/**
 * Get only completed purchases for a wallet
 */
export const getCompletedPurchases = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const purchases = await ctx.db
      .query("shopPurchases")
      .withIndex("by_wallet_and_status", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("status", "completed")
      )
      .collect();

    return purchases;
  },
});

/**
 * Internal mutation to record a purchase after verification (called by shop.ts action)
 * Creates a completed purchase record and unlocks the item
 */
export const recordPurchase = internalMutation({
  args: {
    walletAddress: v.string(),
    itemType: v.string(),
    itemId: v.number(),
    txSignature: v.string(),
    amountLamports: v.number(),
    unlockedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, itemType, itemId, txSignature, amountLamports, unlockedBy } = args;

    // Check for double-spend (tx signature already used)
    const existingTx = await ctx.db
      .query("shopPurchases")
      .withIndex("by_signature", (q) => q.eq("txSignature", txSignature))
      .first();

    if (existingTx) {
      throw new Error("Transaction already used for a purchase");
    }

    let itemName = "Unknown";

    // Handle based on item type
    if (itemType === "aura") {
      // Check if already owns
      const existingOwnership = await ctx.db
        .query("playerAuras")
        .withIndex("by_wallet_and_aura", (q) =>
          q.eq("walletAddress", walletAddress).eq("auraId", itemId)
        )
        .first();

      if (existingOwnership) {
        throw new Error("Player already owns this aura");
      }

      // Get aura details
      const aura = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", itemId))
        .first();

      if (!aura) {
        throw new Error("Aura not found");
      }

      if (!aura.isActive) {
        throw new Error("Aura is not available");
      }

      // Verify price matches
      if (aura.purchasePrice && aura.purchasePrice !== amountLamports) {
        throw new Error(`Price mismatch: expected ${aura.purchasePrice}, got ${amountLamports}`);
      }

      itemName = aura.name;

      // Unlock the aura
      await ctx.db.insert("playerAuras", {
        walletAddress,
        auraId: itemId,
        unlockedAt: Date.now(),
        unlockedBy,
      });
    } else if (itemType === "character") {
      throw new Error("Character purchases not yet implemented");
    } else {
      throw new Error("Unknown item type");
    }

    // Record the purchase as completed
    await ctx.db.insert("shopPurchases", {
      walletAddress,
      itemType,
      itemId,
      amountLamports,
      status: "completed",
      txSignature,
      attemptedAt: Date.now(),
      completedAt: Date.now(),
    });

    // Update player last active
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (player) {
      await ctx.db.patch(player._id, {
        lastActive: Date.now(),
      });
    }

    return { success: true, itemName };
  },
});

/**
 * Internal mutation to record a failed purchase attempt (called by shop.ts action)
 */
export const recordFailedPurchase = internalMutation({
  args: {
    walletAddress: v.string(),
    itemType: v.string(),
    itemId: v.number(),
    amountLamports: v.number(),
    error: v.string(),
    errorStep: v.string(),
    txSignature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("shopPurchases", {
      walletAddress: args.walletAddress,
      itemType: args.itemType,
      itemId: args.itemId,
      amountLamports: args.amountLamports,
      status: "failed",
      error: args.error,
      errorStep: args.errorStep,
      txSignature: args.txSignature,
      attemptedAt: Date.now(),
      completedAt: Date.now(),
    });
  },
});
