/**
 * Convex backend for CHOP Lobby management
 * Handles queries, mutations, and actions for the Timberman-style PVP game
 *
 * Architecture:
 * - Frontend submits signed transactions to the blockchain
 * - Frontend immediately updates Convex after transaction confirmation
 * - Game logic (winner determination) runs in Convex, not blockchain
 * - Winner is determined by skill: last standing or highest score
 */

import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all open lobbies (status = 0, waiting for opponent)
 */
export const getOpenLobbies = query({
  args: {},
  handler: async (ctx) => {
    const lobbies = await ctx.db
      .query("chopLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();

    return lobbies;
  },
});

/**
 * Get a specific lobby by ID
 */
export const getLobbyState = query({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    return lobby || null;
  },
});

/**
 * Get a specific lobby by share token
 */
export const getLobbyByShareToken = query({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    return lobby || null;
  },
});

/**
 * Get lobbies for a specific player (as creator or participant)
 */
export const getPlayerLobbies = query({
  args: {
    playerWallet: v.string(),
  },
  handler: async (ctx, args) => {
    // Get lobbies where player is creator
    const creatorLobbies = await ctx.db
      .query("chopLobbies")
      .withIndex("by_creator", (q) => q.eq("creator", args.playerWallet))
      .collect();

    // Also check all lobbies where player is in players array
    const allLobbies = await ctx.db.query("chopLobbies").collect();
    const participantLobbies = allLobbies.filter(
      (l) =>
        l.players.includes(args.playerWallet) &&
        l.creator !== args.playerWallet
    );

    // Combine and deduplicate
    const allPlayerLobbies = [...creatorLobbies, ...participantLobbies];
    const uniqueLobbies = allPlayerLobbies.filter(
      (lobby, index, self) =>
        index === self.findIndex((l) => l.lobbyId === lobby.lobbyId)
    );

    return uniqueLobbies.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get completed lobbies (status = 2)
 */
export const getCompletedLobbies = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const completedLobbies = await ctx.db
      .query("chopLobbies")
      .withIndex("by_status", (q) => q.eq("status", 2))
      .collect();

    return completedLobbies
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
      .slice(0, limit);
  },
});

/**
 * Get weekly leaderboard
 */
export const getWeeklyLeaderboard = query({
  args: {
    weekStart: v.optional(v.string()), // ISO date, defaults to current week
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Calculate current week start if not provided
    const weekStart =
      args.weekStart ||
      (() => {
        const now = new Date();
        const dayOfWeek = now.getUTCDay();
        const diff = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(now.setUTCDate(diff));
        return monday.toISOString().split("T")[0];
      })();

    const limit = args.limit || 50;

    const entries = await ctx.db
      .query("chopLeaderboard")
      .withIndex("by_week_and_score", (q) => q.eq("weekStart", weekStart))
      .collect();

    // Sort by high score descending
    return entries.sort((a, b) => b.highScore - a.highScore).slice(0, limit);
  },
});

// ============================================================================
// PUBLIC MUTATIONS (Called by Frontend after blockchain tx)
// ============================================================================

/**
 * Generate a unique 8-character share token for lobby URLs
 */
function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * Generate a random branch pattern for the game
 * Returns array of "l", "r", or "" (no branch)
 * Pattern length determines game difficulty
 */
function generateBranchPattern(length: number = 100): string[] {
  const pattern: string[] = [];
  let lastBranch = "";

  for (let i = 0; i < length; i++) {
    // 70% chance of having a branch
    if (Math.random() < 0.7) {
      // Alternate or randomize branch side
      // 60% chance to be on opposite side of last branch (more fair)
      if (lastBranch === "l") {
        pattern.push(Math.random() < 0.6 ? "r" : "l");
      } else if (lastBranch === "r") {
        pattern.push(Math.random() < 0.6 ? "l" : "r");
      } else {
        pattern.push(Math.random() < 0.5 ? "l" : "r");
      }
      lastBranch = pattern[pattern.length - 1];
    } else {
      pattern.push("");
      lastBranch = "";
    }
  }

  return pattern;
}

/**
 * Create a lobby in Convex after blockchain transaction confirms
 */
export const createLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.optional(v.string()),
    creator: v.string(),
    betAmount: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if lobby already exists
    const existing = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (existing) {
      return existing._id;
    }

    const docId = await ctx.db.insert("chopLobbies", {
      lobbyId: args.lobbyId,
      lobbyPda: args.lobbyPda,
      shareToken: generateShareToken(),
      creator: args.creator,
      players: [args.creator],
      betAmount: args.betAmount,
      status: 0, // Open
      createdAt: Date.now(),
      totalPot: args.betAmount,
    });

    return docId;
  },
});

/**
 * Join a lobby in Convex after blockchain transaction confirms
 * Generates the branch pattern and initializes player states
 */
export const joinLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    player: v.string(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (!lobby) {
      throw new Error(`Lobby ${args.lobbyId} not found`);
    }

    if (lobby.status !== 0) {
      throw new Error("Lobby is not open");
    }

    // Generate branch pattern for the game (server-side anti-cheat)
    const branchPattern = generateBranchPattern(100);

    // Initialize player states
    const playerStates = [
      {
        wallet: lobby.creator,
        score: 0,
        isAlive: true,
        inputs: [],
      },
      {
        wallet: args.player,
        score: 0,
        isAlive: true,
        inputs: [],
      },
    ];

    await ctx.db.patch(lobby._id, {
      players: [...lobby.players, args.player],
      status: 1, // Locked - game starting
      lockedAt: Date.now(),
      totalPot: lobby.betAmount * 2,
      branchPattern,
      playerStates,
    });

    return lobby._id;
  },
});

/**
 * Record a player's chop input (real-time game update)
 */
export const recordChopInput = mutation({
  args: {
    lobbyId: v.number(),
    wallet: v.string(),
    timestamp: v.number(), // ms from game start
    side: v.string(), // "l" or "r"
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (!lobby || lobby.status !== 1) {
      return; // Silently ignore if lobby not in playing state
    }

    const playerStates = lobby.playerStates || [];
    const playerIndex = playerStates.findIndex((p) => p.wallet === args.wallet);

    if (playerIndex === -1 || !playerStates[playerIndex].isAlive) {
      return; // Player not found or already dead
    }

    // Add input to player's input array
    const updatedStates = [...playerStates];
    updatedStates[playerIndex] = {
      ...updatedStates[playerIndex],
      inputs: [
        ...updatedStates[playerIndex].inputs,
        { t: args.timestamp, s: args.side },
      ],
      score: updatedStates[playerIndex].score + 1,
    };

    await ctx.db.patch(lobby._id, {
      playerStates: updatedStates,
    });
  },
});

/**
 * Record a player's death (hit branch or timeout)
 */
export const recordPlayerDeath = mutation({
  args: {
    lobbyId: v.number(),
    wallet: v.string(),
    finalScore: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (!lobby || lobby.status !== 1) {
      return;
    }

    const playerStates = lobby.playerStates || [];
    const playerIndex = playerStates.findIndex((p) => p.wallet === args.wallet);

    if (playerIndex === -1) {
      return;
    }

    const updatedStates = [...playerStates];
    updatedStates[playerIndex] = {
      ...updatedStates[playerIndex],
      isAlive: false,
      deathTime: Date.now(),
      score: args.finalScore,
    };

    await ctx.db.patch(lobby._id, {
      playerStates: updatedStates,
    });

    // Check if game should end (only one or zero players alive)
    const alivePlayers = updatedStates.filter((p) => p.isAlive);

    if (alivePlayers.length <= 1) {
      // Schedule end game check
      await ctx.scheduler.runAfter(100, internal.chopLobbies._checkAndEndGame, {
        lobbyId: args.lobbyId,
      });
    }
  },
});

/**
 * Cancel a lobby (before opponent joins)
 */
export const cancelLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (lobby) {
      await ctx.db.delete(lobby._id);
    }

    return true;
  },
});

// ============================================================================
// INTERNAL MUTATIONS (For game logic and scheduling)
// ============================================================================

/**
 * Check if game should end and determine winner
 */
export const _checkAndEndGame = internalMutation({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    if (!lobby || lobby.status !== 1) {
      return; // Already ended or not in playing state
    }

    const playerStates = lobby.playerStates || [];
    const alivePlayers = playerStates.filter((p) => p.isAlive);

    let winner: string;

    if (alivePlayers.length === 1) {
      // Last standing wins
      winner = alivePlayers[0].wallet;
    } else if (alivePlayers.length === 0) {
      // Everyone died - last to die wins, tiebreak by score
      const sortedByDeath = [...playerStates].sort((a, b) => {
        const deathDiff = (b.deathTime || 0) - (a.deathTime || 0);
        if (deathDiff !== 0) return deathDiff;
        return b.score - a.score;
      });
      winner = sortedByDeath[0].wallet;
    } else {
      // Multiple survivors - highest score wins
      const sortedByScore = [...alivePlayers].sort((a, b) => b.score - a.score);
      winner = sortedByScore[0].wallet;
    }

    // Calculate prize (95% of pot - 5% total fees)
    const prizeAmount = Math.floor(lobby.totalPot * 0.95);

    await ctx.db.patch(lobby._id, {
      status: 2, // Finished
      winner,
      finishedAt: Date.now(),
      prizeAmount,
    });

    // Update leaderboard
    await updateLeaderboard(ctx, lobby, winner, playerStates);

    // Schedule blockchain settlement
    await ctx.scheduler.runAfter(
      500,
      internal.chopLobbies._scheduleBlockchainSettlement,
      {
        lobbyId: args.lobbyId,
        winner,
      }
    );

    return { winner, prizeAmount };
  },
});

/**
 * Update leaderboard entries for all players
 */
async function updateLeaderboard(
  ctx: { db: any },
  lobby: { betAmount: number; prizeAmount?: number },
  winner: string,
  playerStates: { wallet: string; score: number }[]
) {
  // Calculate current week start
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(now.setUTCDate(diff));
  const weekStart = monday.toISOString().split("T")[0];

  for (const player of playerStates) {
    const existing = await ctx.db
      .query("chopLeaderboard")
      .withIndex(
        "by_wallet_and_week",
        (q: {
          eq: (
            field: string,
            value: string
          ) => { eq: (field: string, value: string) => unknown };
        }) => q.eq("walletAddress", player.wallet).eq("weekStart", weekStart)
      )
      .first();

    const isWinner = player.wallet === winner;
    const wonAmount = isWinner ? lobby.prizeAmount || 0 : 0;

    if (existing) {
      await ctx.db.patch(existing._id, {
        highScore: Math.max(existing.highScore, player.score),
        gamesPlayed: existing.gamesPlayed + 1,
        gamesWon: existing.gamesWon + (isWinner ? 1 : 0),
        totalWagered: existing.totalWagered + lobby.betAmount,
        totalWon: existing.totalWon + wonAmount,
      });
    } else {
      await ctx.db.insert("chopLeaderboard", {
        walletAddress: player.wallet,
        weekStart,
        highScore: player.score,
        gamesPlayed: 1,
        gamesWon: isWinner ? 1 : 0,
        totalWagered: lobby.betAmount,
        totalWon: wonAmount,
      });
    }
  }
}

/**
 * Schedule blockchain settlement (calls end_game instruction)
 * This will be implemented in chopActions.ts with "use node" directive
 */
export const _scheduleBlockchainSettlement = internalMutation({
  args: {
    lobbyId: v.number(),
    winner: v.string(),
  },
  handler: async (_ctx, args) => {
    // For now, just log - actual blockchain call will be in chopActions.ts
    console.log(
      `[CHOP] Scheduling blockchain settlement for lobby ${args.lobbyId}, winner: ${args.winner}`
    );

    // TODO: Call chopActions.settleOnChain when implemented
  },
});

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get lobby by ID (internal)
 */
export const _getLobbyById = internalQuery({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chopLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();
  },
});

/**
 * Get lobbies in playing state (for timeout monitoring)
 */
export const _getPlayingLobbies = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("chopLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();
  },
});
