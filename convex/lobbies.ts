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
// CONFIGURATION
// ============================================================================

const RPC_ENDPOINT = process.env.RPC_URL || process.env.VITE_SOLANA_RPC_URL || "https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0";

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
  handler: async (ctx, args): Promise<{ success: boolean; lobbyId: number; lobbyPda: string; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);

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
  handler: async (ctx, args): Promise<{ success: boolean; lobbyId: number; winner: string; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);

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
  handler: async (ctx, args): Promise<{ success: boolean; lobbyId: number; action: string }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);

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

// ============================================================================
// INTERNAL HELPERS FOR SYNC
// ============================================================================

/**
 * Get all lobbies from Convex database
 * Internal helper for sync operations
 */
const _getAllConvexLobbies = async (ctx: any): Promise<any[]> => {
  return await ctx.runQuery(internal.lobbies._getOpenLobbiesForSync);
};

/**
 * Get actual lobby count from blockchain
 * @returns The total number of lobbies created on-chain
 */
const _getBlockchainLobbyCount = async (queryClient: any): Promise<number> => {
  try {
    console.log("[1v1 Sync] Attempting to fetch config account...");
    const config = await queryClient.getConfigAccount();
    
    if (!config) {
      throw new Error("Config account is null or undefined");
    }

    if (!config.lobbyCount) {
      throw new Error("Config account missing lobbyCount field");
    }

    const count = typeof config.lobbyCount === 'number' 
      ? config.lobbyCount 
      : config.lobbyCount.toNumber();
      
    console.log(`[1v1 Sync] Successfully fetched blockchain lobby count: ${count}`);
    return count;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[1v1 Sync] Failed to fetch lobby count: ${errorMsg}`);
    throw error;
  }
};

/**
 * Find missing lobby IDs between blockchain and Convex
 * @returns Array of lobby IDs that exist on-chain but not in Convex
 * NOTE: Does NOT include closed/deleted lobby accounts - only checks Convex DB
 */
const _findMissingLobbies = (blockchainCount: number, convexLobbies: any[]): number[] => {
  const convexIds = new Set(convexLobbies.map((l: any) => l.lobbyId));
  const missing: number[] = [];

  for (let i = 0; i < blockchainCount; i++) {
    if (!convexIds.has(i)) {
      missing.push(i);
    }
  }

  if (missing.length > 0) {
    console.log(`[1v1 Sync] Found ${missing.length} potential missing lobbies: ${missing.join(", ")}`);
  }

  return missing;
};

/**
 * Sync a single resolved lobby from blockchain to Convex
 * Updates Convex if lobby is resolved on-chain but still open in DB
 */
const _syncResolvedLobby = async (
  ctx: any,
  lobbyInConvex: any,
  onChainLobby: any
): Promise<boolean> => {
  // Check if the on-chain status has progressed beyond what we have in Convex
  if (onChainLobby.status === 1 && lobbyInConvex.status === 0) {
    // Lobby has been resolved on-chain but we still have it as open
    console.log(`[1v1 Sync] Syncing resolved lobby ${lobbyInConvex.lobbyId} to Convex`);

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

    return true;
  }

  return false;
};

/**
 * Sync an open (missing) lobby from blockchain to Convex
 * Adds a lobby that exists on-chain but is missing from Convex DB
 */
const _syncMissingLobby = async (
  ctx: any,
  lobbyId: number,
  onChainLobby: any
): Promise<boolean> => {
  try {
    console.log(`[1v1 Sync] Creating missing lobby ${lobbyId} in Convex`);

    // Extract fields, handling both Anchor-parsed and raw-parsed formats
    const playerA = onChainLobby.playerA;
    const amount = typeof onChainLobby.amount === 'number' 
      ? onChainLobby.amount 
      : onChainLobby.amount.toNumber();
    const characterA = onChainLobby.skinA;
    const mapId = onChainLobby.map;
    const lobbyPda = onChainLobby.publicKey?.toString() || `lobby_${lobbyId}`;

    // Validate required fields
    if (!playerA) {
      throw new Error("Missing playerA in lobby account");
    }

    if (characterA === undefined) {
      throw new Error("Missing skinA in lobby account");
    }

    // console.log(
    //   `[1v1 Sync] Lobby ${lobbyId}: playerA=${playerA.toString().slice(0, 8)}..., amount=${amount}, char=${characterA}, map=${mapId}`
    // );

    // Create the lobby in Convex
    await ctx.runMutation(internal.lobbies._internalCreateLobby, {
      lobbyId,
      lobbyPda,
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
    });

    console.log(`[1v1 Sync] Successfully created missing lobby ${lobbyId}`);
    return true;
  } catch (error) {
    console.error(
      `[1v1 Sync] Failed to create missing lobby ${lobbyId}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
};

/**
 * Process all open lobbies from Convex and sync their state
 * @returns Object with sync statistics
 */
const _syncOpenLobbies = async (
  ctx: any,
  queryClient: any,
  openLobbies: any[]
): Promise<{ synced: number; errors: number }> => {
  let synced = 0;
  let errors = 0;

  console.log(`[1v1 Sync] Checking ${openLobbies.length} open lobbies for state changes`);

  for (const lobbyInConvex of openLobbies) {
    try {
      // Fetch the lobby account from blockchain
      const lobbyPda = queryClient.getLobbyPdaForId(lobbyInConvex.lobbyId);
      const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

      if (!onChainLobby) {
        throw new Error("Lobby account not found on blockchain");
      }

      // Try to sync if resolved
      const wasSynced = await _syncResolvedLobby(ctx, lobbyInConvex, onChainLobby);
      if (wasSynced) {
        synced++;
      }
    } catch (error) {
      errors++;
      console.error(
        `[1v1 Sync] Error syncing open lobby ${lobbyInConvex.lobbyId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return { synced, errors };
};

/**
 * Process missing lobbies from blockchain and add them to Convex
 * @returns Object with sync statistics
 * NOTE: Closed/deleted lobby accounts (not found on-chain) are skipped silently
 * since they represent canceled lobbies, not errors
 */
const _syncMissingLobbies = async (
  ctx: any,
  queryClient: any,
  missingIds: number[]
): Promise<{ synced: number; errors: number }> => {
  let synced = 0;
  let errors = 0;

  if (missingIds.length === 0) {
    return { synced: 0, errors: 0 };
  }

  console.log(`[1v1 Sync] Fetching and syncing ${missingIds.length} missing lobbies`);

  for (const lobbyId of missingIds) {
    try {
      const lobbyPda = queryClient.getLobbyPdaForId(lobbyId);
      const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

      if (!onChainLobby) {
        // Lobby account doesn't exist on-chain = it was closed/canceled
        // This is normal and expected, so we skip it without counting as error
        console.log(`[1v1 Sync] Lobby ${lobbyId} not found on blockchain (likely canceled/closed)`);
        continue;
      }

      // Add the missing lobby to Convex
      const wasAdded = await _syncMissingLobby(ctx, lobbyId, onChainLobby);
      if (wasAdded) {
        synced++;
      } else {
        errors++;
      }
    } catch (error) {
      // Only count as error if it's not a "not found" error
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("not found") && !errorMsg.includes("not exist")) {
        errors++;
        console.error(
          `[1v1 Sync] Error syncing missing lobby ${lobbyId}:`,
          errorMsg
        );
      } else {
        // "Not found" errors are expected for closed lobbies, log as info
        console.log(
          `[1v1 Sync] Lobby ${lobbyId} not found on blockchain (likely canceled/closed)`
        );
      }
    }
  }

  return { synced, errors };
};

/**
 * Sync lobby state from blockchain to Convex - Recovery cron action
 * Runs every 30 seconds as a backup safety net to catch missed updates
 *
 * This function:
 * 1. Fetches actual lobby count from blockchain
 * 2. Queries all lobbies from Convex
 * 3. Detects missing lobbies (exist on-chain but not in Convex DB)
 * 4. Syncs resolved lobbies (on-chain resolved but still open in Convex)
 * 5. Syncs missing lobbies (adds them to Convex from blockchain)
 * 6. Handles edge cases: network errors, missing accounts, etc.
 *
 * This is a backup mechanism - frontend should update Convex immediately
 * after confirming transactions. This cron catches the rare cases where
 * frontend updates fail (network issues, browser crash, etc.)
 */
export const syncLobbyFromBlockchain = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    checked: number;
    synced: number;
    errors: number;
    blockchainCount: number;
    convexCount: number;
    missingCount: number;
    fatalError?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);

      // Step 1: Get blockchain lobby count
      let blockchainCount = 0;
      try {
        blockchainCount = await _getBlockchainLobbyCount(queryClient);
      } catch (error) {
        throw new Error(
          `Failed to fetch blockchain lobby count: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Step 2: Get all lobbies from Convex
      let convexLobbies: any[] = [];
      try {
        convexLobbies = await _getAllConvexLobbies(ctx);
      } catch (error) {
        throw new Error(
          `Failed to fetch Convex lobbies: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const convexCount = convexLobbies.length;
      console.log(
        `[1v1 Sync] Blockchain: ${blockchainCount} lobbies, Convex: ${convexCount} lobbies`
      );

      // Step 3: Find missing lobbies
      const missingIds = _findMissingLobbies(blockchainCount, convexLobbies);
      const missingCount = missingIds.length;

      let totalSynced = 0;
      let totalErrors = 0;

      // Step 4: Sync open lobbies (check for state changes)
      const openSyncResult = await _syncOpenLobbies(ctx, queryClient, convexLobbies);
      totalSynced += openSyncResult.synced;
      totalErrors += openSyncResult.errors;

      // Step 5: Sync missing lobbies (add to Convex from blockchain)
      const missingSyncResult = await _syncMissingLobbies(ctx, queryClient, missingIds);
      totalSynced += missingSyncResult.synced;
      totalErrors += missingSyncResult.errors;

      const result = {
        checked: convexCount,
        synced: totalSynced,
        errors: totalErrors,
        blockchainCount,
        convexCount,
        missingCount,
      };

      console.log(`[1v1 Sync] Complete: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[1v1 Sync] Fatal error in syncLobbyFromBlockchain:", errorMsg);

      return {
        checked: 0,
        synced: 0,
        errors: 1,
        blockchainCount: 0,
        convexCount: 0,
        missingCount: 0,
        fatalError: errorMsg,
      };
    }
  },
});
