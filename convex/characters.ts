import { query } from "./_generated/server";

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

// Note: Character selection and randomization handled client-side
// Bet data with skin/position comes directly from blockchain via useActiveGame hook