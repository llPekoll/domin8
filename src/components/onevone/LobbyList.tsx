import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";
import { LobbyDetailsDialog } from "./LobbyDetailsDialog";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
  isPrivate?: boolean;
}

interface LobbyListProps {
  lobbies: LobbyData[];
  currentPlayerWallet: string;
  selectedCharacter: Character | null;
  onLobbyJoined?: (lobbyId: number) => void;
  onLobbyCancelled?: (lobbyId: number) => void;
}

export function LobbyList({
  lobbies,
  currentPlayerWallet,
  selectedCharacter,
  onLobbyJoined,
  onLobbyCancelled,
}: LobbyListProps) {
  const { connected, wallet, publicKey } = usePrivyWallet();
  const joinLobbyAction = useAction(api.lobbies.joinLobby);
  const cancelLobbyAction = useAction(api.lobbies.cancelLobby);
  const [joiningLobbies, setJoiningLobbies] = useState<Set<number>>(new Set());
  const [cancellingLobbies, setCancellingLobbies] = useState<Set<number>>(new Set());
  const [selectedLobby, setSelectedLobby] = useState<LobbyData | null>(null);
  const [activeTab, setActiveTab] = useState<"open" | "my">("open");
  
  logger.solana.debug("Rendering LobbyList with lobbies:", lobbies);

  // Filter lobbies based on active tab
  const openLobbies = lobbies.filter(
    (lobby) => lobby.playerA !== currentPlayerWallet && lobby.status === 0
  );
  const myLobbies = lobbies.filter(
    (lobby) => lobby.playerA === currentPlayerWallet && lobby.status === 0
  );
  const displayedLobbies = activeTab === "open" ? openLobbies : myLobbies;

  const handleJoinLobby = useCallback(
    async (lobby: LobbyData) => {
      if (!connected || !selectedCharacter || !wallet || !publicKey) {
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
        const { buildJoinLobbyTransaction, get1v1LobbyPDA } = await import("../../lib/solana-1v1-transactions");

        const connection = getSharedConnection();

        logger.ui.info("Joining lobby", {
          lobbyId: lobby.lobbyId,
          playerB: currentPlayerWallet,
          character: selectedCharacter.id,
        });

        // Derive the lobby PDA from lobbyId (don't rely on database value which may be invalid)
        const lobbyPda = get1v1LobbyPDA(lobby.lobbyId);
        const transaction = await buildJoinLobbyTransaction(
          publicKey!, // Use the PublicKey from usePrivyWallet hook
          lobby.lobbyId,
          selectedCharacter.id,
          lobbyPda,
          connection
        );

        logger.solana.debug("Transaction ready for signing", {
          type: transaction.constructor.name,
          messageType: transaction.message.constructor.name,
          messageLength: transaction.message.serialize().length,
          keysCount: transaction.message.staticAccountKeys?.length,
          instructionCount: transaction.message.compiledInstructions?.length,
        });

        // Sign and send using Privy's signAndSendAllTransactions
        logger.solana.info("Attempting to sign transaction with Privy wallet...");
        
        const chainId = `solana:devnet` as `${string}:${string}`;
        
        // For VersionedTransaction, serialize the full transaction (not just the message)
        // This includes the message and placeholder signatures
        const serialized = Buffer.from(transaction.serialize());
        
        logger.solana.debug("Serialized transaction", {
          serializedLength: serialized.length,
          serializedHex: serialized.slice(0, 32).toString("hex"),
        });
        
        let signAndSendResult;
        try {
          signAndSendResult = await wallet.signAndSendAllTransactions([
            {
              chain: chainId,
              transaction: serialized,
            },
          ]);
        } catch (privyError: any) {
          logger.solana.error("Privy wallet error (likely simulation failure):", {
            message: privyError?.message,
            code: privyError?.code,
            fullError: privyError,
          });
          throw new Error(`Privy wallet error: ${privyError?.message || String(privyError)}`);
        }
        
        logger.solana.debug("Sign and send result", {
          resultCount: signAndSendResult?.length,
          firstResult: signAndSendResult?.[0],
        });
        
        if (!signAndSendResult || signAndSendResult.length === 0) {
          throw new Error("Failed to get signature from Privy wallet");
        }
        
        const signatureBytes = signAndSendResult[0].signature;
        if (!signatureBytes) {
          throw new Error("No signature in Privy response");
        }
        
        // Import bs58 for signature encoding
        const { default: bs58 } = await import("bs58");
        const signature = bs58.encode(signatureBytes);
        
        logger.solana.info("Join transaction signed and sent", { signature });
        toast.loading("Waiting for transaction confirmation...", { id: "join-tx-confirm" });
        
        const confirmation = await connection.confirmTransaction(signature, "confirmed");
        
        if (confirmation.value.err) {
            throw new Error("Transaction failed: " + confirmation.value.err.toString());
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
        toast.error("Failed to join lobby: " + errorMsg);
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

  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  const handleCopyShareLink = useCallback(async (lobby: LobbyData, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/1v1?join=${lobby.shareToken}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  }, []);

  const handleCancelLobby = useCallback(
    async (lobby: LobbyData, e?: React.MouseEvent) => {
      e?.stopPropagation();
      
      if (!connected || !publicKey || !wallet) {
        toast.error("Please connect wallet");
        return;
      }

      // Confirm cancellation
      const confirmed = window.confirm(
        `Cancel lobby #${lobby.lobbyId}? You will receive a refund of ${formatAmount(lobby.amount)} SOL minus gas fees.`
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
        const { get1v1LobbyPDA } = await import("../../lib/solana-1v1-transactions");

        const connection = getSharedConnection();

        logger.ui.info("Cancelling lobby", {
          lobbyId: lobby.lobbyId,
          playerA: publicKey.toString(),
        });

        // Derive the lobby PDA from lobbyId (don't rely on database value which may be invalid)
        const lobbyPda = get1v1LobbyPDA(lobby.lobbyId);
        const { transaction, metrics } = await buildCancelLobbyTransactionOptimized(
          publicKey,
          lobby.lobbyId,
          lobbyPda,
          connection
        );

        // Get the block height for later validation
        const { lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        logger.ui.info("Transaction optimization metrics", {
          computeUnits: metrics.optimizedCU,
          priorityFee: metrics.priorityFee,
          estimatedCost: (metrics.estimatedCost / 1e9).toFixed(6) + " SOL",
        });

        logger.ui.debug("Signing and sending optimized cancel transaction with Privy wallet");

        // Send with Helius optimizations
        const network = import.meta.env.VITE_SOLANA_NETWORK || "devnet";
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
    [connected, publicKey, wallet, cancelLobbyAction, onLobbyCancelled]
  );

  return (
    <>
    <div className="bg-gray-900 border-2 border-indigo-500/30 rounded-lg p-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("open")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            activeTab === "open"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          Open Lobbies ({openLobbies.length})
        </button>
        <button
          onClick={() => setActiveTab("my")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            activeTab === "my"
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          My Lobbies ({myLobbies.length})
        </button>
      </div>

      {displayedLobbies.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-2">
            {activeTab === "open" 
              ? "No open lobbies at the moment" 
              : "You have no open lobbies"}
          </p>
          <p className="text-sm text-gray-500">
            {activeTab === "open" 
              ? "Create one to get started!" 
              : "Create a lobby to start playing!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedLobbies.map((lobby) => (
            <div 
              key={lobby._id} 
              className={`rounded-lg p-3 cursor-pointer transition-colors ${
                lobby.isPrivate 
                  ? "bg-purple-900/30 border-2 border-purple-500/50 hover:bg-purple-900/50 hover:border-purple-500/70" 
                  : "bg-gray-800 border border-indigo-400/30 hover:bg-gray-700 hover:border-indigo-400/60"
              }`}
              onClick={() => setSelectedLobby(lobby)}
            >
              <div className="flex items-center gap-4">
                {/* Lobby ID & Amount */}
                <div className="min-w-[100px]">
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    {lobby.isPrivate && <span title="Private Lobby">🔒</span>}
                    Lobby #{lobby.lobbyId}
                  </p>
                  <p className="text-lg font-bold text-yellow-400">
                    {formatAmount(lobby.amount)} SOL
                  </p>
                </div>

                {/* Character & Player Info */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="px-2 py-1 bg-indigo-900/50 rounded text-xs">
                    <span className="text-gray-400">Char:</span>{" "}
                    <span className="text-indigo-300">#{lobby.characterA}</span>
                  </div>
                  <div className="px-2 py-1 bg-gray-700/50 rounded text-xs">
                    <span className="text-gray-400">Map:</span>{" "}
                    <span className="text-gray-300">#{lobby.mapId}</span>
                  </div>
                  {activeTab === "open" && (
                    <p className="text-xs text-gray-500 font-mono truncate max-w-[120px]">
                      {lobby.playerA.slice(0, 4)}...{lobby.playerA.slice(-4)}
                    </p>
                  )}
                </div>

                {/* Share Button - hide for private lobbies in Open tab (they were shared with us, shouldn't reshare) */}
                {!(activeTab === "open" && lobby.isPrivate) && (
                  <button
                    onClick={(e) => handleCopyShareLink(lobby, e)}
                    className="p-2 hover:bg-indigo-700/50 rounded transition-colors"
                    title="Copy share link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300 hover:text-white">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </button>
                )}

                {/* Action Button */}
                {activeTab === "open" ? (
                  <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleJoinLobby(lobby);
                    }}
                    disabled={
                      joiningLobbies.has(lobby.lobbyId) ||
                      !connected ||
                      !selectedCharacter ||
                      lobby.playerA === currentPlayerWallet
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-colors whitespace-nowrap"
                  >
                    {joiningLobbies.has(lobby.lobbyId) ? "Joining..." : "Join"}
                  </button>
                ) : (
                  <button
                    onClick={(e) => handleCancelLobby(lobby, e)}
                    disabled={cancellingLobbies.has(lobby.lobbyId)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-colors whitespace-nowrap"
                  >
                    {cancellingLobbies.has(lobby.lobbyId) ? "..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    
    <LobbyDetailsDialog 
        isOpen={!!selectedLobby}
        onClose={() => setSelectedLobby(null)}
        lobby={selectedLobby}
        currentPlayerWallet={currentPlayerWallet}
        selectedCharacter={selectedCharacter}
        onJoin={(id) => {
            const lobby = lobbies.find(l => l.lobbyId === id);
            if (lobby) handleJoinLobby(lobby);
            setSelectedLobby(null);
        }}
        onCancel={(id) => {
            const lobby = lobbies.find(l => l.lobbyId === id);
            if (lobby) handleCancelLobby(lobby);
            setSelectedLobby(null);
        }}
    />
    </>
  );
}