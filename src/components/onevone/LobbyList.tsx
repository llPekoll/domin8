import { useState, useCallback, useMemo } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2 | 3; // 0 = Open, 1 = Awaiting VRF, 2 = VRF Received, 3 = Resolved
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
  onLobbySelected?: (lobbyId: number) => void; // New: parent handles displaying the dialog
}

export function LobbyList({
  lobbies,
  currentPlayerWallet,
  selectedCharacter,
  onLobbyJoined,
  onLobbySelected,
}: LobbyListProps) {
  const { connected, wallet, publicKey } = usePrivyWallet();
  const joinLobbyAction = useAction(api.lobbies.joinLobby);
  const [joiningLobbies, setJoiningLobbies] = useState<Set<number>>(new Set());
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

  // Get unique playerA wallet addresses from open lobbies to fetch their display names
  const playerAWallets = useMemo(() => {
    return [...new Set(openLobbies.map((lobby) => lobby.playerA))];
  }, [openLobbies]);

  // Fetch player names for all playerA wallets
  const playerNames = useQuery(
    api.players.getPlayersByWallets,
    playerAWallets.length > 0 ? { walletAddresses: playerAWallets } : "skip"
  );

  // Create a lookup map for quick access
  const playerNameMap = useMemo(() => {
    if (!playerNames) return new Map<string, string | null>();
    return new Map(playerNames.map((p) => [p.walletAddress, p.displayName]));
  }, [playerNames]);

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
    return (lamports / 1e9).toFixed(3);
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

  return (
    <div className="space-y-4">
      {/* Header with Tab Navigation */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-amber-100">ALL GAMES</h2>
        <span className="text-amber-400 font-mono">{activeTab === "open" ? openLobbies.length : myLobbies.length}</span>

        {/* Tab Pills */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("open")}
            className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === "open"
                ? "bg-amber-600 text-white shadow-lg"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Open ({openLobbies.length})
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === "my"
                ? "bg-amber-600 text-white shadow-lg"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            My Games ({myLobbies.length})
          </button>
        </div>
      </div>

      {/* Games List */}
      {displayedLobbies.length === 0 ? (
        <div className="text-center py-12 bg-gradient-to-r from-gray-900/80 to-gray-950/80 rounded-xl border border-gray-700/50">
          <p className="text-gray-300 mb-2 font-medium">
            {activeTab === "open" ? "No open games at the moment" : "You have no active games"}
          </p>
          <p className="text-sm text-gray-500">
            {activeTab === "open" ? "Create one to get started!" : "Create a game to start playing!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedLobbies.map((lobby) => {
            const rawName = activeTab === "open"
              ? playerNameMap.get(lobby.playerA) || lobby.playerA.slice(0, 4) + "..." + lobby.playerA.slice(-4)
              : "You";
            const playerAName = rawName.length > 20 ? rawName.slice(0, 20) + "…" : rawName;

            return (
              <div
                key={lobby._id}
                className={`rounded-xl p-4 cursor-pointer transition-all ${
                  lobby.isPrivate
                    ? "bg-gradient-to-r from-purple-900/40 to-purple-950/40 border border-purple-500/30 hover:border-purple-400/50"
                    : "bg-gradient-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 hover:border-amber-600/50"
                }`}
                onClick={() => onLobbySelected?.(lobby.lobbyId)}
              >
                <div className="flex items-center justify-between">
                  {/* Player A */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                        activeTab === "my"
                          ? "bg-gradient-to-br from-amber-500 to-amber-700 border-amber-400"
                          : "bg-gradient-to-br from-amber-600 to-amber-800 border-amber-500/50"
                      }`}>
                        <span className="text-white font-bold text-lg">
                          {playerAName[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-amber-600 text-[10px] text-white font-bold px-1.5 py-0.5 rounded-full border border-amber-400">
                        {lobby.characterA || 1}
                      </div>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{playerAName}</p>
                    </div>
                  </div>

                  {/* VS Icon */}
                  <div className="flex items-center gap-4 px-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-amber-500" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 3l6 6M18 3l-6 6M6 21l6-6M18 21l-6-6" />
                    </svg>
                  </div>

                  {/* Player B (Waiting) */}
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <div>
                      <p className="text-gray-500 font-semibold italic">Waiting...</p>
                    </div>
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center">
                        <span className="text-gray-500 text-2xl">?</span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-gray-700 text-[10px] text-gray-400 font-bold px-1.5 py-0.5 rounded-full border border-gray-600">
                        ?
                      </div>
                    </div>
                  </div>

                  {/* Amount & Actions */}
                  <div className="flex items-center gap-3 ml-6">
                    <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                      <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                      <span className="text-white font-bold">{formatAmount(lobby.amount)}</span>
                    </div>

                    {lobby.isPrivate && (
                      <span className="px-2 py-1 bg-purple-600/40 border border-purple-500/50 rounded text-purple-200 text-xs">
                        🔒
                      </span>
                    )}

                    {/* Join Button (only in Open tab) */}
                    {activeTab === "open" && (
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
                        className="px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
                      >
                        {joiningLobbies.has(lobby.lobbyId) ? "Joining..." : "Join"}
                      </button>
                    )}

                    {/* Share Button (in My Games tab) */}
                    {activeTab === "my" && (
                      <button
                        onClick={(e) => handleCopyShareLink(lobby, e)}
                        className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Copy share link"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <polyline points="16 6 12 2 8 6" />
                          <line x1="12" y1="2" x2="12" y2="15" />
                        </svg>
                      </button>
                    )}

                    {/* View Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLobbySelected?.(lobby.lobbyId);
                      }}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}