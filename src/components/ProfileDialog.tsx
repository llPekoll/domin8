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
import { User, Copy, Check, Share2, Trophy, Coins } from "lucide-react";
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
  const [isCopied, setIsCopied] = useState(false);

  const updateDisplayName = useMutation(api.players.updateDisplayName);

  // Fetch player stats from game history
  const playerStats = useQuery(
    api.players.getPlayerStatsFromHistory,
    { walletAddress }
  );

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

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsCopied(true);
      toast.success("Wallet address copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      logger.ui.error("Failed to copy address:", error);
      toast.error("Failed to copy address");
    }
  };

  const handleShareOnX = () => {
    const gameUrl = window.location.origin;
    const tweetText = `Join me in Royal Rumble! 🎮👑

    Battle for glory and SOL prizes in this epic Web3 arena game on Solana!
    
    Check it out here: ${gameUrl}

    #RoyalRumble #Solana #Web3Gaming #PlayToEarn`;
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[425px] bg-gradient-to-b from-amber-900/95 to-amber-950/95 backdrop-blur-sm border-2 border-amber-600/60">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-amber-100 flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Settings
            </DialogTitle>
            <button
              onClick={handleShareOnX}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg transition-all text-sm font-semibold shadow-lg"
              title="Share game on X"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
          <DialogDescription className="text-amber-300/80">
            Customize your profile settings and display name.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wallet" className="text-amber-300">
              Wallet Address
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-black/30 rounded-md text-amber-400 font-mono text-sm border border-amber-700/50">
                {truncateAddress(walletAddress)}
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => void handleCopyAddress()}
                className="border-amber-700/50 text-amber-300 hover:bg-amber-700/40 bg-amber-800/30 transition-all"
                title="Copy full address"
              >
                {isCopied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Player Stats Section */}
          <div className="space-y-2">
            <Label className="text-amber-300">Game Statistics</Label>
            <div className="grid grid-cols-2 gap-3">
              {/* Total Wins */}
              <div className="px-3 py-3 bg-black/30 rounded-md border border-amber-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-amber-400/80">Total Wins</span>
                </div>
                <div className="text-xl font-bold text-amber-100">
                  {playerStats ? playerStats.totalWins : "..."}
                </div>
              </div>

              {/* Total Winnings */}
              <div className="px-3 py-3 bg-black/30 rounded-md border border-amber-700/50">
                <div className="flex items-center gap-2 mb-1">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-amber-400/80">Total Winnings</span>
                </div>
                <div className="text-xl font-bold text-amber-100 flex items-center gap-1">
                  {playerStats ? (
                    <>
                      <img
                        src="/sol-logo.svg"
                        alt="SOL"
                        className="w-4 h-4"
                        style={{
                          filter:
                            "brightness(0) saturate(100%) invert(81%) sepia(13%) saturate(891%) hue-rotate(196deg) brightness(95%) contrast(92%)",
                        }}
                      />
                      {playerStats.totalWinningsSOL.toFixed(4)}
                    </>
                  ) : (
                    "..."
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-amber-300">
              Display Name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="bg-black/30 border-amber-700/50 text-amber-100 placeholder:text-amber-600 focus:outline-none focus:border-amber-500"
              maxLength={20}
              minLength={3}
              required
            />
            <p className="text-xs text-amber-400/70">
              3-20 characters. This will be shown in the game.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-amber-600/50 text-amber-300 hover:bg-amber-700/40 bg-amber-800/30"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUpdating}
              className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
