import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
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
  const { connected } = usePrivyWallet();
  const [joiningLobbies, setJoiningLobbies] = useState<Set<number>>(new Set());

  // TODO: Uncomment after Convex API is regenerated
  // const joinLobby = useAction(api.lobbies.joinLobby);

  const handleJoinLobby = useCallback(
    async (lobby: LobbyData) => {
      if (!connected || !selectedCharacter) {
        toast.error("Please connect wallet and select a character");
        return;
      }

      if (lobby.playerA === currentPlayerWallet) {
        toast.error("You cannot join your own lobby");
        return;
      }

      setJoiningLobbies((prev) => new Set(prev).add(lobby.lobbyId));

      try {
        // TODO: Implement actual join transaction
        toast.info("Join lobby functionality coming soon", {
          description: "Waiting for on-chain program integration",
        });

        logger.ui.info("LobbyList: Join placeholder", {
          lobbyId: lobby.lobbyId,
          character: selectedCharacter.name,
        });

        // Example flow (to be implemented):
        // 1. Build join_lobby transaction on-chain
        // 2. Sign transaction with wallet
        // 3. Send transaction
        // 4. Wait for confirmation
        // 5. Call Convex action with transaction hash
        // 6. Call onLobbyJoined with lobby ID
        // onLobbyJoined?.(lobby.lobbyId);
      } catch (error) {
        logger.ui.error("Failed to join lobby:", error);
        toast.error("Failed to join lobby");
      } finally {
        setJoiningLobbies((prev) => {
          const next = new Set(prev);
          next.delete(lobby.lobbyId);
          return next;
        });
      }
    },
    [connected, selectedCharacter, currentPlayerWallet, onLobbyJoined]
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
