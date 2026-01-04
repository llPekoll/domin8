import { v } from "convex/values";
import { query } from "./_generated/server";

export const getActiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Sort by ID for consistent ordering across all clients
    // This ensures the same character appears at the same index on every page load
    return characters.sort((a, b) => a.id - b.id);
  },
});

// Get character by ID
export const getCharacter = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);
    return character;
  },
});

// Get random active character
export const getRandomCharacter = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    if (characters.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * characters.length);
    return characters[randomIndex];
  },
});

// Get characters by NFT collection address
export const getCharactersByCollection = query({
  args: { nftCollection: v.string() },
  handler: async (ctx, args) => {
    const characters = await ctx.db
      .query("characters")
      .filter((q) => q.eq(q.field("nftCollection"), args.nftCollection))
      .collect();

    return characters;
  },
});

// Get all characters with NFT collection requirement (exclusive characters)
export const getExclusiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .filter((q) => q.neq(q.field("nftCollection"), undefined))
      .collect();

    return characters;
  },
});

// Note: Bet data with skin/position now comes directly from blockchain via useActiveGame hook
// No longer stored in Convex database - source of truth is on-chain
