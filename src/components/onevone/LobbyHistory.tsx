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
  settleTxHash?: string;
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

  const formatWallet = (wallet: string | undefined) => {
    if (!wallet) return "---";
    return wallet.slice(0, 4) + "..." + wallet.slice(-4);
  };

  if (displayedLobbies.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-amber-100">RECENT BATTLES</h2>
        <div className="text-center py-12 bg-gradient-to-b from-amber-900/20 to-amber-950/20 rounded-xl border border-amber-700/30">
          <p className="text-amber-400/60 text-sm">No battles yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-amber-100">RECENT BATTLES</h2>
        <span className="text-amber-400 font-mono">({displayedLobbies.length})</span>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700/50 scrollbar-track-gray-950/20">
        {displayedLobbies.map((lobby) => {
          const isResolved = lobby.status === 3;
          const isPlayerAWinner = lobby.winner === lobby.playerA;
          const isPlayerBWinner = lobby.winner === lobby.playerB;

          return (
            <div
              key={lobby._id}
              className="bg-gradient-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                {/* Player A */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative">
                    <div
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                        isPlayerAWinner
                          ? "bg-gradient-to-br from-amber-500 to-amber-700 border-amber-400"
                          : "bg-gradient-to-br from-gray-600 to-gray-800 border-gray-500/50"
                      }`}
                    >
                      <span className="text-white font-bold">
                        {lobby.playerA.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                    {isPlayerAWinner && <div className="absolute -top-1 -right-1 text-xs">👑</div>}
                  </div>
                  <p
                    className={`font-semibold text-sm ${isPlayerAWinner ? "text-amber-300" : "text-gray-400"}`}
                  >
                    {formatWallet(lobby.playerA)}
                  </p>
                </div>

                {/* VS Icon */}
                <div className="px-3">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    className="text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 3l6 6M18 3l-6 6M6 21l6-6M18 21l-6-6" />
                  </svg>
                </div>

                {/* Player B */}
                <div className="flex items-center gap-3 flex-1 justify-end">
                  <p
                    className={`font-semibold text-sm ${isPlayerBWinner ? "text-amber-300" : "text-gray-400"}`}
                  >
                    {lobby.playerB ? formatWallet(lobby.playerB) : "---"}
                  </p>
                  <div className="relative">
                    <div
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                        isPlayerBWinner
                          ? "bg-gradient-to-br from-amber-500 to-amber-700 border-amber-400"
                          : "bg-gradient-to-br from-gray-600 to-gray-800 border-gray-500/50"
                      }`}
                    >
                      <span className="text-white font-bold">
                        {lobby.playerB ? lobby.playerB.slice(0, 1).toUpperCase() : "?"}
                      </span>
                    </div>
                    {isPlayerBWinner && <div className="absolute -top-1 -right-1 text-xs">👑</div>}
                  </div>
                </div>

                {/* Amount & Winner */}
                <div className="flex items-center gap-2 ml-4">
                  <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                    <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                    <span className="text-white font-bold text-sm">
                      {formatAmount(lobby.amount)}
                    </span>
                  </div>
                  {isResolved && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-800/80 rounded-lg">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          isPlayerAWinner || isPlayerBWinner
                            ? "bg-gradient-to-br from-amber-500 to-amber-700"
                            : "bg-gray-700"
                        }`}
                      >
                        <span className="text-white text-[10px] font-bold">
                          {isPlayerAWinner
                            ? lobby.playerA.slice(0, 1).toUpperCase()
                            : isPlayerBWinner
                              ? lobby.playerB?.slice(0, 1).toUpperCase()
                              : "?"}
                        </span>
                      </div>
                      <span className="text-gray-300 font-medium text-sm">Winner</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
