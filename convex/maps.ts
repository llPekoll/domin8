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

// Get map by ID
export const getMap = query({
  args: { mapId: v.id("maps") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.mapId);
  },
});

// Get a random map for demo mode (client-side only, nothing stored)
export const getRandomMap = query({
  args: {},
  handler: async (ctx) => {
    // Get all active maps
    const maps = await ctx.db
      .query("maps")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    if (maps.length === 0) {
      return null;
    }

    // Return a random map
    return maps[Math.floor(Math.random() * maps.length)];
  },
});

// Get a default map for display when no game is active
export const getDefaultMap = query({
  args: {},
  handler: async (ctx) => {
    // Get first active map
    const maps = await ctx.db
      .query("maps")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    if (maps.length === 0) {
      return null;
    }

    // Return a random map or the first one
    return maps[Math.floor(Math.random() * maps.length)];
  },
});

/**
 * Get the map for the current active game round
 * All players will see the same map for the current round
 */
export const getCurrentGameMap = query({
  args: {},
  handler: async (ctx) => {
    // Get the most recent "waiting" round (current active game)
    const currentRound = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .order("desc")
      .first();

    if (!currentRound || !currentRound.mapId) {
      // No active game or map not selected yet
      return null;
    }

    // Get the map details
    const map = await ctx.db.get(currentRound.mapId);
    return map;
  },
});
// Ellipse configuration (hardcoded since Convex can't import from src/config)
const ELLIPSE_RATIO_X = 1.8;     // 80% wider on horizontal axis
const ELLIPSE_RATIO_Y = 0.5;     // 50% flatter on vertical axis
const POSITION_JITTER_X = 60;    // Additional random X offset (±30 pixels)
const POSITION_JITTER_Y = 40;    // Additional random Y offset (±20 pixels)

// Calculate spawn positions for a map
export const calculateSpawnPositions = query({
  args: {
    mapId: v.id("maps"),
    participantCount: v.number(),
  },
  handler: async (ctx, args) => {
    const map = await ctx.db.get(args.mapId);
    if (!map) {
      throw new Error("Map not found");
    }

    const { spawnRadius } = map.spawnConfiguration;
    const positions = [];

    // Calculate positions in an ellipse around center with randomness
    const angleStep = (Math.PI * 2) / Math.max(args.participantCount, 8);

    for (let i = 0; i < args.participantCount; i++) {
      const angle = i * angleStep;

      // Apply ellipse transformation: wider on X-axis, flatter on Y-axis
      const baseX = 512 + Math.cos(angle) * spawnRadius * ELLIPSE_RATIO_X;
      const baseY = 384 + Math.sin(angle) * spawnRadius * ELLIPSE_RATIO_Y;

      // Add random jitter to make it messy
      const jitterX = (Math.random() - 0.5) * POSITION_JITTER_X;
      const jitterY = (Math.random() - 0.5) * POSITION_JITTER_Y;

      positions.push({
        x: baseX + jitterX,
        y: baseY + jitterY,
        angle
      });
    }

    return positions;
  },
});
