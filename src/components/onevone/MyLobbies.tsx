import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
}

interface MyLobbiesProps {
  lobbies: LobbyData[];
  currentPlayerWallet: string;
  onLobbyCancelled?: (lobbyId: number) => void;
}

export function MyLobbies({
  lobbies,
  currentPlayerWallet,
  onLobbyCancelled,
}: MyLobbiesProps) {
  const { connected, publicKey, wallet } = usePrivyWallet();
  const cancelLobbyAction = useAction(api.lobbies.cancelLobby);
  const [cancellingLobbies, setCancellingLobbies] = useState<Set<number>>(new Set());

  // Filter to only show lobbies created by the current player that are still open (status = 0)
  const myOpenLobbies = lobbies.filter(
    (lobby) => lobby.playerA === currentPlayerWallet && lobby.status === 0
  );

  const handleCancelLobby = useCallback(
    async (lobby: LobbyData) => {
      if (!connected || !publicKey || !wallet) {
        toast.error("Please connect wallet");
        return;
      }

      // Confirm cancellation
      const confirmed = window.confirm(
        `Cancel lobby #${lobby.lobbyId}? You will receive a refund of ${(
          lobby.amount / 1e9
        ).toFixed(4)} SOL minus gas fees.`
      );
      if (!confirmed) return;

      setCancellingLobbies((prev) => new Set(prev).add(lobby.lobbyId));

      try {
        // Import utilities
        const { getSharedConnection } = await import("../../lib/sharedConnection");
        const {
          buildCancelLobbyTransactionOptimized,
          sendOptimizedTransaction,
          waitForConfirmationOptimized,
        } = await import("../../lib/solana-1v1-transactions-helius");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = getSharedConnection();

        logger.ui.info("Cancelling lobby", {
          lobbyId: lobby.lobbyId,
          playerA: currentPlayerWallet,
        });

        // Build optimized cancel transaction
        const lobbyPda = new PublicKey(lobby.lobbyPda);
        const { transaction, metrics } = await buildCancelLobbyTransactionOptimized(
          publicKey,
          lobby.lobbyId,
          lobbyPda,
          connection
        );

        // Get the block height for later validation
        const { blockhash: _, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        logger.ui.info("Transaction optimization metrics", {
          computeUnits: metrics.optimizedCU,
          priorityFee: metrics.priorityFee,
          estimatedCost: (metrics.estimatedCost / 1e9).toFixed(6) + " SOL",
        });

        logger.ui.debug("Signing and sending optimized cancel transaction with Privy wallet");

        // Send with Helius optimizations
        const network = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
        const signature = await sendOptimizedTransaction(
          connection,
          transaction,
          publicKey,
          wallet,
          lastValidBlockHeight,
          network
        );

        logger.ui.info("Optimized cancel transaction sent", {
          signature: signature.slice(0, 8) + "...",
          lobbyId: lobby.lobbyId,
        });
        toast.loading("Waiting for transaction confirmation...", { id: "cancel-tx-confirm" });

        // Wait for confirmation
        const isConfirmed = await waitForConfirmationOptimized(
          connection,
          signature,
          lastValidBlockHeight
        );

        if (!isConfirmed) {
          toast.error("Transaction confirmation timeout", { id: "cancel-tx-confirm" });
          logger.ui.error("Cancel transaction confirmation timed out", { signature });
          return;
        }

        toast.success("Transaction confirmed!", { id: "cancel-tx-confirm" });
        logger.ui.info("Cancel transaction confirmed on blockchain", { signature });

        // Call Convex action to update database
        logger.ui.debug("Calling Convex action to cancel lobby in database");

        const result = await cancelLobbyAction({
          lobbyId: lobby.lobbyId,
          transactionHash: signature,
        });

        if (result.success) {
          logger.ui.info("Lobby cancelled successfully", {
            lobbyId: result.lobbyId,
          });

          toast.success(`Lobby #${result.lobbyId} cancelled! Refund sent to your wallet.`, {
            duration: 5000,
          });

          // Callback to parent component
          onLobbyCancelled?.(result.lobbyId);
        } else {
          toast.error("Failed to cancel lobby in database");
          logger.ui.error("Convex action failed");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("Failed to cancel lobby:", error);

        // Provide user-friendly error messages
        if (errorMsg.includes("User rejected")) {
          toast.error("Transaction rejected by user");
        } else if (errorMsg.includes("confirmation timeout")) {
          toast.error("Transaction confirmation timed out. Please check your wallet.");
        } else if (errorMsg.includes("insufficient funds")) {
          toast.error("Insufficient SOL for transaction fee");
        } else if (errorMsg.includes("InvalidLobbyStatus")) {
          toast.error("Lobby already joined or invalid status");
        } else {
          toast.error("Failed to cancel lobby: " + errorMsg);
        }
      } finally {
        setCancellingLobbies((prev) => {
          const next = new Set(prev);
          next.delete(lobby.lobbyId);
          return next;
        });
      }
    },
    [connected, publicKey, wallet, currentPlayerWallet, cancelLobbyAction, onLobbyCancelled]
  );

  // Convert SOL from lamports for display
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  if (myOpenLobbies.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-900 border-2 border-orange-500 rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold text-orange-200 mb-4">
        My Open Lobbies ({myOpenLobbies.length})
      </h2>

      <div className="space-y-3">
        {myOpenLobbies.map((lobby) => (
          <div
            key={lobby._id}
            className="bg-gray-800 border border-orange-400/50 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <p className="text-sm text-orange-400">Lobby #{lobby.lobbyId}</p>
                <p className="text-orange-200 font-semibold">
                  {formatAmount(lobby.amount)} SOL at stake
                </p>
              </div>

              <div className="flex-1 text-center">
                <p className="text-xs text-gray-400">Status</p>
                <p className="text-xs text-orange-300 font-semibold">
                  Waiting for Player B
                </p>
              </div>

              <button
                onClick={() => handleCancelLobby(lobby)}
                disabled={cancellingLobbies.has(lobby.lobbyId) || !connected}
                className="ml-4 px-3 py-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-colors whitespace-nowrap"
              >
                {cancellingLobbies.has(lobby.lobbyId) ? "Cancelling..." : "Cancel"}
              </button>
            </div>

            {/* Info */}
            <div className="text-xs text-gray-400">
              <p>
                • You will receive a refund of{" "}
                <span className="text-orange-300 font-semibold">
                  {formatAmount(lobby.amount)} SOL
                </span>
                {" "}minus gas fees
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
