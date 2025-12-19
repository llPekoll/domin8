import { useMemo } from "react";
import type { Character } from "../../types/character";
import "./LobbyHistory.css";

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
  createdAt?: number;
  resolvedAt?: number;
}

interface LobbyHistoryProps {
  lobbies: LobbyData[];
  characters?: Map<number, Character>;
}

export function LobbyHistory({ lobbies, characters }: LobbyHistoryProps) {
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatWallet = (wallet: string | undefined) => {
    if (!wallet) return "Unknown";
    return wallet.slice(0, 8) + "..." + wallet.slice(-4);
  };

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 0:
        return { text: "Open", color: "bg-blue-500/20 text-blue-300 border-blue-500/50" };
      case 1:
        return { text: "Resolved", color: "bg-green-500/20 text-green-300 border-green-500/50" };
      case 2:
        return { text: "Awaiting VRF", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50" };
      default:
        return { text: "Unknown", color: "bg-gray-500/20 text-gray-300 border-gray-500/50" };
    }
  };

  const getCharacterName = (characterId: number): string => {
    if (characters?.has(characterId)) {
      return characters.get(characterId)?.name || `Character ${characterId}`;
    }
    return `Char ${characterId}`;
  };

  if (lobbies.length === 0) {
    return (
      <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6">
        <h2 className="text-xl font-bold text-indigo-200 mb-4">Lobby History</h2>
        <div className="text-center py-8">
          <p className="text-gray-400">No completed lobbies yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6">
      <h2 className="text-xl font-bold text-indigo-200 mb-4">
        Lobby History ({lobbies.length})
      </h2>

      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 lobby-history-scroll">
        {lobbies.map((lobby) => {
          const statusBadge = getStatusBadge(lobby.status);
          const isResolved = lobby.status === 1;
          const isPlayerAWinner = lobby.winner === lobby.playerA;
          const isPlayerBWinner = lobby.winner === lobby.playerB;

          return (
            <div
              key={lobby._id}
              className="bg-gray-800/60 border border-indigo-400/40 rounded-lg p-3 hover:bg-gray-800 hover:border-indigo-400/60 transition-all"
            >
              {/* Header: Lobby ID, Status, and Amount */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <p className="text-xs font-bold text-indigo-300">#{lobby.lobbyId}</p>
                  <span
                    className={`px-2 py-0.5 rounded border text-xs font-semibold whitespace-nowrap ${statusBadge.color}`}
                  >
                    {statusBadge.text}
                  </span>
                </div>
                <p className="text-xs font-bold text-indigo-300 whitespace-nowrap">
                  {formatAmount(lobby.amount)} SOL
                </p>
              </div>

              {/* Players Info - Compact Layout */}
              <div className="space-y-2 mb-2">
                {/* Player A */}
                <div className="bg-gray-900/40 rounded p-2">
                  <p className="text-xs text-gray-400 mb-0.5">Player A</p>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-300 font-mono truncate">
                        {formatWallet(lobby.playerA)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {getCharacterName(lobby.characterA)}
                      </p>
                    </div>
                    {isResolved && isPlayerAWinner && (
                      <span className="px-2 py-0.5 bg-yellow-500/30 text-yellow-300 text-xs font-bold rounded border border-yellow-500/60 whitespace-nowrap ml-2">
                        👑 Won
                      </span>
                    )}
                  </div>
                </div>

                {/* Player B */}
                <div className="bg-gray-900/40 rounded p-2">
                  <p className="text-xs text-gray-400 mb-0.5">
                    {lobby.playerB ? "Player B" : "Waiting..."}
                  </p>
                  {lobby.playerB ? (
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-indigo-300 font-mono truncate">
                          {formatWallet(lobby.playerB)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {lobby.characterB ? getCharacterName(lobby.characterB) : "N/A"}
                        </p>
                      </div>
                      {isResolved && isPlayerBWinner && (
                        <span className="px-2 py-0.5 bg-yellow-500/30 text-yellow-300 text-xs font-bold rounded border border-yellow-500/60 whitespace-nowrap ml-2">
                          👑 Won
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">Cancelled or waiting</p>
                  )}
                </div>
              </div>

              {/* Winner Info */}
              {isResolved && (
                <div className="bg-indigo-900/30 border border-indigo-400/40 rounded p-2 mb-2">
                  <p className="text-xs text-indigo-300 mb-1 font-semibold">🏆 Winner</p>
                  {lobby.winner ? (
                    <p className="text-xs text-yellow-300 font-mono font-bold">
                      {formatWallet(lobby.winner)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No winner recorded</p>
                  )}
                </div>
              )}

              {/* Footer: Timestamps - Compact */}
              <div className="text-xs text-gray-500 space-y-0.5 border-t border-indigo-400/20 pt-2">
                <p className="truncate">Created: {formatDate(lobby.createdAt)}</p>
                {isResolved && (
                  <p className="truncate">Resolved: {formatDate(lobby.resolvedAt)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
