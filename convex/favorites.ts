import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get player's favorite character IDs
 */
export const getPlayerFavorites = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("playerFavorites")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    // Return character IDs ordered by favoritedAt
    return favorites
      .sort((a, b) => a.favoritedAt - b.favoritedAt)
      .map((f) => f.characterId);
  },
});

/**
 * Toggle favorite status for a character
 */
export const toggleFavorite = mutation({
  args: {
    walletAddress: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if already favorited
    const existing = await ctx.db
      .query("playerFavorites")
      .withIndex("by_wallet_and_character", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("characterId", args.characterId)
      )
      .first();

    if (existing) {
      // Remove from favorites
      await ctx.db.delete(existing._id);
      return { isFavorite: false };
    } else {
      // Add to favorites
      await ctx.db.insert("playerFavorites", {
        walletAddress: args.walletAddress,
        characterId: args.characterId,
        favoritedAt: Date.now(),
      });
      return { isFavorite: true };
    }
  },
});

/**
 * Check if a character is favorited
 */
export const isFavorite = query({
  args: {
    walletAddress: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    const favorite = await ctx.db
      .query("playerFavorites")
      .withIndex("by_wallet_and_character", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("characterId", args.characterId)
      )
      .first();

    return favorite !== null;
  },
});

/**
 * Clear all favorites for a player
 */
export const clearAllFavorites = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("playerFavorites")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    for (const fav of favorites) {
      await ctx.db.delete(fav._id);
    }

    return { cleared: favorites.length };
  },
});
