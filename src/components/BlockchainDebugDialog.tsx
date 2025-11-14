/**
 * Blockchain Debug Dialog
 * Shows last winner info and current game state for debugging during development
 */

import { useState, useMemo, useEffect } from "react";
import { useActiveGame } from "../hooks/useActiveGame";
import { X, Trophy, TrendingUp, Users, Clock, Coins, Share2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "../hooks/usePrivyWallet";

export function BlockchainDebugDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { activeGame, activeGamePDA } = useActiveGame();
  const { connected } = usePrivyWallet();

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
    return (
      activeGame?.winner && activeGame.winner.toString() !== "11111111111111111111111111111111"
    );
  }, [activeGame?.winner]);

  const winnerDisplayName = winnerPlayer?.displayName || "Anonymous Player";
  const winnerPrizeSOL = activeGame?.winnerPrize
    ? (Number(activeGame.winnerPrize) / 1e9).toFixed(4)
    : "0";

  // Show tooltip when there's a winner and game is in results/closed state
  const shouldShowTooltip = useMemo(() => {
    if (!hasWinner || activeGame?.status !== 1 || !activeGame?.endTimestamp) {
      return false;
    }

    const endTime = Number(activeGame.endTimestamp) * 1000;
    const now = Date.now();
    const timeSinceEnd = now - endTime;

    // Only show tooltip if game ended within the last minute
    const maxAgeMs = 60 * 1000; // 1 minute
    return timeSinceEnd < maxAgeMs;
  }, [hasWinner, activeGame?.status, activeGame?.endTimestamp]);

  // Auto-show tooltip when winner appears
  useEffect(() => {
    if (shouldShowTooltip && !isOpen && connected) {
      // Set a timeout to delay a bit, for better UX
      const showTimer = setTimeout(() => setShowTooltip(true), 5000);

      // Auto-hide after 15 seconds total (5s delay + 10s shown)
      const hideTimer = setTimeout(() => setShowTooltip(false), 15000);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [shouldShowTooltip, isOpen, connected]);

  const shareWinnerOnX = () => {
    if (!hasWinner) return;

    const gameUrl = window.location.origin;
    const tweetText = `🏆 ${winnerDisplayName} just won ${winnerPrizeSOL} SOL in Royal Rumble!

Think you can be the next champion? Join the battle now! 👑

${gameUrl}

#RoyalRumble #Solana #Web3Gaming`;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, "_blank", "width=550,height=420");
  };

  if (!isOpen) {
    return (
      <div className="flex gap-3 justify-end  float-right">
        {/*<button
          onClick={() => setIsOpen(true)}
          className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-colors"
          title="Open Game Debug Panel"
        >
          <CircleHelp className="w-6 h-6" />
        </button>*/}

        {/* Social Links */}
        <div className="flex  gap-2">
          <a
            href="https://discord.gg/PuKXcSqK"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-colors"
            aria-label="Discord"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <a
            href="https://t.me/+tKHqLbBMvI02NDQ8"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-colors"
            aria-label="Telegram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472c-.18 1.898-.962 6.502-1.36 8.627c-.168.9-.499 1.201-.82 1.23c-.696.065-1.225-.46-1.9-.902c-1.056-.693-1.653-1.124-2.678-1.8c-1.185-.78-.417-1.21.258-1.91c.177-.184 3.247-2.977 3.307-3.23c.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345c-.48.33-.913.49-1.302.48c-.428-.008-1.252-.241-1.865-.44c-.752-.245-1.349-.374-1.297-.789c.027-.216.325-.437.893-.663c3.498-1.524 5.83-2.529 6.998-3.014c3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </a>
          <div className="relative">
            <a
              href="https://x.com/domin8Arena"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-gray-800 hover:bg-gray-900 text-white rounded-full shadow-lg transition-colors block"
              aria-label="X (Twitter)"
              onMouseEnter={() => shouldShowTooltip && setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={(e) => {
                if (shouldShowTooltip) {
                  e.preventDefault();
                  shareWinnerOnX();
                }
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26l8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            {/* Pixel Art Tooltip */}
            {shouldShowTooltip && showTooltip && (
              <div
                className="absolute right-full mr-3 top-1/2 -translate-y-1/2 z-[60] animate-bounce"
                style={{
                  imageRendering: "pixelated",
                  filter: "contrast(1.1)",
                }}
              >
                {/* Tooltip Arrow */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
                  <div
                    className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-yellow-400"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 right-[2px] w-0 h-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-gray-900"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>

                {/* Tooltip Content */}
                {/*<div
                  className="bg-gray-900 border-2 border-yellow-400 rounded px-3 py-2 shadow-2xl whitespace-nowrap"
                  style={{
                    boxShadow:
                      "0 0 20px rgba(250, 204, 21, 0.5), inset 0 0 10px rgba(250, 204, 21, 0.1)",
                    imageRendering: "pixelated",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-yellow-400 text-lg">🏆</div>
                    <div
                      className="font-bold text-yellow-400 text-sm"
                      style={{ fontFamily: "monospace" }}
                    >
                      WINNER!
                    </div>
                  </div>
                  <div className="text-white text-xs mb-2" style={{ fontFamily: "monospace" }}>
                    {winnerDisplayName}
                  </div>
                  <div
                    className="flex items-center gap-2 text-green-400 text-xs font-bold mb-2"
                    style={{ fontFamily: "monospace" }}
                  >
                    <span>💰</span>
                    <span>{winnerPrizeSOL} SOL</span>
                  </div>
                  <button
                    onClick={shareWinnerOnX}
                    className="text-center text-white text-xs font-bold py-1 px-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded border border-purple-400 transition-all w-full"
                    style={{
                      fontFamily: "monospace",
                      textShadow: "1px 1px 0px rgba(0,0,0,0.5)",
                    }}
                  >
                    👆 SHARE ON X!
                  </button>
                </div>*/}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const copyAllAsJSON = () => {
    const jsonData = {
      lastWinner: hasWinner
        ? {
            address: winnerAddress,
            displayName: winnerDisplayName,
            prize: winnerPrizeSOL + " SOL",
            winningBetIndex: activeGame?.winningBetIndex?.toString(),
          }
        : null,
      currentGame: {
        roundId: activeGame?.roundId?.toString(),
        status: formatStatus(activeGame?.status),
        totalPot: activeGame?.totalPot
          ? (Number(activeGame.totalPot) / 1e9).toFixed(4) + " SOL"
          : "0 SOL",
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
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-yellow-400" />
                  <h3 className="text-xl font-bold text-yellow-400">Last Winner</h3>
                </div>
                <button
                  onClick={shareWinnerOnX}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg transition-all text-sm font-semibold shadow-lg shadow-purple-500/30"
                  title="Share winner on X"
                >
                  <Share2 className="w-4 h-4" />
                  Share on X
                </button>
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

                {activeGame?.winningBetIndex !== undefined &&
                  activeGame.winningBetIndex !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 font-medium">Winning Bet:</span>
                      <span className="text-purple-400 font-bold">
                        #{activeGame.winningBetIndex.toString()}
                      </span>
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
              <p className="text-gray-500 text-sm">
                Winner will be displayed after the game concludes
              </p>
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
                icon={
                  <div
                    className={`w-2 h-2 rounded-full ${formatStatus(activeGame?.status) === "Open" ? "bg-green-500" : "bg-yellow-500"}`}
                  />
                }
                label="Status"
                value={formatStatus(activeGame?.status)}
              />

              <CompactStat
                icon={<Coins className="w-4 h-4 text-green-400" />}
                label="Total Pot"
                value={
                  activeGame?.totalPot
                    ? `${(Number(activeGame.totalPot) / 1e9).toFixed(3)} SOL`
                    : "0 SOL"
                }
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
              <span className="text-sm font-medium text-gray-400">Program Details</span>
            </summary>
            <div className="p-3 pt-0 space-y-2 text-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-500">Program ID:</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-mono text-xs break-all">
                    {import.meta.env.VITE_GAME_PROGRAM_ID}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        import.meta.env.VITE_GAME_PROGRAM_ID || ""
                      );
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
                  <span className="text-gray-400 font-mono text-xs break-all">
                    {activeGamePDA?.toBase58()}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(activeGamePDA?.toBase58() || "");
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
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Helper Components
function CompactStat({
  icon,
  label,
  value,
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
