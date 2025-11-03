import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all active maps (for demo mode preloading)
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

// Get map by numeric ID (for blockchain integration)
export const getMapByNumericId = query({
  args: { mapId: v.number() },
  handler: async (ctx, args) => {
    const map = await ctx.db
      .query("maps")
      .filter((q) => q.eq(q.field("id"), args.mapId))
      .first();

    return map || null;
  },
});
