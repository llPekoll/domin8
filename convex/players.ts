import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPlayer = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      return null;
    }

    return player;
  },
});

export const getPlayerWithCharacter = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      return null;
    }

    // Get a random character for the player (since players don't have persistent characters)
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const character = characters.length > 0
      ? characters[Math.floor(Math.random() * characters.length)]
      : null;

    return {
      ...player,
      character
    };
  },
});


export const createPlayer = mutation({
  args: {
    walletAddress: v.string(),
    displayName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (existingPlayer) {
      return existingPlayer._id;
    }

    const playerId = await ctx.db.insert("players", {
      walletAddress: args.walletAddress,
      displayName: args.displayName,
      lastActive: Date.now(),
      totalGamesPlayed: 0,
      totalWins: 0,
      achievements: [],
    });

    return playerId;
  },
});

export const updateLastActive = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (player) {
      await ctx.db.patch(player._id, {
        lastActive: Date.now(),
      });
    }
  },
});

// NOTE: gameCoins and pendingCoins removed from schema
// This game uses real SOL directly via Privy wallets
// Balances are queried from on-chain wallet, not stored in database

export const updateDisplayName = mutation({
  args: {
    walletAddress: v.string(),
    displayName: v.string()
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    // Validate display name
    const trimmedName = args.displayName.trim();
    if (trimmedName.length < 3) {
      throw new Error("Display name must be at least 3 characters long");
    }
    if (trimmedName.length > 20) {
      throw new Error("Display name must be less than 20 characters");
    }

    await ctx.db.patch(player._id, {
      displayName: trimmedName,
      lastActive: Date.now(),
    });

    return trimmedName;
  },
});


// Update player statistics after game
export const updatePlayerStats = mutation({
  args: {
    playerId: v.id("players"),
    won: v.boolean(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    await ctx.db.patch(args.playerId, {
      totalGamesPlayed: player.totalGamesPlayed + 1,
      totalWins: player.totalWins + (args.won ? 1 : 0),
      lastActive: Date.now(),
    });
  },
});

// NOTE: Pending coins and coin processing removed
// SOL transactions are handled directly via Privy + smart contract
// No internal coin system needed

// Add achievement to player
export const addAchievement = mutation({
  args: {
    playerId: v.id("players"),
    achievementId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const achievements = player.achievements || [];
    if (!achievements.includes(args.achievementId)) {
      achievements.push(args.achievementId);

      await ctx.db.patch(args.playerId, {
        achievements,
      });
    }
  },
});
