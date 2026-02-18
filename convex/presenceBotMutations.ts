/**
 * Presence Bot Mutations/Queries - Database operations for presence bot
 * These run in the Convex runtime (not Node.js)
 */
import { internalMutation, mutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Bot configuration
const BOT_SPAWN_DELAY_MS = 5000; // 5 seconds delay after user arrives

/**
 * Get all active character IDs from the database
 */
export const getActiveCharacterIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    return characters.map((c) => c.id);
  },
});

/**
 * Check if bot was already spawned for a round
 */
export const wasBotSpawnedForRound = internalQuery({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presenceBotSpawns")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .first();
    return !!existing;
  },
});

/**
 * Mark bot as spawned for a round
 */
export const markBotSpawned = internalMutation({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    // Check if already marked (prevent race conditions)
    const existing = await ctx.db
      .query("presenceBotSpawns")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .first();

    if (existing) {
      return false; // Already spawned
    }

    await ctx.db.insert("presenceBotSpawns", {
      roundId: args.roundId,
      spawnedAt: Date.now(),
    });
    return true;
  },
});

/**
 * Frontend calls this when user views the arena
 * Schedules bot spawn check after 5 seconds
 */
export const recordArenaView = mutation({
  args: {},
  handler: async (ctx) => {
    // Schedule the bot spawn check after 5 seconds
    await ctx.scheduler.runAfter(BOT_SPAWN_DELAY_MS, internal.presenceBot.checkAndSpawnBot, {});
    console.log("[PresenceBot] Arena view recorded, bot check scheduled in 5s");
  },
});

/**
 * Cleanup old bot spawn records (older than 24 hours)
 * Can be called periodically to prevent table bloat
 */
export const cleanupOldSpawns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const oldSpawns = await ctx.db
      .query("presenceBotSpawns")
      .filter((q) => q.lt(q.field("spawnedAt"), cutoff))
      .collect();

    for (const spawn of oldSpawns) {
      await ctx.db.delete(spawn._id);
    }

    if (oldSpawns.length > 0) {
      console.log(`[PresenceBot] Cleaned up ${oldSpawns.length} old spawn records`);
    }
  },
});
