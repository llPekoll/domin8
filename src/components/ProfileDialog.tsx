import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { User, Trophy, X } from "lucide-react";
import { logger } from "../lib/logger";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName?: string;
  walletAddress: string;
}

export function ProfileDialog({
  open,
  onOpenChange,
  currentName,
  walletAddress
}: ProfileDialogProps) {
  const [displayName, setDisplayName] = useState(currentName || "");
  const [isUpdating, setIsUpdating] = useState(false);

  const updateDisplayName = useMutation(api.players.updateDisplayName);

  // Fetch player data
  const playerData = useQuery(
    api.players.getPlayer,
    { walletAddress }
  );

  // Fetch recent games
  const recentGames = useQuery(
    api.players.getRecentGames,
    { walletAddress, limit: 10 }
  );

  const totalWins = playerData?.totalWins ?? 0;
  const totalGames = playerData?.totalGamesPlayed ?? 0;
  const totalLosses = totalGames - totalWins;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      toast.error("Please enter a display name");
      return;
    }

    if (displayName.trim().length < 3) {
      toast.error("Display name must be at least 3 characters");
      return;
    }

    if (displayName.trim().length > 20) {
      toast.error("Display name must be less than 20 characters");
      return;
    }

    setIsUpdating(true);
    try {
      await updateDisplayName({
        walletAddress,
        displayName: displayName.trim()
      });
      toast.success("Display name updated successfully!");
      onOpenChange(false);
    } catch (error) {
      logger.ui.error("Failed to update display name:", error);
      toast.error("Failed to update display name. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatSol = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(3);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[550px] bg-gradient-to-b from-indigo-950/98 to-slate-950/98 backdrop-blur-md border border-indigo-500/40">
        {/* Custom close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-white hover:text-yellow-400 transition-colors border-2 border-white/50 hover:border-yellow-400 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader>
          <DialogTitle className="text-indigo-100 flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Settings
          </DialogTitle>
          <DialogDescription className="text-indigo-300/80">
            Customize your display name.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-indigo-300 text-lg">
              Display Name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="bg-black/30 border-indigo-500/40 text-indigo-100 text-lg placeholder:text-indigo-600 focus:outline-none focus:border-indigo-400"
              maxLength={20}
              minLength={3}
              required
            />
            <p className="text-sm text-indigo-400/70">
              3-20 characters. This will be shown in the game.
            </p>
          </div>

          {/* Recent Games Header with Stats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-indigo-100 text-2xl font-semibold">Recent Games</Label>
              <div className="flex items-center gap-4 text-lg">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-5 h-5 text-green-400" />
                  <span className="text-green-300 font-bold text-xl">{totalWins}</span>
                  <span className="text-indigo-400">wins</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-red-300 font-bold text-xl">{totalLosses}</span>
                  <span className="text-indigo-400">losses</span>
                </div>
              </div>
            </div>
            <div className="bg-black/30 rounded-md border border-indigo-500/40 max-h-[250px] overflow-y-auto">
              {recentGames === undefined ? (
                <div className="text-center py-4 text-indigo-400/60 text-lg">Loading...</div>
              ) : recentGames.length === 0 ? (
                <div className="text-center py-4 text-indigo-400/60 text-lg">No games played yet</div>
              ) : (
                <div className="divide-y divide-indigo-500/20">
                  {recentGames.map((game) => (
                    <div
                      key={game.roundId}
                      className={`px-3 py-2 flex items-center justify-between ${
                        game.isWinner ? "bg-green-900/20" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-bold px-2 py-0.5 rounded ${
                          game.isWinner
                            ? "bg-green-500/30 text-green-300"
                            : "bg-red-500/30 text-red-300"
                        }`}>
                          {game.isWinner ? "WIN" : "LOSS"}
                        </span>
                        <span className="text-base text-indigo-400">
                          {formatTimestamp(game.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-base">
                        <span className="text-indigo-300">
                          {game.playerCount} players
                        </span>
                        <span className="text-indigo-100 font-semibold text-lg">
                          {game.isWinner ? "+" : "-"}{formatSol(game.isWinner ? game.prizeWon : game.playerBetAmount)} SOL
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={isUpdating}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
