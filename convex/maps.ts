import { query } from "./_generated/server";

// Get all active maps (for demo mode preloading and blockchain map enrichment)
export const getAllActiveMaps = query({
  args: {},
  handler: async (ctx) => {
    const maps = await ctx.db
      .query("maps")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return maps;
  },
});

// Note: Map lookup by numeric ID now handled client-side via MapContext.getMapById()
// This eliminates dynamic backend queries for map enrichment
