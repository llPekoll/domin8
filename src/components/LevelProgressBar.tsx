import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "../hooks/usePrivyWallet";

interface LevelProgressBarProps {
  compact?: boolean;
}

export function LevelProgressBar({ compact = false }: LevelProgressBarProps) {
  const { publicKey, connected } = usePrivyWallet();

  const xpInfo = useQuery(
    api.players.getPlayerXpInfo,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  if (!connected || !xpInfo) {
    return null;
  }

  const { level, levelTitle, progress, xpToNextLevel, currentWinStreak, xp } = xpInfo;

  if (compact) {
    // Compact version for mobile header
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-indigo-900/50 rounded-lg border border-indigo-500/30">
        <div className="flex items-center gap-1">
          <span className="text-yellow-400 text-sm">&#9733;</span>
          <span className="text-indigo-100 font-bold text-sm">Lv.{level}</span>
        </div>
        <div className="w-12 h-1.5 bg-indigo-950 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Full version for desktop (top-left corner)
  return (
    <div className="w-56 p-3 bg-gray-950/90 backdrop-blur-sm border border-indigo-500/40 rounded-lg shadow-lg">
      {/* Level Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-base">{level}</span>
          </div>
          <div>
            <p className="text-indigo-100 font-semibold text-sm leading-tight">{levelTitle}</p>
            <p className="text-indigo-400 text-xs">Level {level}</p>
          </div>
        </div>
        {currentWinStreak > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/20 rounded-full border border-orange-500/30">
            <span className="text-orange-400 text-xs">&#128293;</span>
            <span className="text-orange-300 text-xs font-semibold">{currentWinStreak}</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-indigo-400">{xp.toLocaleString()} XP</span>
          <span className="text-indigo-300">{progress}%</span>
        </div>
        <div className="h-2.5 bg-indigo-950 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {level < 10 && (
          <p className="text-indigo-500 text-xs text-right">
            {xpToNextLevel.toLocaleString()} XP to next level
          </p>
        )}
        {level === 10 && (
          <p className="text-yellow-500 text-xs text-right font-semibold">MAX LEVEL</p>
        )}
      </div>
    </div>
  );
}
