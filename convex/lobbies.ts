/**
 * Convex backend for 1v1 Lobby management
 * Handles queries, mutations, and actions for the 1v1 coinflip feature
 *
 * Architecture:
 * - Frontend submits signed transactions to the blockchain
 * - Frontend immediately updates Convex after transaction confirmation
 * - Cron runs every 30 seconds as a backup to catch missed updates
 */

import { query, action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Solana1v1QueryClient } from "./lib/solana_1v1";
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all open lobbies (status = 0, waiting for second player)
 * Used by LobbyList component to display available lobbies
 * Filters out private lobbies - those are only accessible via share link
 * EXCEPT: Private lobbies created by currentPlayerWallet are always shown
 */
export const getOpenLobbies = query({
  args: {
    currentPlayerWallet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();

    // Filter out private lobbies - they're only joinable via share link
    // BUT always show private lobbies that the current player created
    return lobbies.filter((lobby) => {
      // Show all public lobbies
      if (!lobby.isPrivate) return true;
      // Show private lobbies created by the current player
      if (args.currentPlayerWallet && lobby.playerA === args.currentPlayerWallet) return true;
      // Hide other private lobbies
      return false;
    });
  },
});

/**
 * Get a specific lobby by ID
 * Used for polling lobby state during fights
 */
export const getLobbyState = query({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_lobbyId", (q) => q.eq("lobbyId", args.lobbyId))
      .first();

    return lobby || null;
  },
});

/**
 * Get a specific lobby by share token
 * Used for URL-based lobby access (privacy-focused share links)
 */
export const getLobbyByShareToken = query({
  args: {
    shareToken: v.string(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", args.shareToken))
      .first();

    return lobby || null;
  },
});

/**
 * Get lobbies created or modified by a specific player
 * Returns lobbies grouped by status in descending order (3, 2, 1, 0)
 * Status: 0=Open (waiting for Player B), 1=Awaiting VRF, 2=Ready (VRF received), 3=Resolved (Convex only)
 */
export const getPlayerLobbies = query({
  args: {
    playerWallet: v.string(),
  },
  handler: async (ctx, args) => {
    const lobbiesAsPlayerA = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_player_a", (q) => q.eq("playerA", args.playerWallet))
      .collect();

    const lobbiesAsPlayerB = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_player_b", (q) => q.eq("playerB", args.playerWallet))
      .collect();

    // Combine all lobbies and deduplicate by lobbyId, keeping the highest status
    const allLobbiesMap = new Map<number, (typeof lobbiesAsPlayerA)[0]>();
    for (const lobby of [...lobbiesAsPlayerA, ...lobbiesAsPlayerB]) {
      const existing = allLobbiesMap.get(lobby.lobbyId);
      // Keep the lobby with the higher status
      if (!existing || lobby.status > existing.status) {
        allLobbiesMap.set(lobby.lobbyId, lobby);
      }
    }

    const allLobbies = Array.from(allLobbiesMap.values());

    return {
      all: allLobbies,
      byStatus: allLobbies,
      asPlayerA: lobbiesAsPlayerA,
      asPlayerB: lobbiesAsPlayerB,
    };
  },
});

/**
 * Get completed lobbies (status 3 = resolved)
 * Also includes lobbies awaiting settlement (status 1, 2)
 * Used to display lobby history in the UI
 * Ordered by most recent first
 *
 * Status flow:
 * 0 = Open (waiting for Player B)
 * 1 = Awaiting VRF (Player B joined, VRF requested)
 * 2 = Ready (VRF received, ready for settlement) - on-chain PDA closes after this
 * 3 = Resolved (Convex only - for history tracking)
 */
export const getCompletedLobbies = query({
  args: {
    limit: v.optional(v.number()), // Default: 20
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    // Get all resolved lobbies (status 3)
    const completedLobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status_and_created", (q) => q.eq("status", 3))
      .collect();

    // Also get lobbies in progress (status 1 = awaiting VRF, status 2 = VRF received)
    const awaitingVrfLobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();

    const vrfReceivedLobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 2))
      .collect();

    // Combine and sort by creation date (most recent first)
    const allCompleted = [...completedLobbies, ...awaitingVrfLobbies, ...vrfReceivedLobbies]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);

    return allCompleted;
  },
});

// ============================================================================
// INTERNAL QUERIES (Used by Cron)
// ============================================================================

/**
 * Get stuck lobbies that need reconciliation
 * Returns lobbies that may have stale status on-chain
 */
export const getStuckLobbies = internalQuery({
  args: {
    maxAgeSeconds: v.optional(v.number()), // Default: 5 minutes
  },
  handler: async (ctx, args) => {
    const maxAge = (args.maxAgeSeconds || 300) * 1000; // Convert to milliseconds
    const now = Date.now();

    const lobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status_and_created", (q) => q.eq("status", 0))
      .collect();

    // Filter for old lobbies that might be stuck
    const stuckLobbies = lobbies.filter((lobby) => {
      const age = now - (lobby.createdAt || 0);
      return age > maxAge;
    });

    return stuckLobbies;
  },
});

// ============================================================================
// PUBLIC MUTATIONS (Called by Actions)
// ============================================================================

/**
 * Public mutation wrapper for creating lobbies
 * Used by the createLobby action
 *
 * Now includes Switchboard randomness account tracking:
 * - randomnessAccountPubkey: The on-chain Switchboard randomness account address
 *   This account will be used for deterministic randomness in the join_lobby instruction
 */
/**
 * Generate a unique 8-character share token for lobby URLs
 */
function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export const createLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.optional(v.string()),
    playerA: v.string(),
    amount: v.number(),
    characterA: v.number(),
    mapId: v.number(),
    isPrivate: v.optional(v.boolean()),
    winStreak: v.optional(v.number()), // For double-down: carry over win streak
  },
  handler: async (ctx, args) => {
    // Check if lobby already exists to prevent duplicates
    const existing = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (existing) {
      // Lobby already exists, return existing doc id
      return existing._id;
    }

    const docId = await ctx.db.insert("oneVOneLobbies", {
      lobbyId: args.lobbyId,
      lobbyPda: args.lobbyPda,
      shareToken: generateShareToken(),
      playerA: args.playerA,
      playerB: undefined,
      amount: args.amount,
      status: 0, // Open, waiting for Player B
      winner: undefined,
      isPrivate: args.isPrivate || false,
      characterA: args.characterA,
      characterB: undefined,
      mapId: args.mapId,
      createdAt: Date.now(),
      resolvedAt: undefined,
      winStreak: args.winStreak, // Track consecutive double-down wins
    });
    return docId;
  },
});

/**
 * Public mutation wrapper for joining lobbies
 * Used by the joinLobby action
 */
export const joinLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    playerB: v.string(),
    characterB: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (!lobby) {
      throw new Error(`Lobby ${args.lobbyId} not found`);
    }

    await ctx.db.patch(lobby._id, {
      playerB: args.playerB,
      characterB: args.characterB,
      status: 1, // Status 1 = Awaiting VRF
    });

    return lobby._id;
  },
});

/**
 * Public mutation wrapper for canceling lobbies
 * Used by the cancelLobby action
 */
export const cancelLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (lobby) {
      await ctx.db.delete(lobby._id);
    }

    return true;
  },
});

/**
 * Helper function to credit points to a player
 * 1 point per 0.001 SOL (1,000,000 lamports)
 */
async function creditPlayerPoints(
  ctx: { db: any },
  walletAddress: string,
  amountInLamports: number
) {
  // Calculate points: 1 point per 0.001 SOL (1,000,000 lamports)
  const pointsToAdd = Math.floor(amountInLamports / 1_000_000);

  if (pointsToAdd <= 0) return;

  // Find existing player
  const player = await ctx.db
    .query("players")
    .withIndex("by_wallet", (q: any) => q.eq("walletAddress", walletAddress))
    .first();

  if (player) {
    // Update existing player's points
    await ctx.db.patch(player._id, {
      totalPoints: (player.totalPoints || 0) + pointsToAdd,
      lastActive: Date.now(),
    });
  } else {
    // Create new player record with points
    await ctx.db.insert("players", {
      walletAddress,
      lastActive: Date.now(),
      totalGamesPlayed: 0,
      totalWins: 0,
      totalPoints: pointsToAdd,
      achievements: [],
    });
  }
}

/**
 * Internal mutation to create a lobby in Convex
 * Called by createLobby action after transaction confirmation
 */
export const _internalCreateLobby = internalMutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.optional(v.string()),
    playerA: v.string(),
    amount: v.number(),
    characterA: v.number(),
    mapId: v.number(),
    isPrivate: v.optional(v.boolean()),
    winStreak: v.optional(v.number()), // For double-down: carry over win streak
  },
  handler: async (ctx, args) => {
    // Check if lobby already exists to prevent duplicates
    const existing = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (existing) {
      // Lobby already exists, return existing doc id
      return existing._id;
    }

    const docId = await ctx.db.insert("oneVOneLobbies", {
      lobbyId: args.lobbyId,
      lobbyPda: args.lobbyPda,
      shareToken: generateShareToken(),
      playerA: args.playerA,
      playerB: undefined,
      amount: args.amount,
      status: 0, // Open, waiting for Player B
      winner: undefined,
      isPrivate: args.isPrivate || false,
      characterA: args.characterA,
      characterB: undefined,
      mapId: args.mapId,
      createdAt: Date.now(),
      resolvedAt: undefined,
      winStreak: args.winStreak, // Track consecutive double-down wins
    });

    // Credit points to Player A for their bet
    await creditPlayerPoints(ctx, args.playerA, args.amount);

    return docId;
  },
});

/**
 * Internal mutation to update a lobby when Player B joins
 * Called by joinLobby action after transaction confirmation
 */
export const _internalJoinLobby = internalMutation({
  args: {
    lobbyId: v.number(),
    playerB: v.string(),
    characterB: v.number(),
  },
  handler: async (ctx, args) => {
    // Find the lobby by lobbyId
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (!lobby) {
      throw new Error(`Lobby ${args.lobbyId} not found`);
    }

    // Update the lobby with Player B's info and awaiting VRF state
    await ctx.db.patch(lobby._id, {
      playerB: args.playerB,
      characterB: args.characterB,
      status: 1, // Status 1 = Awaiting VRF
    });

    // Credit points to Player B for their bet (same amount as the lobby)
    await creditPlayerPoints(ctx, args.playerB, lobby.amount);

    // Schedule a job to settle this lobby after a 100 ms delay
    await ctx.scheduler.runAfter(100, internal.lobbiesActions._checkAndSettleLobby, {
      lobbyId: args.lobbyId,
    });

    return lobby._id;
  },
});

/**
 * Internal mutation to settle a lobby
 * Called by settleLobby action or sync
 */
export const _internalSettleLobby = internalMutation({
  args: {
    lobbyId: v.number(),
    winner: v.string(),
    settleTxHash: v.optional(v.string()),
    prizeAmount: v.optional(v.number()), // Actual prize in lamports (from tx logs)
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (!lobby) {
      throw new Error(`Lobby ${args.lobbyId} not found`);
    }

    const updateData: {
      winner: string;
      status: number;
      resolvedAt: number;
      settleTxHash?: string;
      prizeAmount?: number;
    } = {
      winner: args.winner,
      status: 3, // Resolved (Convex only: 0=open, 1=awaiting VRF, 2=ready, 3=resolved)
      resolvedAt: Date.now(),
    };

    if (args.settleTxHash) {
      updateData.settleTxHash = args.settleTxHash;
    }

    if (args.prizeAmount) {
      updateData.prizeAmount = args.prizeAmount;
    }

    await ctx.db.patch(lobby._id, updateData);

    // Credit the winner with points for the total pot (both players' bets)
    const totalPot = lobby.amount * 2;
    await creditPlayerPoints(ctx, args.winner, totalPot);

    // Update player stats (totalGamesPlayed and totalWins)
    const loser = lobby.playerA === args.winner ? lobby.playerB : lobby.playerA;

    // Update winner stats
    const winnerPlayer = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q: any) => q.eq("walletAddress", args.winner))
      .first();

    if (winnerPlayer) {
      await ctx.db.patch(winnerPlayer._id, {
        totalGamesPlayed: (winnerPlayer.totalGamesPlayed || 0) + 1,
        totalWins: (winnerPlayer.totalWins || 0) + 1,
        lastActive: Date.now(),
      });
    }

    // Update loser stats
    if (loser) {
      const loserPlayer = await ctx.db
        .query("players")
        .withIndex("by_wallet", (q: any) => q.eq("walletAddress", loser))
        .first();

      if (loserPlayer) {
        await ctx.db.patch(loserPlayer._id, {
          totalGamesPlayed: (loserPlayer.totalGamesPlayed || 0) + 1,
          lastActive: Date.now(),
        });
      }
    }

    return lobby._id;
  },
});

/**
 * Internal mutation to delete a lobby (e.g., on cancel)
 */
export const _internalDeleteLobby = internalMutation({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (lobby) {
      await ctx.db.delete(lobby._id);
    }

    return true;
  },
});

/**
 * Internal mutation to update a lobby's status
 * Used by sync/recovery actions
 */
export const _internalUpdateLobbyStatus = internalMutation({
  args: {
    lobbyId: v.number(),
    status: v.number(),
    winner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lobby = await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    if (!lobby) {
      throw new Error(`Lobby ${args.lobbyId} not found`);
    }

    const updateData: any = { status: args.status };
    // Set resolvedAt when status becomes 3 (resolved)
    if (args.status === 3 && !lobby.resolvedAt) {
      updateData.resolvedAt = Date.now();
    }
    if (args.winner) {
      updateData.winner = args.winner;
    }

    await ctx.db.patch(lobby._id, updateData);
    return lobby._id;
  },
});

// ============================================================================
// ACTIONS (Called from Frontend)
// ============================================================================

/**
 * Create a new 1v1 lobby
 * Frontend flow:
 * 1. User signs transaction on-chain to create lobby
 * 2. Frontend gets transaction hash
 * 3. Frontend calls this action with transaction hash
 * 4. Action confirms transaction and updates Convex immediately
 */
export const createLobby = action({
  args: {
    playerAWallet: v.string(), // Player A's wallet address
    amount: v.number(), // Bet amount in lamports
    characterA: v.number(), // Character/skin ID (0-255)
    mapId: v.number(), // Map ID (0-255)
    transactionHash: v.string(), // Solana transaction hash (for verification)
    isPrivate: v.optional(v.boolean()), // Private lobbies only joinable via share link
    winStreak: v.optional(v.number()), // For double-down: carry over win streak
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; lobbyId: number; lobbyPda: string; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

      // Get the transaction from blockchain to confirm
      const connection = queryClient.getConnection();
      const tx = await connection.getTransaction(args.transactionHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        throw new Error("Transaction not found on blockchain");
      }

      // Get current config to determine the lobby ID
      const config = await queryClient.getConfigAccount();
      const lobbyId = config.lobbyCount.toNumber() - 1; // Count was incremented, so subtract 1

      // Get the lobby PDA
      const lobbyPda = queryClient.getLobbyPdaForId(lobbyId);

      // Fetch the lobby from blockchain to verify creation
      const lobbyAccount = await queryClient.getLobbyAccount(lobbyPda);

      if (!lobbyAccount) {
        throw new Error("Lobby not found after creation");
      }

      // Create lobby in Convex immediately after blockchain confirmation
      await ctx.runMutation(internal.lobbies._internalCreateLobby, {
        lobbyId,
        lobbyPda: lobbyPda.toString(),
        playerA: args.playerAWallet,
        amount: args.amount,
        characterA: args.characterA,
        mapId: args.mapId,
        isPrivate: args.isPrivate,
        winStreak: args.winStreak,
      });

      return {
        success: true,
        lobbyId,
        lobbyPda: lobbyPda.toString(),
        action: "create",
      };
    } catch (error) {
      throw new Error(
        `Failed to create lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

/**
 * Join an existing 1v1 lobby
 * Frontend flow:
 * 1. Player B signs transaction on-chain to join lobby
 * 2. Frontend gets transaction hash
 * 3. Frontend calls this action with transaction hash
 * 4. Action confirms transaction and updates Convex immediately
 */
export const joinLobby = action({
  args: {
    playerBWallet: v.string(), // Player B's wallet address
    lobbyId: v.number(), // ID of lobby to join
    characterB: v.number(), // Character/skin ID (0-255)
    transactionHash: v.string(), // Solana transaction hash (for verification)
  },
  handler: async (ctx, args): Promise<{ success: boolean; lobbyId: number; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

      // Verify transaction
      const connection = queryClient.getConnection();
      const tx = await connection.getTransaction(args.transactionHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        throw new Error("Transaction not found on blockchain");
      }

      // Get the lobby
      const lobbyPda = queryClient.getLobbyPdaForId(args.lobbyId);
      const lobbyAccount = await queryClient.getLobbyAccount(lobbyPda);

      if (!lobbyAccount) {
        throw new Error("Lobby not found");
      }

      // Status flow:
      // Status 0 = Open (waiting for Player B)
      // Status 1 = Awaiting VRF (Player B joined, VRF requested)
      // Status 2 = Ready (VRF received, ready for settlement) - on-chain PDA closes after this
      // Status 3 = Resolved (Convex only - for history tracking)

      // After join_lobby, status should be 1 (Awaiting VRF)
      // VRF callback will set it to 2, then settle_lobby sets it to 3
      if (lobbyAccount.status === 0) {
        throw new Error("Lobby status is still 0 (Created) after join");
      }

      // Update Convex immediately after blockchain confirmation
      // Winner is NOT determined yet - that happens after VRF callback + settle
      await ctx.runMutation(internal.lobbies._internalJoinLobby, {
        lobbyId: args.lobbyId,
        playerB: args.playerBWallet,
        characterB: args.characterB,
      });

      return {
        success: true,
        lobbyId: args.lobbyId,
        action: "join",
      };
    } catch (error) {
      throw new Error(
        `Failed to join lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

/**
 * Cancel a lobby (Player A refunds)
 * Frontend flow:
 * 1. Player A signs transaction to cancel (only works if status = 0)
 * 2. Frontend gets transaction hash
 * 3. Frontend calls this action
 * 4. Action confirms and deletes from Convex
 */
export const cancelLobby = action({
  args: {
    lobbyId: v.number(),
    transactionHash: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; lobbyId: number; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

      // Verify transaction
      const connection = queryClient.getConnection();
      const tx = await connection.getTransaction(args.transactionHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        throw new Error("Transaction not found on blockchain");
      }

      // Delete the lobby from Convex database
      await ctx.runMutation(internal.lobbies._internalDeleteLobby, {
        lobbyId: args.lobbyId,
      });

      return {
        success: true,
        lobbyId: args.lobbyId,
        action: "cancel",
      };
    } catch (error) {
      throw new Error(
        `Failed to cancel lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

// ============================================================================
// INTERNAL QUERIES (For syncing from blockchain)
// ============================================================================

/**
 * Internal query helper to get all open lobbies for sync
 * Used by syncLobbyFromBlockchain to fetch lobbies that may need syncing
 *
 * Status flow:
 * 0 = Open (waiting for Player B)
 * 1 = Awaiting VRF (Player B joined, VRF requested)
 * 2 = Ready (VRF received) - on-chain PDA closes after settlement
 * 3 = Resolved (Convex only - for history tracking)
 */
export const _getOpenLobbiesForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get status 0 (waiting for Player B), 1 (awaiting VRF), and 2 (VRF received) lobbies
    const status0 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();

    const status1 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();

    const status2 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 2))
      .collect();

    const status3 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 3))
      .collect();

    return [...status0, ...status1, ...status2, ...status3];
  },
});

// ============================================================================
// INTERNAL QUERIES (For Node.js actions in lobbiesActions.ts)
// ============================================================================

/**
 * Internal query to get a specific lobby by ID
 */
export const _getLobbyById = internalQuery({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oneVOneLobbies")
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();
  },
});

/**
 * Internal query to get all lobbies pending settlement (status 1 or 2)
 * Status 1 = Awaiting VRF
 * Status 2 = VRF Received (ready for settlement)
 */
export const _getPendingLobbiesForSettlement = internalQuery({
  args: {},
  handler: async (ctx) => {
    const status1 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();

    const status2 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 2))
      .collect();

    return [...status1, ...status2];
  },
});

// Note: All internalAction functions (Node.js based) are in lobbiesActions.ts
// This separation is required because actions using Solana libs need "use node"
// but queries/mutations cannot use that directive
