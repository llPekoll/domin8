import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Import seed data (will be inlined at build time)
import charactersData from "../seed/characters.json";
import lootboxTypesData from "../seed/lootboxTypes.json";
import lootboxDropsData from "../seed/lootboxDrops.json";
import aurasData from "../seed/auras.json";

/**
 * Seed all game data
 * Run this once after schema updates to populate characters, lootboxes, etc.
 *
 * Usage: npx convex run seed:seedAll
 */
export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      characters: { inserted: 0, updated: 0, skipped: 0 },
      lootboxTypes: { inserted: 0, updated: 0, skipped: 0 },
      lootboxDrops: { inserted: 0, updated: 0, skipped: 0 },
      auras: { inserted: 0, updated: 0, skipped: 0 },
    };

    // Seed characters
    for (const char of charactersData as any[]) {
      const existing = await ctx.db
        .query("characters")
        .filter((q) => q.eq(q.field("id"), char.id))
        .first();

      if (existing) {
        // Update existing character
        await ctx.db.patch(existing._id, {
          name: char.name,
          displayName: char.displayName,
          assetPath: char.assetPath,
          description: char.description,
          characterType: char.characterType,
          evolutionLine: char.evolutionLine,
          evolutionLevel: char.evolutionLevel,
          winsRequired: char.winsRequired,
          nftCollection: char.nftCollection,
          nftCollectionName: char.nftCollectionName,
          rarity: char.rarity,
          assetVersion: char.assetVersion,
          isActive: char.isActive,
        });
        results.characters.updated++;
      } else {
        // Insert new character
        await ctx.db.insert("characters", {
          id: char.id,
          name: char.name,
          displayName: char.displayName,
          assetPath: char.assetPath,
          description: char.description,
          characterType: char.characterType,
          evolutionLine: char.evolutionLine,
          evolutionLevel: char.evolutionLevel,
          winsRequired: char.winsRequired,
          nftCollection: char.nftCollection,
          nftCollectionName: char.nftCollectionName,
          rarity: char.rarity,
          assetVersion: char.assetVersion,
          isActive: char.isActive,
        });
        results.characters.inserted++;
      }
    }

    // Seed lootbox types
    for (const lootbox of lootboxTypesData as any[]) {
      const existing = await ctx.db
        .query("lootboxTypes")
        .withIndex("by_lootbox_id", (q) => q.eq("id", lootbox.id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: lootbox.name,
          description: lootbox.description,
          price: lootbox.price,
          assetKey: lootbox.assetKey,
          isActive: lootbox.isActive,
        });
        results.lootboxTypes.updated++;
      } else {
        await ctx.db.insert("lootboxTypes", {
          id: lootbox.id,
          name: lootbox.name,
          description: lootbox.description,
          price: lootbox.price,
          assetKey: lootbox.assetKey,
          isActive: lootbox.isActive,
        });
        results.lootboxTypes.inserted++;
      }
    }

    // Clear and re-seed lootbox drops (easier than trying to match)
    const existingDrops = await ctx.db.query("lootboxDrops").collect();
    for (const drop of existingDrops) {
      await ctx.db.delete(drop._id);
    }

    for (const drop of lootboxDropsData as any[]) {
      await ctx.db.insert("lootboxDrops", {
        lootboxTypeId: drop.lootboxTypeId,
        itemType: drop.itemType,
        itemId: drop.itemId,
        weight: drop.weight,
        rarity: drop.rarity,
      });
      results.lootboxDrops.inserted++;
    }

    // Seed auras
    for (const aura of aurasData as any[]) {
      const existing = await ctx.db
        .query("auras")
        .withIndex("by_aura_id", (q) => q.eq("id", aura.id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: aura.name,
          assetKey: aura.assetKey,
          description: aura.description,
          rarity: aura.rarity,
          pointsCost: aura.pointsCost,
          purchasePrice: aura.purchasePrice,
          isActive: aura.isActive,
        });
        results.auras.updated++;
      } else {
        await ctx.db.insert("auras", {
          id: aura.id,
          name: aura.name,
          assetKey: aura.assetKey,
          description: aura.description,
          rarity: aura.rarity,
          pointsCost: aura.pointsCost,
          purchasePrice: aura.purchasePrice,
          isActive: aura.isActive,
        });
        results.auras.inserted++;
      }
    }

    return results;
  },
});

/**
 * Seed only characters
 * Usage: npx convex run seed:seedCharacters
 */
export const seedCharacters = mutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let updated = 0;

    for (const char of charactersData as any[]) {
      const existing = await ctx.db
        .query("characters")
        .filter((q) => q.eq(q.field("id"), char.id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: char.name,
          displayName: char.displayName,
          assetPath: char.assetPath,
          description: char.description,
          characterType: char.characterType,
          evolutionLine: char.evolutionLine,
          evolutionLevel: char.evolutionLevel,
          winsRequired: char.winsRequired,
          nftCollection: char.nftCollection,
          nftCollectionName: char.nftCollectionName,
          rarity: char.rarity,
          assetVersion: char.assetVersion,
          isActive: char.isActive,
        });
        updated++;
      } else {
        await ctx.db.insert("characters", {
          id: char.id,
          name: char.name,
          displayName: char.displayName,
          assetPath: char.assetPath,
          description: char.description,
          characterType: char.characterType,
          evolutionLine: char.evolutionLine,
          evolutionLevel: char.evolutionLevel,
          winsRequired: char.winsRequired,
          nftCollection: char.nftCollection,
          nftCollectionName: char.nftCollectionName,
          rarity: char.rarity,
          assetVersion: char.assetVersion,
          isActive: char.isActive,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: charactersData.length };
  },
});

/**
 * Seed only lootbox data (types and drops)
 * Usage: npx convex run seed:seedLootboxes
 */
export const seedLootboxes = mutation({
  args: {},
  handler: async (ctx) => {
    const results = {
      types: { inserted: 0, updated: 0 },
      drops: { inserted: 0 },
    };

    // Seed lootbox types
    for (const lootbox of lootboxTypesData as any[]) {
      const existing = await ctx.db
        .query("lootboxTypes")
        .withIndex("by_lootbox_id", (q) => q.eq("id", lootbox.id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: lootbox.name,
          description: lootbox.description,
          price: lootbox.price,
          assetKey: lootbox.assetKey,
          isActive: lootbox.isActive,
        });
        results.types.updated++;
      } else {
        await ctx.db.insert("lootboxTypes", {
          id: lootbox.id,
          name: lootbox.name,
          description: lootbox.description,
          price: lootbox.price,
          assetKey: lootbox.assetKey,
          isActive: lootbox.isActive,
        });
        results.types.inserted++;
      }
    }

    // Clear and re-seed drops
    const existingDrops = await ctx.db.query("lootboxDrops").collect();
    for (const drop of existingDrops) {
      await ctx.db.delete(drop._id);
    }

    for (const drop of lootboxDropsData as any[]) {
      await ctx.db.insert("lootboxDrops", {
        lootboxTypeId: drop.lootboxTypeId,
        itemType: drop.itemType,
        itemId: drop.itemId,
        weight: drop.weight,
        rarity: drop.rarity,
      });
      results.drops.inserted++;
    }

    return results;
  },
});

/**
 * Clear all characters (use with caution!)
 * Usage: npx convex run seed:clearCharacters
 */
export const clearCharacters = mutation({
  args: { confirm: v.boolean() },
  handler: async (ctx, args) => {
    if (!args.confirm) {
      throw new Error("You must pass confirm: true to clear characters");
    }

    const characters = await ctx.db.query("characters").collect();
    for (const char of characters) {
      await ctx.db.delete(char._id);
    }

    return { deleted: characters.length };
  },
});

/**
 * Get seed data summary
 * Usage: npx convex run seed:getSeedSummary
 */
export const getSeedSummary = mutation({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db.query("characters").collect();
    const lootboxTypes = await ctx.db.query("lootboxTypes").collect();
    const lootboxDrops = await ctx.db.query("lootboxDrops").collect();
    const auras = await ctx.db.query("auras").collect();

    // Group characters by type
    const charsByType: Record<string, number> = {};
    for (const char of characters) {
      const type = char.characterType || "unknown";
      charsByType[type] = (charsByType[type] || 0) + 1;
    }

    return {
      characters: {
        total: characters.length,
        byType: charsByType,
      },
      lootboxTypes: {
        total: lootboxTypes.length,
      },
      lootboxDrops: {
        total: lootboxDrops.length,
      },
      auras: {
        total: auras.length,
      },
      seedDataCounts: {
        characters: charactersData.length,
        lootboxTypes: lootboxTypesData.length,
        lootboxDrops: lootboxDropsData.length,
        auras: aurasData.length,
      },
    };
  },
});
