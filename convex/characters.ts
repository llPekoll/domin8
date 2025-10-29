import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all active characters
export const getActiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return characters;
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

// Note: Bet data with skin/position now comes directly from blockchain via useActiveGame hook
// No longer stored in Convex database - source of truth is on-chain