import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent } from "./ui/card";
import { WinnerCharacterPreviewScene } from "./WinnerCharacterPreviewScene";
import { useMemo } from "react";

export function LastWinnerCard() {
  const lastFinishedGame = useQuery(api.stats.getLastFinishedGame);

  // Debug log
  console.log("[LastWinnerCard] Last finished game data:", lastFinishedGame);

  // Get display name for the winner
  const playerInfo = useQuery(
    api.players.getPlayer,
    lastFinishedGame?.winnerAddress ? { walletAddress: lastFinishedGame.winnerAddress } : "skip"
  );

  const displayName = useMemo(() => {
    if (!lastFinishedGame) return null;

    // Use player display name if available, otherwise truncate wallet
    if (playerInfo?.displayName) {
      return playerInfo.displayName;
    }

    // Truncate wallet address (show first 4 and last 4 characters)
    const wallet = lastFinishedGame.winnerAddress;
    if (wallet && wallet.length > 8) {
      return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
    }

    return wallet || "Unknown";
  }, [lastFinishedGame, playerInfo]);

  // Don't show if no winner data
  if (!lastFinishedGame) {
    return null;
  }

  return (
    <div className="fixed top-20 left-4 z-50">
      <Card className="bg-black/60 pt-2 backdrop-blur-md border-purple-500/50 shadow-xl shadow-purple-500/20 w-80">
        <CardContent className=" space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-purple-400 text-2xl uppercase tracking-wider font-semibold flex ">
              Last Winner
            </h3>
            <span className="text-purple-300 text-xl font-bold">
              {lastFinishedGame.prizeAmount.toFixed(3)} SOL
            </span>
          </div>

          {/* Winner Info */}
          <div className="mt-5 flex items-center gap-3 bg-purple-900/20 rounded-lg p-3 border border-purple-500/30">
            {/* Character Avatar with Phaser Animation */}
            <div className="relative w-16 h-16">
              <WinnerCharacterPreviewScene
                characterName={lastFinishedGame.characterName}
                width={128}
                height={128}
              />
            </div>

            {/* Winner Details */}
            <div className="flex flex-col">
              <div className="text-white font-bold text-lg truncate">{displayName}</div>
              <div className="text-white/50 text-xs mt-1">
                Bet: {lastFinishedGame.betAmount.toFixed(3)} SOL
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs bg-black/40 rounded-lg p-2">
                <div className="text-center flex-1">
                  <div className="text-white/50">Total Pot</div>
                  <div className="text-purple-300 font-semibold">
                    {lastFinishedGame.totalPot.toFixed(3)} SOL
                  </div>
                </div>
                <div className="w-px bg-purple-500/30" />
                <div className="text-center flex-1">
                  <div className="text-white/50">Win Rate</div>
                  <div className="text-purple-300 font-semibold">
                    {((lastFinishedGame.betAmount / lastFinishedGame.totalPot) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
        </CardContent>
      </Card>
      <p className="text-white/60 text-lg">Round #{lastFinishedGame.roundId}</p>
    </div>
  );
}
