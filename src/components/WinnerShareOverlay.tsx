/**
 * Winner Share Overlay
 * Shows a Twitter share button when a winner is crowned
 */

import { useState, useEffect } from "react";
import { EventBus } from "../game/EventBus";
import { Share2 } from "lucide-react";

interface WinnerData {
  isCurrentUser: boolean;
  displayName: string;
  prize: string;
}

export function WinnerShareOverlay() {
  const [winnerData, setWinnerData] = useState<WinnerData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleShowWinnerShare = (data: WinnerData) => {
      console.log("🎉 [WinnerShareOverlay] Received winner share event", data);
      setWinnerData(data);

      // Delay showing the overlay by 3 seconds
      const showTimer = setTimeout(() => {
        console.log("🎉 [WinnerShareOverlay] Showing winner share after 3s delay");
        setIsVisible(true);
      }, 3000);

      // Auto-hide after 7 seconds total (3s delay + 4s shown)
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 7000);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    };

    EventBus.on("show-winner-share", handleShowWinnerShare);

    return () => {
      EventBus.off("show-winner-share", handleShowWinnerShare);
    };
  }, []);

  const shareOnX = () => {
    if (!winnerData) return;

    const gameUrl = window.location.origin;

    // Personalize message based on if it's the current user
    const tweetText = winnerData.isCurrentUser
      ? `🏆 I just won ${winnerData.prize} SOL in Domin8!

Think you can beat me? Join the battle now! 👑

${gameUrl}

#Domin8 #Solana #Web3Gaming`
      : `🏆 ${winnerData.displayName} just won ${winnerData.prize} SOL in Domin8!

Think you can be the next champion? Join the battle now! 👑

${gameUrl}

#Domin8 #Solana #Web3Gaming`;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, "_blank", "width=550,height=420");
  };

  if (!isVisible || !winnerData) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      <div className="pointer-events-auto">
        <button
          onClick={shareOnX}
          className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg transition-all text-lg font-bold shadow-2xl shadow-purple-500/50 animate-bounce"
          style={{
            fontFamily: "metal-slug",
          }}
        >
          <Share2 className="w-6 h-6" />
          SHARE ON X!
        </button>
      </div>
    </div>
  );
}
