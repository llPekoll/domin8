import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get available lootbox types
 */
export const getLootboxTypes = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("lootboxTypes")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Get a specific lootbox type by ID
 */
export const getLootboxType = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lootboxTypes")
      .withIndex("by_lootbox_id", (q) => q.eq("id", args.id))
      .first();
  },
});

/**
 * Get player's unopened lootboxes
 */
export const getPlayerLootboxes = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerLootboxes")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

/**
 * Get count of player's unopened lootboxes
 */
export const getPlayerLootboxCount = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const lootboxes = await ctx.db
      .query("playerLootboxes")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    return lootboxes.length;
  },
});

/**
 * Get items player can still get from lootboxes (for UI transparency)
 */
export const getAvailableDrops = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", (q) => q.eq("lootboxTypeId", 1))
      .collect();

    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedAuraIds = new Set(ownedAuras.map((a) => a.auraId));
    const ownedCharIds = new Set(ownedCharacters.map((c) => c.characterId));

    // Filter to items player doesn't own
    const availableDrops = allDrops.filter((drop) => {
      if (drop.itemType === "aura") {
        return !ownedAuraIds.has(drop.itemId);
      }
      if (drop.itemType === "character") {
        return !ownedCharIds.has(drop.itemId);
      }
      return true;
    });

    // Get details for each available drop
    const dropsWithDetails = await Promise.all(
      availableDrops.map(async (drop) => {
        let itemDetails = null;
        if (drop.itemType === "character") {
          itemDetails = await ctx.db
            .query("characters")
            .filter((q) => q.eq(q.field("id"), drop.itemId))
            .first();
        } else if (drop.itemType === "aura") {
          itemDetails = await ctx.db
            .query("auras")
            .withIndex("by_aura_id", (q) => q.eq("id", drop.itemId))
            .first();
        }
        return { ...drop, itemDetails };
      })
    );

    return dropsWithDetails;
  },
});

/**
 * Get collection progress
 */
export const getCollectionProgress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", (q) => q.eq("lootboxTypeId", 1))
      .collect();

    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Count owned items that are in the lootbox pool
    const ownedAuraIds = new Set(ownedAuras.map((a) => a.auraId));
    const ownedCharIds = new Set(ownedCharacters.map((c) => c.characterId));

    let ownedFromLootbox = 0;
    for (const drop of allDrops) {
      if (drop.itemType === "aura" && ownedAuraIds.has(drop.itemId)) {
        ownedFromLootbox++;
      } else if (
        drop.itemType === "character" &&
        ownedCharIds.has(drop.itemId)
      ) {
        ownedFromLootbox++;
      }
    }

    const totalItems = allDrops.length;

    return {
      owned: ownedFromLootbox,
      total: totalItems,
      remaining: totalItems - ownedFromLootbox,
      complete: ownedFromLootbox >= totalItems,
      percentage: Math.round((ownedFromLootbox / totalItems) * 100),
    };
  },
});

/**
 * Add a lootbox to player's inventory (called after successful purchase)
 */
export const addLootboxToInventory = internalMutation({
  args: {
    walletAddress: v.string(),
    lootboxTypeId: v.number(),
    txSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("playerLootboxes", {
      walletAddress: args.walletAddress,
      lootboxTypeId: args.lootboxTypeId,
      purchasedAt: Date.now(),
      txSignature: args.txSignature,
    });
    return { id };
  },
});

/**
 * Open a lootbox (shrinking pool - no duplicates)
 */
export const openLootbox = mutation({
  args: {
    walletAddress: v.string(),
    lootboxId: v.id("playerLootboxes"),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    const lootbox = await ctx.db.get(args.lootboxId);
    if (!lootbox || lootbox.walletAddress !== args.walletAddress) {
      throw new Error("Lootbox not found or not owned");
    }

    // Get all possible drops for this lootbox type
    const allDrops = await ctx.db
      .query("lootboxDrops")
      .withIndex("by_lootbox_type", (q) =>
        q.eq("lootboxTypeId", lootbox.lootboxTypeId)
      )
      .collect();

    // Get owned items
    const ownedAuras = await ctx.db
      .query("playerAuras")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedCharacters = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const ownedAuraIds = new Set(ownedAuras.map((a) => a.auraId));
    const ownedCharIds = new Set(ownedCharacters.map((c) => c.characterId));

    // Filter to available drops (SHRINKING POOL - no duplicates!)
    const availableDrops = allDrops.filter((drop) => {
      if (drop.itemType === "aura") {
        return !ownedAuraIds.has(drop.itemId);
      }
      if (drop.itemType === "character") {
        return !ownedCharIds.has(drop.itemId);
      }
      return true;
    });

    if (availableDrops.length === 0) {
      throw new Error("You already own everything from this lootbox!");
    }

    // Calculate total weight of available items
    const totalWeight = availableDrops.reduce((sum, d) => sum + d.weight, 0);

    // Roll random number
    const roll = Math.random() * totalWeight;

    // Find winner using weighted selection
    let cumulative = 0;
    let winner = availableDrops[0];

    for (const drop of availableDrops) {
      cumulative += drop.weight;
      if (roll < cumulative) {
        winner = drop;
        break;
      }
    }

    // Unlock the item
    if (winner.itemType === "aura") {
      await ctx.db.insert("playerAuras", {
        walletAddress: args.walletAddress,
        auraId: winner.itemId,
        unlockedAt: Date.now(),
        unlockedBy: "lootbox",
      });
    } else if (winner.itemType === "character") {
      await ctx.db.insert("playerCharacters", {
        walletAddress: args.walletAddress,
        characterId: winner.itemId,
        unlockedAt: Date.now(),
        unlockedBy: "lootbox",
      });
    }

    // Delete the lootbox from inventory
    await ctx.db.delete(args.lootboxId);

    // Record opening history
    await ctx.db.insert("lootboxOpenings", {
      walletAddress: args.walletAddress,
      lootboxTypeId: lootbox.lootboxTypeId,
      itemType: winner.itemType,
      itemId: winner.itemId,
      rarity: winner.rarity,
      openedAt: Date.now(),
    });

    // Get item details for animation/display
    let itemDetails = null;
    if (winner.itemType === "character") {
      itemDetails = await ctx.db
        .query("characters")
        .filter((q) => q.eq(q.field("id"), winner.itemId))
        .first();
    } else if (winner.itemType === "aura") {
      itemDetails = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", winner.itemId))
        .first();
    }

    return {
      itemType: winner.itemType,
      itemId: winner.itemId,
      rarity: winner.rarity,
      itemDetails,
    };
  },
});

/**
 * Get opening history for a player
 */
export const getOpeningHistory = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const openings = await ctx.db
      .query("lootboxOpenings")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(50);

    // Get details for each opening
    const openingsWithDetails = await Promise.all(
      openings.map(async (opening) => {
        let itemDetails = null;
        if (opening.itemType === "character") {
          itemDetails = await ctx.db
            .query("characters")
            .filter((q) => q.eq(q.field("id"), opening.itemId))
            .first();
        } else if (opening.itemType === "aura") {
          itemDetails = await ctx.db
            .query("auras")
            .withIndex("by_aura_id", (q) => q.eq("id", opening.itemId))
            .first();
        }
        return { ...opening, itemDetails };
      })
    );

    return openingsWithDetails;
  },
});

/**
 * Get owned lootbox characters for a player
 */
export const getOwnedCharacters = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Get character details
    const ownedWithDetails = await Promise.all(
      owned.map(async (o) => {
        const character = await ctx.db
          .query("characters")
          .filter((q) => q.eq(q.field("id"), o.characterId))
          .first();
        return { ...o, character };
      })
    );

    return ownedWithDetails;
  },
});

/**
 * Check if player owns a specific character
 */
export const ownsCharacter = query({
  args: {
    walletAddress: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet_and_character", (q) =>
        q
          .eq("walletAddress", args.walletAddress)
          .eq("characterId", args.characterId)
      )
      .first();
    return owned !== null;
  },
});
