import { useSocket, socketRequest } from "../lib/socket";
import { Card, CardContent } from "./ui/card";
import { SpriteAnimator } from "./SpriteAnimator";
import { useAssets } from "../contexts/AssetsContext";
import { useState, useEffect, useMemo } from "react";
import { isMobile, isTablet } from "react-device-detect";

// function PlatformStats() {
//   const stats = useQuery(api.stats.getPlatformStats);
//   if (!stats) return null;
//
//   const tvl = stats.tvlSOL + 40;
//   const gain = stats.earningsSOL + 2;
//
//   return (
//     <p className="text-white/60 text-lg flex justify-end gap-4">
//       <span>
//         Volume <span className="text-purple-300">+{tvl.toFixed(1)}</span>
//       </span>
//       <span>
//         Gain <span className="text-green-300">+{gain.toFixed(1)}</span>
//       </span>
//     </p>
//   );
// }

export function LastWinnerCard() {
  const { socket } = useSocket();
  const { characters } = useAssets();

  // Fetch last finished game via socket
  const [lastFinishedGame, setLastFinishedGame] = useState<any>(null);
  useEffect(() => {
    if (!socket) return;
    socketRequest(socket, "get-last-finished-game").then((res) => {
      if (res.success) setLastFinishedGame(res.data);
    });
  }, [socket]);

  // Get display name for the winner via socket
  const [playerInfo, setPlayerInfo] = useState<any>(null);
  useEffect(() => {
    if (!socket || !lastFinishedGame?.winnerAddress) return;
    socketRequest(socket, "get-player", { walletAddress: lastFinishedGame.winnerAddress }).then((res) => {
      if (res.success) setPlayerInfo(res.data);
    });
  }, [socket, lastFinishedGame?.winnerAddress]);

  // Find character data by name to get assetPath
  const characterData = useMemo(() => {
    if (!lastFinishedGame?.characterName || !characters) return null;
    return characters.find(
      (char: { name: string }) =>
        char.name.toLowerCase() === lastFinishedGame.characterName.toLowerCase()
    );
  }, [lastFinishedGame?.characterName, characters]);

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

  // Don't show on mobile/tablet devices
  if (isMobile || isTablet) {
    return null;
  }

  // Don't show if no winner data
  if (!lastFinishedGame) {
    return null;
  }

  return (
    <div className="-mr-7">
      <Card className="bg-black/60 pt-2 backdrop-blur-md border-purple-500/50 shadow-xl shadow-purple-500/20 w-64">
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
            {/* Character Avatar */}
            <div className="relative w-20 h-20 shrink-0">
              {characterData && (
                <SpriteAnimator
                  assetPath={characterData.assetPath}
                  animation="idle"
                  size={80}
                  scale={3}
                  offsetY={35}
                />
              )}
            </div>

            {/* Winner Details - Name and Bet */}
            <div className="flex-1 min-w-0 pr-2">
              {/* Win Rate above player name */}
              <div className="flex flex-col items-end">
                <span className="text-white/50 text-xs pt-1">Win Rate</span>
                <span className="text-purple-300 font-semibold text-sm -mt-1.5 ">
                  {((lastFinishedGame.betAmount / lastFinishedGame.totalPot) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="text-white font-bold text-xl truncate text-right">{displayName}</div>
              <div className="text-white/50 text-lg flex items-center justify-end gap-1 -mt-2">
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
          </div>

          {/* Stats Row */}
        </CardContent>
      </Card>
      <div className="mr-6 -space-y-1">
        {/* <PlatformStats /> */}
        <p className="text-white/60 text-lg flex justify-end">Round #{lastFinishedGame.roundId}</p>
      </div>
    </div>
  );
}
