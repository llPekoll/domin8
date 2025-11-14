import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent } from "./ui/card";
import { WinnerCharacterPreviewScene } from "./WinnerCharacterPreviewScene";
import { useMemo } from "react";

export function LastWinnerCard() {
  const lastFinishedGame = useQuery(api.stats.getLastFinishedGame);

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
    <div className="-mr-7">
      <Card className="bg-black/60 pt-2 backdrop-blur-md border-purple-500/50 shadow-xl shadow-purple-500/20 w-80">
        <CardContent className=" space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-purple-400 text-2xl uppercase tracking-wider font-semibold flex ">
              Last Winner
            </h3>
            <div className="flex items-center gap-2">
              <img
                src="/sol-logo.svg"
                alt="SOL"
                className="w-5 h-5"
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(77%) sepia(26%) saturate(444%) hue-rotate(213deg) brightness(95%) contrast(92%)",
                }}
              />
              <span className="text-purple-300 text-3xl font-bold">
                {lastFinishedGame.prizeAmount.toFixed(3)}
              </span>
            </div>
          </div>

          {/* Winner Info */}
          <div className="mt-7 flex items-center  bg-purple-900/20 rounded-lg  border border-purple-500/30">
            {/* Character Avatar with Phaser Animation */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <WinnerCharacterPreviewScene
                characterName={lastFinishedGame.characterName}
                width={128}
                height={128}
              />
            </div>

            {/* Winner Details - Name and Bet */}
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-xl truncate">{displayName}</div>
              <div className="text-white/50 text-lg flex items-center gap-1 -mt-2">
                <span>Bet:</span>
                <img
                  src="/sol-logo.svg"
                  alt="SOL"
                  className="w-2 h-2"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(100%) sepia(0%) saturate(0%) hue-rotate(93deg) brightness(103%) contrast(103%) opacity(0.5)",
                  }}
                />
                <span>{lastFinishedGame.betAmount.toFixed(3)}</span>
              </div>
            </div>

            {/* Stats - Vertical Layout */}
            <div className="flex flex-col gap-2 text-right pr-3">
              <div>
                <div className="text-white/50 text-xs">Total Pot</div>
                <div className="text-purple-300 -mt-2 font-semibold text-xl flex items-center justify-end gap-1">
                  <img
                    src="/sol-logo.svg"
                    alt="SOL"
                    className="w-3 h-3"
                    style={{
                      filter:
                        "brightness(0) saturate(100%) invert(77%) sepia(26%) saturate(444%) hue-rotate(213deg) brightness(95%) contrast(92%)",
                    }}
                  />
                  <span>{lastFinishedGame.totalPot.toFixed(3)}</span>
                </div>
              </div>
              <div>
                <div className="text-white/50 text-xs">Win Rate</div>
                <div className="text-purple-300 -mt-2 font-semibold text-xl">
                  {((lastFinishedGame.betAmount / lastFinishedGame.totalPot) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
        </CardContent>
      </Card>
      <p className="text-white/60 text-lg flex justify-end mr-6">
        Round #{lastFinishedGame.roundId}
      </p>
    </div>
  );
}
