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
      console.log("🎉 [WinnerShareOverlay] Showing winner share", data);
      setWinnerData(data);
      setIsVisible(true);

      // Auto-hide after 4 seconds (matches "Restarting in 4s...")
      setTimeout(() => {
        setIsVisible(false);
      }, 4000);
    };

    EventBus.on("show-winner-share", handleShowWinnerShare);

    return () => {
      EventBus.off("show-winner-share", handleShowWinnerShare);
    };
  }, []);

  const shareOnX = () => {
    if (!winnerData) return;

    const gameUrl = window.location.origin;
    const tweetText = `🏆 ${winnerData.displayName} just won ${winnerData.prize} SOL in Domin8!

Think you can be the next champion? Join the battle now! 👑

${gameUrl}

#Domin8 #Solana #Web3Gaming`;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, "_blank", "width=550,height=420");
  };

  if (!isVisible || !winnerData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto">
        <button
          onClick={shareOnX}
          className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg transition-all text-lg font-bold shadow-2xl shadow-purple-500/50 animate-bounce"
          style={{
            fontFamily: "metal-slug",
            textShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
          <Share2 className="w-6 h-6" />
          SHARE ON X!
        </button>
      </div>
    </div>
  );
}
