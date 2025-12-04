import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all active auras
 */
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("auras")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Get a specific aura by ID
 */
export const getById = query({
  args: { auraId: v.number() },
  handler: async (ctx, args) => {
    const aura = await ctx.db
      .query("auras")
      .withIndex("by_aura_id", (q) => q.eq("id", args.auraId))
      .first();
    return aura;
  },
});

/**
 * Get all auras unlocked by a player
 */
export const getPlayerAuras = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const playerAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Get full aura details for each unlocked aura
    const auraDetails = await Promise.all(
      playerAuras.map(async (pa) => {
        const aura = await ctx.db
          .query("auras")
          .withIndex("by_aura_id", (q) => q.eq("id", pa.auraId))
          .first();
        return {
          ...pa,
          aura,
        };
      })
    );

    return auraDetails;
  },
});

/**
 * Get player's currently equipped aura
 */
export const getEquippedAura = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player?.equippedAuraId) {
      return null;
    }

    const aura = await ctx.db
      .query("auras")
      .withIndex("by_aura_id", (q) => q.eq("id", player.equippedAuraId!))
      .first();

    return aura;
  },
});

/**
 * Check if player owns a specific aura
 */
export const playerOwnsAura = query({
  args: { walletAddress: v.string(), auraId: v.number() },
  handler: async (ctx, args) => {
    const playerAura = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet_and_aura", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("auraId", args.auraId)
      )
      .first();

    return !!playerAura;
  },
});

/**
 * Unlock an aura using points
 */
export const unlockWithPoints = mutation({
  args: { walletAddress: v.string(), auraId: v.number() },
  handler: async (ctx, args) => {
    // 1. Get aura definition
    const aura = await ctx.db
      .query("auras")
      .withIndex("by_aura_id", (q) => q.eq("id", args.auraId))
      .first();

    if (!aura) {
      throw new Error("Aura not found");
    }

    if (!aura.isActive) {
      throw new Error("Aura is not available");
    }

    if (!aura.pointsCost) {
      throw new Error("Aura cannot be unlocked with points");
    }

    // 2. Check if player already owns this aura
    const existingOwnership = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet_and_aura", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("auraId", args.auraId)
      )
      .first();

    if (existingOwnership) {
      throw new Error("You already own this aura");
    }

    // 3. Get player and check points
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    const currentPoints = player.totalPoints ?? 0;
    if (currentPoints < aura.pointsCost) {
      throw new Error(
        `Not enough points. Need ${aura.pointsCost}, have ${currentPoints}`
      );
    }

    // 4. Deduct points from player
    await ctx.db.patch(player._id, {
      totalPoints: currentPoints - aura.pointsCost,
      lastActive: Date.now(),
    });

    // 5. Add to playerAuras
    await ctx.db.insert("playerAuras", {
      walletAddress: args.walletAddress,
      auraId: args.auraId,
      unlockedAt: Date.now(),
      unlockedBy: "points",
    });

    return { success: true, auraName: aura.name };
  },
});

/**
 * Record an aura purchase (called after SOL payment is confirmed)
 */
export const recordPurchase = mutation({
  args: {
    walletAddress: v.string(),
    auraId: v.number(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Get aura definition
    const aura = await ctx.db
      .query("auras")
      .withIndex("by_aura_id", (q) => q.eq("id", args.auraId))
      .first();

    if (!aura) {
      throw new Error("Aura not found");
    }

    if (!aura.isActive) {
      throw new Error("Aura is not available");
    }

    // 2. Check if player already owns this aura
    const existingOwnership = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet_and_aura", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("auraId", args.auraId)
      )
      .first();

    if (existingOwnership) {
      throw new Error("You already own this aura");
    }

    // 3. Add to playerAuras
    await ctx.db.insert("playerAuras", {
      walletAddress: args.walletAddress,
      auraId: args.auraId,
      unlockedAt: Date.now(),
      unlockedBy: "purchase",
    });

    // 4. Ensure player record exists
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (player) {
      await ctx.db.patch(player._id, {
        lastActive: Date.now(),
      });
    }

    return { success: true, auraName: aura.name, txSignature: args.txSignature };
  },
});

/**
 * Equip an aura (or unequip by passing null)
 */
export const equipAura = mutation({
  args: {
    walletAddress: v.string(),
    auraId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Get player
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    // 2. If auraId provided, verify player owns it
    if (args.auraId !== undefined && args.auraId !== null) {
      const ownership = await ctx.db
        .query("playerAuras")
        .withIndex("by_wallet_and_aura", (q) =>
          q.eq("walletAddress", args.walletAddress).eq("auraId", args.auraId!)
        )
        .first();

      if (!ownership) {
        throw new Error("You don't own this aura");
      }

      // Verify aura exists and is active
      const aura = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", args.auraId!))
        .first();

      if (!aura || !aura.isActive) {
        throw new Error("Aura not available");
      }
    }

    // 3. Update player's equipped aura
    await ctx.db.patch(player._id, {
      equippedAuraId: args.auraId ?? undefined,
      lastActive: Date.now(),
    });

    return { success: true, equippedAuraId: args.auraId ?? null };
  },
});

/**
 * Seed auras from JSON (admin function)
 */
export const seedAuras = mutation({
  args: {
    auras: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        assetKey: v.string(),
        description: v.optional(v.string()),
        rarity: v.string(),
        pointsCost: v.optional(v.number()),
        purchasePrice: v.optional(v.number()),
        isActive: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const auraData of args.auras) {
      // Check if aura exists
      const existing = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", auraData.id))
        .first();

      if (existing) {
        // Update existing
        await ctx.db.patch(existing._id, auraData);
        updated++;
      } else {
        // Insert new
        await ctx.db.insert("auras", auraData);
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
