/**
 * Convex backend for 1v1 Lobby management
 * Handles queries, mutations, and actions for the 1v1 coinflip feature
 *
 * Architecture:
 * - Frontend submits signed transactions to the blockchain
 * - Frontend immediately updates Convex after transaction confirmation
 * - Cron runs every 30 seconds as a backup to catch missed updates
 */

import { mutation, query, action, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Solana1v1QueryClient } from "./lib/solana_1v1";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all open lobbies (status = 0, waiting for second player)
 * Used by LobbyList component to display available lobbies
 */
export const getOpenLobbies = query({
  args: {},
  handler: async (ctx) => {
    const lobbies = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();

    return lobbies;
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
      .withIndex("by_status", (q) => q.eq("status", -1)) // Placeholder to get all
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .first();

    return lobby || null;
  },
});

/**
 * Get lobbies created or modified by a specific player
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

    return {
      asPlayerA: lobbiesAsPlayerA,
      asPlayerB: lobbiesAsPlayerB,
    };
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
 */
export const createLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.string(),
    playerA: v.string(),
    amount: v.number(),
    characterA: v.number(),
    mapId: v.number(),
  },
  handler: async (ctx, args) => {
    const docId = await ctx.db.insert("oneVOneLobbies", {
      lobbyId: args.lobbyId,
      lobbyPda: args.lobbyPda,
      playerA: args.playerA,
      playerB: undefined,
      amount: args.amount,
      status: 0, // Created, waiting for Player B
      winner: undefined,
      characterA: args.characterA,
      characterB: undefined,
      mapId: args.mapId,
      createdAt: Date.now(),
      resolvedAt: undefined,
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
    winner: v.string(),
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
      winner: args.winner,
      status: 1, // Resolved
      resolvedAt: Date.now(),
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
 * Internal mutation to create a lobby in Convex
 * Called by createLobby action after transaction confirmation
 */
export const _internalCreateLobby = internalMutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.string(),
    playerA: v.string(),
    amount: v.number(),
    characterA: v.number(),
    mapId: v.number(),
  },
  handler: async (ctx, args) => {
    const docId = await ctx.db.insert("oneVOneLobbies", {
      lobbyId: args.lobbyId,
      lobbyPda: args.lobbyPda,
      playerA: args.playerA,
      playerB: undefined,
      amount: args.amount,
      status: 0, // Created, waiting for Player B
      winner: undefined,
      characterA: args.characterA,
      characterB: undefined,
      mapId: args.mapId,
      createdAt: Date.now(),
      resolvedAt: undefined,
    });

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
    winner: v.string(), // Winner's wallet
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

    // Update the lobby with Player B's info and resolved state
    await ctx.db.patch(lobby._id, {
      playerB: args.playerB,
      characterB: args.characterB,
      winner: args.winner,
      status: 1, // Resolved
      resolvedAt: Date.now(),
    });

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
    if (args.status === 1 && !lobby.resolvedAt) {
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
  },
  handler: async (ctx, args) => {
    try {
      // Get RPC endpoint from environment
      const rpcEndpoint = process.env.SOLANA_RPC_URL || "http://localhost:8899";
      const queryClient = new Solana1v1QueryClient(rpcEndpoint);

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

      // Create lobby in Convex via mutation
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
  handler: async (ctx, args) => {
    try {
      const rpcEndpoint = process.env.SOLANA_RPC_URL || "http://localhost:8899";
      const queryClient = new Solana1v1QueryClient(rpcEndpoint);

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

      if (lobbyAccount.status !== 1) {
        throw new Error("Lobby has not been resolved yet");
      }

      // Determine winner from on-chain account
      const winner = lobbyAccount.winner.toString();

      return {
        success: true,
        lobbyId: args.lobbyId,
        winner,
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
  handler: async (ctx, args) => {
    try {
      const rpcEndpoint = process.env.SOLANA_RPC_URL || "http://localhost:8899";
      const queryClient = new Solana1v1QueryClient(rpcEndpoint);

      // Verify transaction
      const connection = queryClient.getConnection();
      const tx = await connection.getTransaction(args.transactionHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        throw new Error("Transaction not found on blockchain");
      }

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
 */
export const _getOpenLobbiesForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();
  },
});

// ============================================================================
// INTERNAL ACTIONS (Used by Cron)
// ============================================================================

/**
 * Sync lobby state from blockchain to Convex - Recovery cron action
 * Runs every 30 seconds as a backup safety net to catch missed updates
 *
 * This function:
 * 1. Queries all open lobbies (status = 0) from Convex
 * 2. Fetches each lobby from the blockchain to get current state
 * 3. If a lobby has been resolved on-chain but not in Convex, updates Convex
 * 4. Handles edge cases: missing lobbies, network errors, etc.
 *
 * This is a backup mechanism - frontend should update Convex immediately
 * after confirming transactions. This cron catches the rare cases where
 * frontend updates fail (network issues, browser crash, etc.)
 */
export const syncLobbyFromBlockchain = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const rpcEndpoint = process.env.SOLANA_RPC_URL || "http://localhost:8899";
      const queryClient = new Solana1v1QueryClient(rpcEndpoint);

      // Get all open lobbies from Convex (waiting for Player B)
      const openLobbies = await ctx.runQuery(internal.lobbies._getOpenLobbiesForSync);

      console.log(`[1v1 Cron] Syncing ${openLobbies.length} open lobbies from blockchain`);

      let synced = 0;
      let errors = 0;

      for (const lobbyInConvex of openLobbies) {
        try {
          // Fetch the lobby account from blockchain
          const lobbyPda = queryClient.getLobbyPdaForId(lobbyInConvex.lobbyId);
          const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

          // Check if the on-chain status has progressed beyond what we have in Convex
          if (onChainLobby.status === 1 && lobbyInConvex.status === 0) {
            // Lobby has been resolved on-chain but we still have it as open
            console.log(
              `[1v1 Cron] Syncing resolved lobby ${lobbyInConvex.lobbyId} to Convex`
            );

            // Determine the winner
            const winner = onChainLobby.winner.toString();

            // Extract Player B info from on-chain state
            const playerB = onChainLobby.playerB.toString();
            const characterB = onChainLobby.characterB;

            // Update Convex to reflect the resolved state
            await ctx.runMutation(internal.lobbies._internalJoinLobby, {
              lobbyId: lobbyInConvex.lobbyId,
              playerB,
              characterB,
              winner,
            });

            synced++;
          }
        } catch (error) {
          errors++;
          console.error(
            `[1v1 Cron] Error syncing lobby ${lobbyInConvex.lobbyId}:`,
            error instanceof Error ? error.message : String(error)
          );

          // Don't re-throw - continue with other lobbies
          // This ensures one bad lobby doesn't break the entire sync
        }
      }

      const result = {
        checked: openLobbies.length,
        synced,
        errors,
      };

      console.log(`[1v1 Cron] Sync complete: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[1v1 Cron] Error in syncLobbyFromBlockchain:", errorMsg);

      return {
        checked: 0,
        synced: 0,
        errors: 1,
        fatalError: errorMsg,
      };
    }
  },
});
