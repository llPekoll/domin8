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
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2;
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
  const [selectedLobby, setSelectedLobby] = useState<LobbyData | null>(null);
  
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
        const { buildJoinLobbyTransaction } = await import("../../lib/solana-1v1-transactions");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = getSharedConnection();

        logger.ui.info("Joining lobby", {
          lobbyId: lobby.lobbyId,
          playerB: currentPlayerWallet,
          character: selectedCharacter.id,
        });

        const lobbyPda = new PublicKey(lobby.lobbyPda);
        const transaction = await buildJoinLobbyTransaction(
          new PublicKey(currentPlayerWallet),
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

  if (lobbies.length === 0) {
    return (
      <div className="bg-gray-900 border-1 border-indigo-500/30 rounded-lg p-6">
        <h2 className="text-xl font-bold text-indigo-200 mb-4">Open Lobbies</h2>
        <div className="text-center py-8">
          <p className="text-gray-400 mb-2">No open lobbies at the moment</p>
          <p className="text-sm text-gray-500">Create one to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="bg-gray-900 border-2 border-indigo-500/30 rounded-lg p-6">
      <h2 className="text-xl font-bold text-indigo-200 mb-4">Open Lobbies ({lobbies.length})</h2>

      <div className="space-y-3">
        {lobbies.map((lobby) => (
          <div 
            key={lobby._id} 
            className="bg-gray-800 border border-indigo-400/50 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors"
            onClick={() => setSelectedLobby(lobby)}
          >
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
                className="ml-4 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-colors whitespace-nowrap"
              >
                {joiningLobbies.has(lobby.lobbyId) ? "Joining..." : "Join"}
              </button>
            </div>

            {/* Status Info */}
            <div className="flex gap-2 text-xs text-gray-400">
              <span className="px-2 py-1 bg-gray-700 rounded">
                Status: {lobby.status === 0 ? "Waiting" : lobby.status === 1 ? "Awaiting VRF" : "Resolved"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
    
    <LobbyDetailsDialog 
        isOpen={!!selectedLobby}
        onClose={() => setSelectedLobby(null)}
        lobby={selectedLobby}
        onJoin={(id) => {
            const lobby = lobbies.find(l => l.lobbyId === id);
            if (lobby) handleJoinLobby(lobby);
            setSelectedLobby(null);
        }}
    />
    </>
  );
}