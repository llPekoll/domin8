import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Trophy, X } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { calculateBadges, getBadgeTextureKeys } from "../game/utils/badgeUtils";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaderboardDialog({ open, onOpenChange }: LeaderboardDialogProps) {
  const { publicKey } = usePrivyWallet();
  const [sortBy, setSortBy] = useState<"points" | "level">("points");
  const leaderboard = useQuery(api.players.getLeaderboard, { limit: 50, sortBy });

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          bg: "bg-gradient-to-r from-yellow-900/50 via-yellow-700/30 to-yellow-900/50",
          rankBg: "bg-gradient-to-br from-yellow-400 via-yellow-300 to-yellow-500 text-yellow-900",
          glow: "shadow-[0_0_12px_rgba(234,179,8,0.5)]",
          nameColor: "text-yellow-100",
          statsColor: "text-yellow-200",
          pointsColor: "text-yellow-300",
        };
      case 2:
        return {
          bg: "bg-gradient-to-r from-slate-700/40 via-slate-500/25 to-slate-700/40",
          rankBg: "bg-gradient-to-br from-slate-300 via-slate-200 to-slate-400 text-slate-800",
          glow: "",
          nameColor: "text-slate-100",
          statsColor: "text-slate-200",
          pointsColor: "text-slate-100",
        };
      case 3:
        return {
          bg: "bg-gradient-to-r from-amber-900/40 via-amber-700/25 to-amber-900/40",
          rankBg: "bg-gradient-to-br from-amber-500 via-amber-400 to-amber-600 text-amber-950",
          glow: "",
          nameColor: "text-amber-100",
          statsColor: "text-amber-200",
          pointsColor: "text-amber-200",
        };
      default:
        return {
          bg: "bg-indigo-900/50",
          rankBg: "bg-indigo-700 text-indigo-100",
          glow: "",
          nameColor: "text-indigo-50",
          statsColor: "text-indigo-200",
          pointsColor: "text-indigo-100",
        };
    }
  };

  const isCurrentUser = (walletAddress: string) => {
    return publicKey && publicKey.toString() === walletAddress;
  };

  const calculateWinRate = (wins: number, totalGames: number) => {
    if (totalGames === 0) return "0%";
    return `${((wins / totalGames) * 100).toFixed(0)}%`;
  };

  // Render badges based on total wins
  const renderBadges = (totalWins: number) => {
    if (totalWins <= 0) return null;

    const badges = calculateBadges(totalWins);
    const badgeKeys = getBadgeTextureKeys(badges);

    if (badgeKeys.length === 0) return null;

    return (
      <div className="flex items-center gap-1">
        {badgeKeys.map((key, index) => (
          <img
            key={`${key}-${index}`}
            src={`/assets/badge/${key}.png`}
            alt={key}
            className="w-8 h-8 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[700px] bg-gradient-to-b from-indigo-950/98 to-slate-950/98 backdrop-blur-md border border-indigo-500/40 max-h-[80vh]"
      >
        {/* Custom close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-white hover:text-yellow-400 transition-colors border-2 border-white/50 hover:border-yellow-400 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader className="pb-2">
          <DialogTitle className="text-indigo-100 flex items-center justify-center gap-3 text-4xl font-bold tracking-wide">
            <Trophy className="w-8 h-8 text-yellow-400" />
            LEADERBOARD
          </DialogTitle>
        </DialogHeader>

        {/* Sort Toggle */}
        <div className="flex justify-center gap-2 pb-3">
          <button
            onClick={() => setSortBy("points")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              sortBy === "points"
                ? "bg-indigo-600 text-white shadow-lg"
                : "bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/50"
            }`}
          >
            Points
          </button>
          <button
            onClick={() => setSortBy("level")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              sortBy === "level"
                ? "bg-purple-600 text-white shadow-lg"
                : "bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/50"
            }`}
          >
            Level
          </button>
        </div>

        <div className="overflow-y-auto max-h-[50vh] pr-1 scrollbar-thin scrollbar-thumb-indigo-700/50 scrollbar-track-transparent">
          {leaderboard === undefined ? (
            <div className="text-center py-6 text-indigo-400/60">Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-6 text-indigo-400/60">No players yet. Be the first!</div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-indigo-950/95 z-10">
                <tr className="text-base text-indigo-300/70 uppercase">
                  <th className="py-2 pl-3 text-center">#</th>
                  <th className="text-left py-2">Player</th>
                  <th className="text-center py-2 w-14">Lvl</th>
                  <th className="text-center w-16">Games</th>
                  <th className="text-center py-2 w-16">Wins</th>
                  <th className="text-center py-2 w-16">Win%</th>
                  <th className="text-right py-2 pr-3 w-20">
                    {sortBy === "level" ? "XP" : "Points"}
                  </th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {leaderboard.map((player) => {
                  const style = getRankStyle(player.rank);
                  const isCurrent = isCurrentUser(player.walletAddress);

                  return (
                    <tr
                      key={player.walletAddress}
                      className={`rounded-md ${style.bg} ${style.glow} ${
                        isCurrent ? "ring-1 ring-indigo-400/60" : ""
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-3 pl-3 w-14">
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center text-lg font-bold ${style.rankBg}`}
                        >
                          {player.rank}
                        </div>
                      </td>

                      {/* Player Info */}
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-lg truncate max-w-[140px] ${style.nameColor}`}
                          >
                            {player.displayName}
                          </span>
                          {renderBadges(player.totalWins)}
                          {isCurrent && (
                            <span className="px-2 py-0.5 bg-indigo-500/60 text-white text-xs rounded font-medium">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Level */}
                      <td className="text-center py-3">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-yellow-400 text-sm">&#9733;</span>
                          <span className={`font-bold text-lg ${style.statsColor}`}>
                            {player.level}
                          </span>
                        </div>
                      </td>

                      {/* Games */}
                      <td className={`text-center py-3 font-semibold text-lg ${style.statsColor}`}>
                        {player.totalGamesPlayed}
                      </td>

                      {/* Wins */}
                      <td className={`text-center py-3 font-semibold text-lg ${style.statsColor}`}>
                        {player.totalWins}
                      </td>

                      {/* Win% */}
                      <td className={`text-center py-3 font-semibold text-lg ${style.statsColor}`}>
                        {calculateWinRate(player.totalWins, player.totalGamesPlayed)}
                      </td>

                      {/* Points or XP */}
                      <td
                        className={`text-right py-3 pr-3 font-bold text-xl ${style.pointsColor}`}
                      >
                        {sortBy === "level"
                          ? player.xp.toLocaleString()
                          : player.totalPoints.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
