import { useEffect, useState, useCallback } from "react";
import { EventBus } from "../game/EventBus";

interface LevelUpEvent {
  newLevel: number;
  levelTitle: string;
}

export function LevelUpNotification() {
  const [notification, setNotification] = useState<LevelUpEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const handleLevelUp = useCallback((event: LevelUpEvent) => {
    setNotification(event);
    setIsVisible(true);

    // Auto-hide after 4 seconds
    setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => setNotification(null), 500); // Allow fade animation
    }, 4000);
  }, []);

  useEffect(() => {
    EventBus.on("level-up", handleLevelUp);
    return () => {
      EventBus.off("level-up", handleLevelUp);
    };
  }, [handleLevelUp]);

  if (!notification) return null;

  return (
    <div
      className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]
        transition-all duration-500 pointer-events-none
        ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
    >
      <div
        className="bg-gradient-to-br from-indigo-900/95 to-purple-900/95
        backdrop-blur-md border-2 border-yellow-400 rounded-2xl p-6 text-center
        shadow-[0_0_60px_rgba(234,179,8,0.4)] animate-pulse"
      >
        {/* Sparkle icon */}
        <div className="text-4xl mb-2 animate-bounce">&#10024;</div>

        <h2 className="text-2xl font-bold text-yellow-400 mb-2 tracking-wide">LEVEL UP!</h2>

        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-yellow-400 text-xl">&#9733;</span>
          <span className="text-4xl font-bold text-white">{notification.newLevel}</span>
          <span className="text-yellow-400 text-xl">&#9733;</span>
        </div>

        <p className="text-lg text-indigo-200 font-medium">{notification.levelTitle}</p>
      </div>
    </div>
  );
}
