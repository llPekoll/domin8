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
  status: 0 | 1 | 2 | 3; // 0=Created, 1=Awaiting VRF, 2=VRF Received, 3=Resolved
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
  maxLobbies?: number;
}

const MAX_LOBBIES_DEFAULT = 50;

export function LobbyHistory({ lobbies, maxLobbies = MAX_LOBBIES_DEFAULT }: LobbyHistoryProps) {
  const displayedLobbies = useMemo(() => {
    return lobbies.slice(0, maxLobbies);
  }, [lobbies, maxLobbies]);

  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(3);
  };

  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return "--:--";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatWallet = (wallet: string | undefined) => {
    if (!wallet) return "---";
    return wallet.slice(0, 4) + "..." + wallet.slice(-4);
  };

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 0:
        return { text: "Open", color: "bg-blue-500/20 text-blue-300 border-blue-500/50" };
      case 1:
        return { text: "VRF...", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50" };
      case 2:
        return { text: "VRF ✓", color: "bg-orange-500/20 text-orange-300 border-orange-500/50" };
      case 3:
        return { text: "Done", color: "bg-green-500/20 text-green-300 border-green-500/50" };
      default:
        return { text: "?", color: "bg-gray-500/20 text-gray-300 border-gray-500/50" };
    }
  };

  if (displayedLobbies.length === 0) {
    return (
      <div className="lobby-history-sidebar">
        <div className="lobby-history-header">
          <h2 className="text-sm font-bold text-indigo-200">History</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-xs">No history yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-history-sidebar">
      <div className="lobby-history-header">
        <h2 className="text-sm font-bold text-indigo-200">
          History <span className="text-indigo-400/60">({displayedLobbies.length}{lobbies.length > maxLobbies ? `/${lobbies.length}` : ""})</span>
        </h2>
      </div>

      <div className="lobby-history-content lobby-history-scroll">
        {displayedLobbies.map((lobby) => {
          const statusBadge = getStatusBadge(lobby.status);
          const isResolved = lobby.status === 3;
          const isPlayerAWinner = lobby.winner === lobby.playerA;
          const isPlayerBWinner = lobby.winner === lobby.playerB;

          return (
            <div
              key={lobby._id}
              className="lobby-history-card"
            >
              {/* Header: ID + Status + Amount */}
              <div className="lobby-history-card-header">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-300 font-bold text-xs">#{lobby.lobbyId}</span>
                  <span className={`lobby-status-badge ${statusBadge.color}`}>
                    {statusBadge.text}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-indigo-300 font-semibold">{formatAmount(lobby.amount)}</span>
                  <span className="text-gray-500">SOL</span>
                </div>
              </div>

              {/* Players row */}
              <div className="lobby-history-players">
                <span className="text-gray-500 text-[14px]">A:</span>
                <span className={`font-mono text-[11px] ${isPlayerAWinner ? 'text-yellow-300 font-bold' : 'text-indigo-300'}`}>
                  {formatWallet(lobby.playerA)}
                  {isPlayerAWinner && ' 👑'}
                </span>
                <span className="text-gray-600 text-[14px] mx-1">vs</span>
                <span className="text-gray-500 text-[14px]">B:</span>
                {lobby.playerB ? (
                  <span className={`font-mono text-[11px] ${isPlayerBWinner ? 'text-yellow-300 font-bold' : 'text-indigo-300'}`}>
                    {formatWallet(lobby.playerB)}
                    {isPlayerBWinner && ' 👑'}
                  </span>
                ) : (
                  <span className="text-gray-600 italic text-[11px]">---</span>
                )}
                <span className="text-gray-500 text-[14px] ml-auto">{formatTime(isResolved ? lobby.resolvedAt : lobby.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
