import { query } from "./_generated/server";

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
