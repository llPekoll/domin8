"use node";
/**
 * Node.js-based Convex actions for 1v1 Lobby management
 * These actions use Solana libraries that require Node.js runtime
 *
 * Separated from lobbies.ts because queries/mutations cannot use "use node"
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Solana1v1QueryClient, Solana1v1Client } from "./lib/solana_1v1";

// ============================================================================
// CONFIGURATION
// ============================================================================

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;

// Get CRANK_AUTHORITY from environment
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

/**
 * Crank action to call settle_lobby on-chain
 * This is called when a lobby is stuck at status 2 (VRF received) but winner not yet determined
 *
 * The settle_lobby instruction is permissionless - anyone can call it after VRF callback
 * has stored the randomness in the lobby account.
 */
export const _crankSettleLobby = internalAction({
  args: {
    lobbyId: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    lobbyId: number;
    success: boolean;
    txSignature?: string;
    error?: string;
  }> => {
    try {
      console.log(`[1v1 Crank] Attempting to settle lobby ${args.lobbyId} on-chain...`);

      if (!CRANK_AUTHORITY_PRIVATE_KEY) {
        throw new Error("CRANK_AUTHORITY_PRIVATE_KEY not configured");
      }

      const crankClient = new Solana1v1Client(RPC_ENDPOINT!, CRANK_AUTHORITY_PRIVATE_KEY);

      // Call settle_lobby on-chain - returns { txSignature, winner }
      const result = await crankClient.settleLobby(args.lobbyId);

      console.log(
        `[1v1 Crank] settle_lobby succeeded for lobby ${args.lobbyId}: ${result.txSignature}, winner: ${result.winner}, prize: ${result.prize}`
      );

      // Update Convex with the winner, prize, and settlement transaction hash
      // Note: The PDA is closed after settlement, so we get winner/prize from tx logs
      if (result.winner) {
        await ctx.runMutation(internal.lobbies._internalSettleLobby, {
          lobbyId: args.lobbyId,
          winner: result.winner,
          settleTxHash: result.txSignature,
          prizeAmount: result.prize ?? undefined,
        });
        console.log(
          `[1v1 Crank] Updated Convex with winner, prize (${result.prize} lamports), and settleTxHash for lobby ${args.lobbyId}`
        );
      } else {
        console.warn(`[1v1 Crank] Settlement succeeded but could not parse winner from logs`);
      }

      return {
        lobbyId: args.lobbyId,
        success: true,
        txSignature: result.txSignature,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[1v1 Crank] Failed to settle lobby ${args.lobbyId}:`, errorMsg);

      // Don't retry if lobby is already settled or doesn't exist
      if (
        errorMsg.includes("Lobby status is 3") ||
        errorMsg.includes("not found") ||
        errorMsg.includes("not exist") ||
        errorMsg.includes("empty")
      ) {
        // Lobby is already settled or closed - update Convex status if needed
        try {
          await ctx.runMutation(internal.lobbies._internalUpdateLobbyStatus, {
            lobbyId: args.lobbyId,
            status: 3,
          });
          console.log(
            `[1v1 Crank] Marked lobby ${args.lobbyId} as resolved (PDA closed or already settled)`
          );
        } catch (updateError) {
          // Ignore update errors
        }

        return {
          lobbyId: args.lobbyId,
          success: true,
          error: errorMsg,
        };
      }

      // Retry after delay if it failed for other reasons
      await ctx.scheduler.runAfter(10000, internal.lobbiesActions._crankSettleLobby, {
        lobbyId: args.lobbyId,
      });

      return {
        lobbyId: args.lobbyId,
        success: false,
        error: errorMsg,
      };
    }
  },
});

/**
 * Check a single lobby and settle it if resolved on-chain
 * Called by scheduler after VRF delay for a specific lobby
 *
 * New status flow:
 * 1 = Awaiting VRF (Player B joined, VRF requested)
 * 2 = VRF Received (randomness stored, ready for settlement)
 * 3 = Resolved (winner determined, funds distributed)
 */
export const _checkAndSettleLobby = internalAction({
  args: {
    lobbyId: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    lobbyId: number;
    settled: boolean;
    onChainStatus?: number;
    error?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

      // Get the lobby from Convex to verify it exists and is pending
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

      // If already resolved (status 3), skip
      if (convexLobby.status >= 3) {
        console.log(
          `[1v1 Scheduler] Lobby ${args.lobbyId} already at status ${convexLobby.status}, skipping`
        );
        return {
          lobbyId: args.lobbyId,
          settled: false,
          onChainStatus: convexLobby.status,
        };
      }

      // Check current state on-chain
      const lobbyPda = queryClient.getLobbyPdaForId(args.lobbyId);
      let onChainLobby;
      try {
        onChainLobby = await queryClient.getLobbyAccount(lobbyPda);
      } catch (fetchError) {
        // If PDA doesn't exist, it means the lobby was already settled and closed
        // Mark as resolved in Convex (we don't know the winner, but it's settled)
        console.log(
          `[1v1 Scheduler] Lobby ${args.lobbyId} PDA not found - likely already settled and closed`
        );

        // Check if Convex status is < 3, if so mark as resolved
        if (convexLobby.status < 3) {
          console.log(`[1v1 Scheduler] Marking lobby ${args.lobbyId} as resolved (PDA closed)`);
          await ctx.runMutation(internal.lobbies._internalUpdateLobbyStatus, {
            lobbyId: args.lobbyId,
            status: 3,
          });
        }

        return {
          lobbyId: args.lobbyId,
          settled: true,
          error: "PDA closed (already settled)",
        };
      }

      if (!onChainLobby) {
        console.warn(`[1v1 Scheduler] Lobby ${args.lobbyId} not found on-chain`);
        return {
          lobbyId: args.lobbyId,
          settled: false,
          error: "Lobby not found on-chain",
        };
      }

      console.log(
        `[1v1 Scheduler] Lobby ${args.lobbyId}: on-chain status = ${onChainLobby.status}, Convex status = ${convexLobby.status}`
      );

      // If fully resolved on-chain (status 3), update Convex
      if (onChainLobby.status === 3 && onChainLobby.winner) {
        console.log(
          `[1v1 Scheduler] Settling lobby ${args.lobbyId} with winner ${onChainLobby.winner.toString().slice(0, 8)}...`
        );

        await ctx.runMutation(internal.lobbies._internalSettleLobby, {
          lobbyId: args.lobbyId,
          winner: onChainLobby.winner.toString(),
        });

        console.log(`[1v1 Scheduler] Successfully settled lobby ${args.lobbyId}`);
        return {
          lobbyId: args.lobbyId,
          settled: true,
          onChainStatus: 3,
        };
      }

      // VRF received (status 2) - check if we need to call settle_lobby on-chain
      if (onChainLobby.status === 2) {
        // Update Convex status to 2 if needed
        if (convexLobby.status < 2) {
          console.log(
            `[1v1 Scheduler] Lobby ${args.lobbyId} has VRF (status 2). Updating Convex...`
          );
          await ctx.runMutation(internal.lobbies._internalUpdateLobbyStatus, {
            lobbyId: args.lobbyId,
            status: 2,
          });
        }

        // Check if winner is not set - means we need to call settle_lobby on-chain
        if (
          !onChainLobby.winner ||
          onChainLobby.winner.toString() === "11111111111111111111111111111111"
        ) {
          console.log(
            `[1v1 Scheduler] Lobby ${args.lobbyId} at status 2 but no winner - calling crank to settle`
          );
          // Call the crank to settle on-chain
          await ctx.scheduler.runAfter(0, internal.lobbiesActions._crankSettleLobby, {
            lobbyId: args.lobbyId,
          });
        } else {
          // Winner exists, schedule follow-up to check for settlement
          await ctx.scheduler.runAfter(5000, internal.lobbiesActions._checkAndSettleLobby, {
            lobbyId: args.lobbyId,
          });
        }

        return {
          lobbyId: args.lobbyId,
          settled: false,
          onChainStatus: 2,
        };
      }

      // Still pending VRF (status 1) - wait for MagicBlock callback
      if (onChainLobby.status === 1) {
        console.log(
          `[1v1 Scheduler] Lobby ${args.lobbyId} at status 1 (AWAITING_VRF). Waiting for MagicBlock callback...`
        );

        // Schedule a follow-up check
        await ctx.scheduler.runAfter(5000, internal.lobbiesActions._checkAndSettleLobby, {
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
      await ctx.scheduler.runAfter(5000, internal.lobbiesActions._checkAndSettleLobby, {
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
 * Crank action to settle pending lobbies
 * Runs periodically to call settle_lobby on all lobbies stuck at status 1 (AWAITING_VRF)
 */
export const settlePendingLobbies = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    checked: number;
    settled: number;
    errors: number;
    fatalError?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

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
            console.log(
              `[1v1 Crank] Lobby ${lobby.lobbyId} already resolved on-chain (status 2), updating Convex`
            );

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

          // If still at status 1, we wait for MagicBlock callback
          console.log(
            `[1v1 Crank] Lobby ${lobby.lobbyId} is still at status 1 on-chain. Waiting for MagicBlock callback.`
          );
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
 */
export const syncLobbyFromBlockchain = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    checked: number;
    synced: number;
    errors: number;
    blockchainCount: number;
    convexCount: number;
    missingCount: number;
    fatalError?: string;
  }> => {
    try {
      const queryClient = new Solana1v1QueryClient(RPC_ENDPOINT!);

      // Step 1: Get blockchain lobby count
      let blockchainCount = 0;
      try {
        console.log("[1v1 Sync] Attempting to fetch config account...");
        const config = await queryClient.getConfigAccount();

        if (!config) {
          throw new Error("Config account is null or undefined");
        }

        if (!config.lobbyCount) {
          throw new Error("Config account missing lobbyCount field");
        }

        blockchainCount =
          typeof config.lobbyCount === "number" ? config.lobbyCount : config.lobbyCount.toNumber();

        console.log(`[1v1 Sync] Successfully fetched blockchain lobby count: ${blockchainCount}`);
      } catch (error) {
        throw new Error(
          `Failed to fetch blockchain lobby count: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Step 2: Get all lobbies from Convex
      let convexLobbies: any[] = [];
      try {
        convexLobbies = await ctx.runQuery(internal.lobbies._getOpenLobbiesForSync);
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
      const convexIds = new Set(convexLobbies.map((l: any) => l.lobbyId));
      const missingIds: number[] = [];
      for (let i = 0; i < blockchainCount; i++) {
        if (!convexIds.has(i)) {
          missingIds.push(i);
        }
      }
      const missingCount = missingIds.length;

      if (missingIds.length > 0) {
        console.log(
          `[1v1 Sync] Found ${missingIds.length} potential missing lobbies: ${missingIds.join(", ")}`
        );
      }

      let totalSynced = 0;
      let totalErrors = 0;

      // Step 4: Sync open lobbies (check for state changes)
      console.log(`[1v1 Sync] Checking ${convexLobbies.length} open lobbies for state changes`);

      for (const lobbyInConvex of convexLobbies) {
        try {
          const lobbyPda = queryClient.getLobbyPdaForId(lobbyInConvex.lobbyId);
          const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

          if (!onChainLobby) {
            throw new Error("Lobby account not found on blockchain");
          }

          // Sync resolved lobbies
          if (onChainLobby.status === 3 && lobbyInConvex.status < 3) {
            if (onChainLobby.winner) {
              await ctx.runMutation(internal.lobbies._internalSettleLobby, {
                lobbyId: lobbyInConvex.lobbyId,
                winner: onChainLobby.winner.toString(),
              });
              totalSynced++;
              console.log(`[1v1 Sync] Synced resolved lobby ${lobbyInConvex.lobbyId}`);
            }
          } else if (onChainLobby.status === 2 && lobbyInConvex.status < 2) {
            // VRF received, schedule settlement
            await ctx.runMutation(internal.lobbies._internalUpdateLobbyStatus, {
              lobbyId: lobbyInConvex.lobbyId,
              status: 2,
            });
            await ctx.scheduler.runAfter(0, internal.lobbiesActions._crankSettleLobby, {
              lobbyId: lobbyInConvex.lobbyId,
            });
            totalSynced++;
          } else if (
            onChainLobby.status === 1 &&
            lobbyInConvex.status === 0 &&
            onChainLobby.playerB
          ) {
            // Player B joined
            await ctx.runMutation(internal.lobbies._internalJoinLobby, {
              lobbyId: lobbyInConvex.lobbyId,
              playerB: onChainLobby.playerB.toString(),
              characterB: onChainLobby.skinB,
            });
            totalSynced++;
          }
        } catch (error) {
          totalErrors++;
          console.error(
            `[1v1 Sync] Error syncing lobby ${lobbyInConvex.lobbyId}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      // Step 5: Sync missing lobbies
      for (const lobbyId of missingIds) {
        try {
          const lobbyPda = queryClient.getLobbyPdaForId(lobbyId);
          const onChainLobby = await queryClient.getLobbyAccount(lobbyPda);

          if (!onChainLobby) {
            // Closed/canceled lobby, skip
            continue;
          }

          const playerA = onChainLobby.playerA;
          const amount =
            typeof onChainLobby.amount === "number"
              ? onChainLobby.amount
              : onChainLobby.amount.toNumber();
          const characterA = onChainLobby.skinA;
          const mapId = onChainLobby.map;

          if (playerA && characterA !== undefined) {
            await ctx.runMutation(internal.lobbies._internalCreateLobby, {
              lobbyId,
              lobbyPda: lobbyPda.toString(),
              playerA: playerA.toString(),
              amount,
              characterA,
              mapId,
              isPrivate: false,
            });
            totalSynced++;
            console.log(`[1v1 Sync] Created missing lobby ${lobbyId}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes("not found") && !errorMsg.includes("not exist")) {
            totalErrors++;
            console.error(`[1v1 Sync] Error syncing missing lobby ${lobbyId}:`, errorMsg);
          }
        }
      }

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
