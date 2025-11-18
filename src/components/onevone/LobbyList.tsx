import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";

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

interface LobbyListProps {
  lobbies: LobbyData[];
  currentPlayerWallet: string;
  selectedCharacter: Character | null;
  onLobbyJoined?: (lobbyId: number) => void;
}

export function LobbyList({
  lobbies,
  currentPlayerWallet,
  selectedCharacter,
  onLobbyJoined,
}: LobbyListProps) {
  const { connected, wallet } = usePrivyWallet();
  const joinLobbyAction = useAction(api.lobbies.joinLobby);
  const [joiningLobbies, setJoiningLobbies] = useState<Set<number>>(new Set());
  logger.solana.debug("Rendering LobbyList with lobbies:", lobbies);

  const handleJoinLobby = useCallback(
    async (lobby: LobbyData) => {
      if (!connected || !selectedCharacter || !wallet) {
        toast.error("Please connect wallet and select a character");
        return;
      }

      if (lobby.playerA === currentPlayerWallet) {
        toast.error("You cannot join your own lobby");
        return;
      }

      setJoiningLobbies((prev) => new Set(prev).add(lobby.lobbyId));

      try {
        // Import utilities
        const { getSharedConnection } = await import("../../lib/sharedConnection");
        const {
          buildJoinLobbyTransactionOptimized,
          sendOptimizedTransaction,
          waitForConfirmationOptimized,
        } = await import("../../lib/solana-1v1-transactions-helius");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = getSharedConnection();

        logger.ui.info("Joining lobby", {
          lobbyId: lobby.lobbyId,
          playerB: currentPlayerWallet,
          character: selectedCharacter.id,
        });

        // Build optimized join transaction with Helius best practices
        const lobbyPda = new PublicKey(lobby.lobbyPda);
        const { transaction, metrics } = await buildJoinLobbyTransactionOptimized(
          new PublicKey(currentPlayerWallet),
          lobby.lobbyId,
          selectedCharacter.id,
          lobbyPda,
          connection
        );

        // Store the block height for later validation
        const { blockhash: _, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        logger.ui.info("Transaction optimization metrics", {
          computeUnits: metrics.optimizedCU,
          priorityFee: metrics.priorityFee,
          estimatedCost: (metrics.estimatedCost / 1e9).toFixed(6) + " SOL",
        });

        logger.ui.debug("Signing and sending optimized join transaction with Privy wallet");

        // Send with Helius optimizations (retry logic, blockhash checking)
        const network = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
        const signature = await sendOptimizedTransaction(
          connection,
          transaction,
          new PublicKey(currentPlayerWallet),
          wallet,
          lastValidBlockHeight,
          network
        );

        logger.ui.info("Optimized join transaction sent", {
          signature: signature.slice(0, 8) + "...",
          lobbyId: lobby.lobbyId,
        });
        toast.loading("Waiting for transaction confirmation...", { id: "join-tx-confirm" });

        // Wait for confirmation with Helius polling
        const isConfirmed = await waitForConfirmationOptimized(
          connection,
          signature,
          lastValidBlockHeight
        );

        if (!isConfirmed) {
          toast.error("Transaction confirmation timeout", { id: "join-tx-confirm" });
          logger.ui.error("Join transaction confirmation timed out", { signature });
          return;
        }

        toast.success("Transaction confirmed!", { id: "join-tx-confirm" });
        logger.ui.info("Join transaction confirmed on blockchain", { signature });

        // Call Convex action to update lobby in database
        logger.ui.debug("Calling Convex action to update lobby in database");

        const result = await joinLobbyAction({
          playerBWallet: currentPlayerWallet,
          lobbyId: lobby.lobbyId,
          characterB: selectedCharacter.id,
          transactionHash: signature,
        });

        if (result.success) {
          logger.ui.info("Lobby joined successfully", {
            lobbyId: result.lobbyId,
            winner: result.winner,
          });

          toast.success("You joined the lobby! Starting fight...", {
            duration: 5000,
          });

          // Callback to parent component to start fight
          onLobbyJoined?.(result.lobbyId);
        } else {
          toast.error("Failed to update lobby in database");
          logger.ui.error("Convex action failed");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("Failed to join lobby:", error);

        // Provide user-friendly error messages
        if (errorMsg.includes("User rejected")) {
          toast.error("Transaction rejected by user");
        } else if (errorMsg.includes("confirmation timeout")) {
          toast.error("Transaction confirmation timed out. Please check your wallet.");
        } else if (errorMsg.includes("insufficient funds")) {
          toast.error("Insufficient SOL for transaction fee and bet amount");
        } else {
          toast.error("Failed to join lobby: " + errorMsg);
        }
      } finally {
        setJoiningLobbies((prev) => {
          const next = new Set(prev);
          next.delete(lobby.lobbyId);
          return next;
        });
      }
    },
    [connected, wallet, selectedCharacter, currentPlayerWallet, onLobbyJoined, joinLobbyAction]
  );

  // Convert SOL from lamports for display
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  if (lobbies.length === 0) {
    return (
      <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6">
        <h2 className="text-xl font-bold text-indigo-200 mb-4">Open Lobbies</h2>
        <div className="text-center py-8">
          <p className="text-gray-400 mb-2">No open lobbies at the moment</p>
          <p className="text-sm text-gray-500">Create one to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6">
      <h2 className="text-xl font-bold text-indigo-200 mb-4">Open Lobbies ({lobbies.length})</h2>

      <div className="space-y-3">
        {lobbies.map((lobby) => (
          <div key={lobby._id} className="bg-gray-800 border border-indigo-400/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <p className="text-sm text-indigo-400">Lobby #{lobby.lobbyId}</p>
                <p className="text-indigo-200 font-semibold">
                  {formatAmount(lobby.amount)} SOL
                </p>
              </div>

              <div className="flex-1 text-center">
                <p className="text-xs text-gray-400">Player A</p>
                <p className="text-xs text-indigo-300 font-mono truncate">{lobby.playerA.slice(0, 8)}...</p>
              </div>

              <button
                onClick={() => handleJoinLobby(lobby)}
                disabled={
                  joiningLobbies.has(lobby.lobbyId) ||
                  !connected ||
                  !selectedCharacter ||
                  lobby.playerA === currentPlayerWallet
                }
                className="ml-4 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-colors whitespace-nowrap"
              >
                {joiningLobbies.has(lobby.lobbyId) ? "Joining..." : "Join"}
              </button>
            </div>

            {/* Status Info */}
            <div className="flex gap-2 text-xs text-gray-400">
              <span className="px-2 py-1 bg-gray-700 rounded">
                Status: {lobby.status === 0 ? "Waiting" : "Resolved"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
