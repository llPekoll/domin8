import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Trophy, Medal, Award, Crown } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";

interface LeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaderboardDialog({ open, onOpenChange }: LeaderboardDialogProps) {
  const { publicKey } = usePrivyWallet();
  const leaderboard = useQuery(api.players.getLeaderboard, { limit: 50 });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <Trophy className="w-4 h-4 text-indigo-400" />;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/40";
      case 2:
        return "bg-gradient-to-r from-gray-400/20 to-gray-500/20 border-gray-400/40";
      case 3:
        return "bg-gradient-to-r from-amber-600/20 to-amber-700/20 border-amber-600/40";
      default:
        return "bg-indigo-900/20 border-indigo-500/30";
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isCurrentUser = (walletAddress: string) => {
    return publicKey && publicKey.toString() === walletAddress;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[600px] bg-gradient-to-b from-indigo-900/95 to-indigo-950/95 backdrop-blur-sm border-2 border-indigo-600/60 max-h-[80vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-indigo-100 flex items-center gap-2 text-2xl">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Leaderboard
          </DialogTitle>
          <DialogDescription className="text-indigo-300/80">
            Top players ranked by total points earned
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 overflow-y-auto max-h-[60vh] pr-2">
          {leaderboard === undefined ? (
            <div className="text-center py-8 text-indigo-300/60">Loading leaderboard...</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-8 text-indigo-300/60">
              No players on the leaderboard yet. Be the first to earn points!
            </div>
          ) : (
            leaderboard.map((player) => (
              <div
                key={player.walletAddress}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${getRankColor(
                  player.rank
                )} ${isCurrentUser(player.walletAddress) ? "ring-2 ring-indigo-400" : ""}`}
              >
                {/* Rank */}
                <div className="flex items-center justify-center w-12 flex-shrink-0">
                  {player.rank <= 3 ? (
                    <div className="flex flex-col items-center">
                      {getRankIcon(player.rank)}
                      <span className="text-xs text-indigo-300 mt-1">#{player.rank}</span>
                    </div>
                  ) : (
                    <span className="text-lg font-bold text-indigo-300">#{player.rank}</span>
                  )}
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-100 font-semibold truncate">
                      {player.displayName}
                    </span>
                    {isCurrentUser(player.walletAddress) && (
                      <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 text-xs rounded-full">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-indigo-400/60 font-mono">
                    {truncateAddress(player.walletAddress)}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400">🏆</span>
                    <span className="text-lg font-bold text-indigo-100">
                      {player.totalPoints.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-indigo-400/80">
                    {player.totalWins} {player.totalWins === 1 ? "win" : "wins"} /{" "}
                    {player.totalGamesPlayed} {player.totalGamesPlayed === 1 ? "game" : "games"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-indigo-500/30">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 bg-indigo-700/50 hover:bg-indigo-600/50 text-indigo-100 rounded-lg transition-all"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
