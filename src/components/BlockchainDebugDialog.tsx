/**
 * Blockchain Debug Dialog
 * Shows last winner info and current game state for debugging during development
 */

import { useState, useMemo } from "react";
import { useActiveGame } from "../hooks/useActiveGame";
import { CircleHelp, X, Trophy, TrendingUp, Users, Clock, Coins } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function BlockchainDebugDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const { activeGame, activeGamePDA } = useActiveGame();

  // Get winner's display name if winner exists
  const winnerAddress = activeGame?.winner?.toString();
  const winnerPlayer = useQuery(
    api.players.getPlayer,
    winnerAddress && winnerAddress !== "11111111111111111111111111111111" 
      ? { walletAddress: winnerAddress } 
      : "skip"
  );

  // Determine if we have a winner to show
  const hasWinner = useMemo(() => {
    return activeGame?.winner && activeGame.winner.toString() !== "11111111111111111111111111111111";
  }, [activeGame?.winner]);

  const winnerDisplayName = winnerPlayer?.displayName || "Anonymous Player";
  const winnerPrizeSOL = activeGame?.winnerPrize 
    ? (Number(activeGame.winnerPrize) / 1e9).toFixed(4) 
    : "0";

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-50 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-colors"
        title="Open Game Debug Panel"
      >
        <CircleHelp className="w-6 h-6" />
      </button>
    );
  }

  const copyAllAsJSON = () => {
    const jsonData = {
      lastWinner: hasWinner ? {
        address: winnerAddress,
        displayName: winnerDisplayName,
        prize: winnerPrizeSOL + " SOL",
        winningBetIndex: activeGame?.winningBetIndex?.toString(),
      } : null,
      currentGame: {
        roundId: activeGame?.roundId?.toString(),
        status: formatStatus(activeGame?.status),
        totalPot: activeGame?.totalPot ? (Number(activeGame.totalPot) / 1e9).toFixed(4) + " SOL" : "0 SOL",
        betCount: activeGame?.betCount || 0,
        startTime: activeGame?.startTimestamp?.toString(),
        endTime: activeGame?.endTimestamp?.toString(),
      },
      connection: {
        programId: import.meta.env.VITE_GAME_PROGRAM_ID,
        gameRoundPDA: activeGamePDA?.toBase58(),
      },
      timestamp: new Date().toISOString(),
    };

    void navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-purple-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Game Details</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAllAsJSON}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                jsonCopied
                  ? "bg-green-600 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
              title="Copy all state as JSON"
            >
              {jsonCopied ? "✓ Copied!" : "📋 Copy JSON"}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Last Winner - Primary Section */}
          {hasWinner ? (
            <div className="bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-lg p-5 border-2 border-yellow-500/50 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-6 h-6 text-yellow-400" />
                <h3 className="text-xl font-bold text-yellow-400">Last Winner</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">Player:</span>
                  <span className="text-white font-bold text-lg">{winnerDisplayName}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">Prize:</span>
                  <span className="text-green-400 font-bold text-2xl flex items-center gap-2">
                    <Coins className="w-6 h-6" />
                    {winnerPrizeSOL} SOL
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-medium">Wallet:</span>
                  <span className="text-gray-400 font-mono text-xs break-all">
                    {winnerAddress?.slice(0, 8)}...{winnerAddress?.slice(-8)}
                  </span>
                </div>
                
                {activeGame?.winningBetIndex !== undefined && activeGame.winningBetIndex !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 font-medium">Winning Bet:</span>
                    <span className="text-purple-400 font-bold">#{activeGame.winningBetIndex.toString()}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-400">No Winner Yet</h3>
              </div>
              <p className="text-gray-500 text-sm">Winner will be displayed after the game concludes</p>
            </div>
          )}

          {/* Current Game - Compact Section */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-purple-400">Current Game</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <CompactStat 
                icon={<div className="w-2 h-2 rounded-full bg-blue-500" />}
                label="Round"
                value={`#${activeGame?.roundId?.toString() || "0"}`}
              />
              
              <CompactStat 
                icon={<div className={`w-2 h-2 rounded-full ${formatStatus(activeGame?.status) === "Open" ? "bg-green-500" : "bg-yellow-500"}`} />}
                label="Status"
                value={formatStatus(activeGame?.status)}
              />
              
              <CompactStat 
                icon={<Coins className="w-4 h-4 text-green-400" />}
                label="Total Pot"
                value={activeGame?.totalPot ? `${(Number(activeGame.totalPot) / 1e9).toFixed(2)} SOL` : "0 SOL"}
              />
              
              <CompactStat 
                icon={<Users className="w-4 h-4 text-blue-400" />}
                label="Bets"
                value={(activeGame?.betCount || 0).toString()}
              />
              
              <CompactStat 
                icon={<Clock className="w-4 h-4 text-purple-400" />}
                label="Start"
                value={formatCompactDate(activeGame?.startTimestamp)}
              />
              
              <CompactStat 
                icon={<Clock className="w-4 h-4 text-orange-400" />}
                label="End"
                value={formatCompactDate(activeGame?.endTimestamp)}
              />
            </div>
          </div>

          {/* Connection Info - Minimal */}
          <details className="bg-gray-800/30 rounded-lg border border-gray-700/50">
            <summary className="p-3 cursor-pointer hover:bg-gray-700/30 rounded-lg transition-colors">
              <span className="text-sm font-medium text-gray-400">Connection Details</span>
            </summary>
            <div className="p-3 pt-0 space-y-2 text-xs">
                <div className="flex justify-between items-center gap-2">
                <span className="text-gray-500">Program ID:</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-mono text-xs break-all">{import.meta.env.VITE_GAME_PROGRAM_ID}</span>
                  <button
                  onClick={() => {
                    void navigator.clipboard.writeText(import.meta.env.VITE_GAME_PROGRAM_ID || '');
                  }}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors flex-shrink-0"
                  title="Copy Program ID"
                  >
                  📋
                  </button>
                </div>
                </div>
                <div className="flex justify-between items-center gap-2">
                <span className="text-gray-500">Game PDA:</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-mono text-xs break-all">{activeGamePDA?.toBase58()}</span>
                  <button
                  onClick={() => {
                    void navigator.clipboard.writeText(activeGamePDA?.toBase58() || '');
                  }}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors flex-shrink-0"
                  title="Copy Game PDA"
                  >
                  📋
                  </button>
                </div>
                </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// Helper Functions
function formatStatus(status: any): string {
  if (status === undefined || status === null) return "Unknown";

  if (typeof status === "number") {
    switch (status) {
      case 0:
        return "Open";
      case 1:
        return "Closed";
      default:
        return `Unknown (${status})`;
    }
  }

  if (typeof status === "object") {
    const keys = Object.keys(status);
    const statusKey = keys[0] || "Unknown";
    return statusKey.charAt(0).toUpperCase() + statusKey.slice(1);
  }

  return String(status);
}

function formatCompactDate(timestamp: any): string {
  if (!timestamp) return "N/A";
  const ts = Number(timestamp);
  if (ts === 0) return "Not set";
  
  const date = new Date(ts * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Helper Components
function CompactStat({ 
  icon, 
  label, 
  value 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-700/30 rounded-lg p-2">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-semibold text-gray-200 truncate">{value}</div>
      </div>
    </div>
  );
}

