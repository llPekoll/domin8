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
 * 
 * Now includes Switchboard randomness account tracking:
 * - randomnessAccountPubkey: The on-chain Switchboard randomness account address
 *   This account will be used for deterministic randomness in the join_lobby instruction
 */
export const createLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
    lobbyPda: v.string(),
    playerA: v.string(),
    amount: v.number(),
    characterA: v.number(),
    mapId: v.number(),
    forceSeed: v.string(),
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
      forceSeed: args.forceSeed,
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
 * Public mutation wrapper for settling lobbies
 * Used by the settleLobby action
 */
export const settleLobbyInDb = mutation({
  args: {
    lobbyId: v.number(),
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
      winner: args.winner,
      status: 2, // Status 2 = Resolved
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
    forceSeed: v.string(),
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
      forceSeed: args.forceSeed,
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

    // Schedule a job to settle this lobby after a delay
    // VRF typically resolves within 5-10 seconds, so we check after that
    await ctx.scheduler.runAfter(10000, internal.lobbies._checkAndSettleLobby, {
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
    forceSeed: v.string(), // ORAO force seed (hex string)
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
        forceSeed: args.forceSeed,
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

      // Status should be 2 (Awaiting VRF) or 1 (Resolved)
      if (lobbyAccount.status === 0) {
        throw new Error("Lobby status is still 0 (Created) after join");
      }

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
 * Settle a lobby (Resolve winner)
 * Frontend flow:
 * 1. User signs transaction to settle (or crank does it)
 * 2. Frontend calls this action
 * 3. Action confirms and updates Convex
 */
export const settleLobby = action({
  args: {
    lobbyId: v.number(),
    transactionHash: v.string(),
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

      if (lobbyAccount.status !== 2) {
        throw new Error("Lobby has not been resolved yet");
      }

      // Determine winner from on-chain account
      const winner = lobbyAccount.winner.toString();

      // Update Convex
      await ctx.runMutation(internal.lobbies._internalSettleLobby, {
        lobbyId: args.lobbyId,
        winner,
      });

      return {
        success: true,
        lobbyId: args.lobbyId,
        winner,
        action: "settle",
      };
    } catch (error) {
      throw new Error(
        `Failed to settle lobby: ${error instanceof Error ? error.message : String(error)}`
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
    // Get both status 0 (waiting for Player B) and status 1 (awaiting VRF) lobbies
    const status0 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 0))
      .collect();

    const status1 = await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();

    return [...status0, ...status1];
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
 * Updates Convex if lobby status has progressed on-chain
 * Handles: status 0→1 (joined) and status 1→2 (resolved)
 */
const _syncResolvedLobby = async (
  ctx: any,
  lobbyInConvex: any,
  onChainLobby: any,
  queryClient: any
): Promise<boolean> => {
  // Check if on-chain status has progressed beyond what we have in Convex
  
  // Case 1: Lobby has been joined (status 0→1) on-chain but still shows as open in Convex
  if (onChainLobby.status === 1 && lobbyInConvex.status === 0) {
    console.log(
      `[1v1 Sync] Syncing joined lobby ${lobbyInConvex.lobbyId} (Player B joined on-chain)`
    );

    // Update Convex to reflect Player B joined and status is AWAITING_VRF
    if (onChainLobby.playerB) {
      const playerB = onChainLobby.playerB.toString();
      const characterB = onChainLobby.skinB;
      
      await ctx.runMutation(internal.lobbies._internalJoinLobby, {
        lobbyId: lobbyInConvex.lobbyId,
        playerB,
        characterB,
      });
      console.log(`[1v1 Sync] Updated lobby ${lobbyInConvex.lobbyId} with Player B: ${playerB.slice(0, 8)}..., char: ${characterB}`);
      return true;
    }
  }

  // Case 2: Lobby is AWAITING_VRF (status 1) - trigger settlement check via scheduler
  if (onChainLobby.status === 1 && lobbyInConvex.status === 1) {
    console.log(
      `[1v1 Sync] Lobby ${lobbyInConvex.lobbyId} is at status 1 (AWAITING_VRF), scheduling settlement check`
    );
    // Schedule the scheduler action to check and settle this lobby
    await ctx.scheduler.runAfter(0, internal.lobbies._checkAndSettleLobby, {
      lobbyId: lobbyInConvex.lobbyId,
    });
    return true;
  }

  // Case 3: Lobby has been resolved (status 1→2 or 0→2) on-chain but still open in Convex
  if (onChainLobby.status === 2 && (lobbyInConvex.status === 0 || lobbyInConvex.status === 1)) {
    // Lobby has been resolved on-chain but we still have it as open
    console.log(`[1v1 Sync] Syncing resolved lobby ${lobbyInConvex.lobbyId} to Convex (on-chain status: 2, Convex status: ${lobbyInConvex.status})`);

    // Safety check: Ensure winner exists before calling toString()
    if (!onChainLobby.winner) {
      console.warn(
        `[1v1 Sync] Lobby ${lobbyInConvex.lobbyId} has status 2 but winner is null, skipping sync`
      );
      return false;
    }

    // Determine the winner
    const winner = onChainLobby.winner.toString();

    console.log(`[1v1 Sync] Calling _internalSettleLobby for lobby ${lobbyInConvex.lobbyId} with winner ${winner.slice(0, 8)}...`);

    // Update Convex to mark as resolved (status 2)
    await ctx.runMutation(internal.lobbies._internalSettleLobby, {
      lobbyId: lobbyInConvex.lobbyId,
      winner,
    });

    console.log(`[1v1 Sync] Successfully settled lobby ${lobbyInConvex.lobbyId}`);
    return true;
  }

  // Log when no sync is needed
  console.log(`[1v1 Sync] Lobby ${lobbyInConvex.lobbyId}: No sync needed (on-chain status: ${onChainLobby.status}, Convex status: ${lobbyInConvex.status})`);
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
  console.log(`[1v1 Sync] Lobby details: ${JSON.stringify(openLobbies.map(l => ({ id: l.lobbyId, status: l.status })))}`);

  for (const lobbyInConvex of openLobbies) {
    try {
      console.log(`[1v1 Sync] Processing lobby ${lobbyInConvex.lobbyId} (Convex status: ${lobbyInConvex.status})`);
      
      // Fetch the lobby account from blockchain
      const lobbyPda = queryClient.getLobbyPdaForId(lobbyInConvex.lobbyId);
      const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

      if (!onChainLobby) {
        throw new Error("Lobby account not found on blockchain");
      }

      console.log(`[1v1 Sync] Lobby ${lobbyInConvex.lobbyId} on-chain data: ${JSON.stringify({ status: onChainLobby.status, winner: onChainLobby.winner?.toString() || 'null', playerB: onChainLobby.playerB?.toString() || 'null' })}`);

      // Try to sync if resolved
      const wasSynced = await _syncResolvedLobby(ctx, lobbyInConvex, onChainLobby, queryClient);
      if (wasSynced) {
        synced++;
      } else {
        console.log(`[1v1 Sync] Lobby ${lobbyInConvex.lobbyId} did not require sync (no state change detected)`);
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
        // console.log(`[1v1 Sync] Lobby ${lobbyId} not found on blockchain (likely canceled/closed)`);
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
        // console.log(
        //   `[1v1 Sync] Lobby ${lobbyId} not found on blockchain (likely canceled/closed)`
        // );
      }
    }
  }

  return { synced, errors };
};

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
 * Internal query to get all lobbies at status 1 (pending settlement)
 */
export const _getPendingLobbiesForSettlement = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("oneVOneLobbies")
      .withIndex("by_status", (q) => q.eq("status", 1))
      .collect();
  },
});

/**
 * Check a single lobby and settle it if resolved on-chain
 * Called by scheduler after VRF delay for a specific lobby
 */
export const _checkAndSettleLobby = internalAction({
  args: {
    lobbyId: v.number(),
  },
  handler: async (ctx, args): Promise<{
    lobbyId: number;
    settled: boolean;
    onChainStatus?: number;
    error?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);
      
      // Get the lobby from Convex to verify it exists and is still at status 1
      const convexLobby = await ctx.runQuery(internal.lobbies._getLobbyById, {
        lobbyId: args.lobbyId,
      });

      if (!convexLobby) {
        console.log(`[1v1 Scheduler] Lobby ${args.lobbyId} not found in Convex, skipping`);
        return {
          lobbyId: args.lobbyId,
          settled: false,
          error: "Lobby not found in Convex",
        };
      }

      // If already settled, skip
      if (convexLobby.status !== 1) {
        console.log(`[1v1 Scheduler] Lobby ${args.lobbyId} already at status ${convexLobby.status}, skipping`);
        return {
          lobbyId: args.lobbyId,
          settled: false,
          onChainStatus: convexLobby.status,
        };
      }

      // Check if resolved on-chain
      const lobbyPda = queryClient.getLobbyPdaForId(args.lobbyId);
      const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

      if (!onChainLobby) {
        console.warn(`[1v1 Scheduler] Lobby ${args.lobbyId} not found on-chain`);
        return {
          lobbyId: args.lobbyId,
          settled: false,
          error: "Lobby not found on-chain",
        };
      }

      console.log(`[1v1 Scheduler] Lobby ${args.lobbyId}: on-chain status = ${onChainLobby.status}`);

      // If resolved on-chain, update Convex
      if (onChainLobby.status === 2 && onChainLobby.winner) {
        console.log(`[1v1 Scheduler] Settling lobby ${args.lobbyId} with winner ${onChainLobby.winner.toString().slice(0, 8)}...`);
        
        await ctx.runMutation(internal.lobbies._internalSettleLobby, {
          lobbyId: args.lobbyId,
          winner: onChainLobby.winner.toString(),
        });

        console.log(`[1v1 Scheduler] Successfully settled lobby ${args.lobbyId}`);
        return {
          lobbyId: args.lobbyId,
          settled: true,
          onChainStatus: 2,
        };
      }

      // Still pending on-chain - schedule another check after delay
      if (onChainLobby.status === 1) {
        console.log(`[1v1 Scheduler] Lobby ${args.lobbyId} still pending (status 1), scheduling retry in 5 seconds`);
        await ctx.scheduler.runAfter(5000, internal.lobbies._checkAndSettleLobby, {
          lobbyId: args.lobbyId,
        });
      }

      return {
        lobbyId: args.lobbyId,
        settled: false,
        onChainStatus: onChainLobby.status,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[1v1 Scheduler] Error checking lobby ${args.lobbyId}:`, errorMsg);
      
      // Retry on error after delay
      console.log(`[1v1 Scheduler] Scheduling retry for lobby ${args.lobbyId} after error`);
      await ctx.scheduler.runAfter(5000, internal.lobbies._checkAndSettleLobby, {
        lobbyId: args.lobbyId,
      });

      return {
        lobbyId: args.lobbyId,
        settled: false,
        error: errorMsg,
      };
    }
  },
});

/**
 * // FIXME: add a CRON schedule in security ??
 * Crank action to settle pending lobbies 
 * Runs periodically to call settle_lobby on all lobbies stuck at status 1 (AWAITING_VRF)
 * 
 * This action:
 * 1. Fetches all lobbies at status 1 from Convex
 * 2. For each lobby, checks if it's resolved on-chain (status 2)
 * 3. If resolved, updates Convex with the winner
 * 4. If still pending, logs alert for external crank to handle
 */
export const settlePendingLobbies = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    checked: number;
    settled: number;
    errors: number;
    fatalError?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT);
      
      // Get all lobbies at status 1 (AWAITING_VRF)
      const pendingLobbies = await ctx.runQuery(internal.lobbies._getPendingLobbiesForSettlement);

      console.log(`[1v1 Crank] Found ${pendingLobbies.length} pending lobbies to settle`);

      let settled = 0;
      let errors = 0;

      for (const lobby of pendingLobbies) {
        try {
          console.log(`[1v1 Crank] Processing lobby ${lobby.lobbyId} for settlement`);
          
          // Fetch the lobby account from blockchain to get its state
          const lobbyPda = queryClient.getLobbyPdaForId(lobby.lobbyId);
          const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

          if (!onChainLobby) {
            console.warn(`[1v1 Crank] Lobby ${lobby.lobbyId} not found on-chain, skipping`);
            continue;
          }

          // Check if already resolved on-chain (status 2)
          if (onChainLobby.status === 2) {
            console.log(`[1v1 Crank] Lobby ${lobby.lobbyId} already resolved on-chain (status 2), updating Convex`);
            
            if (onChainLobby.winner) {
              await ctx.runMutation(internal.lobbies._internalSettleLobby, {
                lobbyId: lobby.lobbyId,
                winner: onChainLobby.winner.toString(),
              });
              settled++;
              console.log(`[1v1 Crank] Successfully updated lobby ${lobby.lobbyId} in Convex`);
              continue;
            }
          }

          // If still at status 1, we need an external service to call settle_lobby instruction
          console.log(`[1v1 Crank] ALERT: Lobby ${lobby.lobbyId} is still at status 1 on-chain. External crank needed to call settle_lobby instruction.`);
          
        } catch (error) {
          errors++;
          console.error(
            `[1v1 Crank] Error processing lobby ${lobby.lobbyId}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      const result = {
        checked: pendingLobbies.length,
        settled,
        errors,
      };

      console.log(`[1v1 Crank] Complete: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[1v1 Crank] Fatal error:", errorMsg);

      return {
        checked: 0,
        settled: 0,
        errors: 1,
        fatalError: errorMsg,
      };
    }
  },
});

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

      //Step 5: Sync missing lobbies (add to Convex from blockchain)
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
