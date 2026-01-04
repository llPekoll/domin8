import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SoundManager } from "~/game/managers/SoundManager";

/**
 * Handle app lifecycle events (background/foreground)
 * - Pauses sounds when app goes to background
 * - Resumes sounds when app comes back to foreground
 */
export function useAppLifecycle() {
  useEffect(() => {
    // Only set up listeners on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleAppStateChange = App.addListener("appStateChange", (state) => {
      console.log("[AppLifecycle] State changed:", state.isActive ? "foreground" : "background");

      if (state.isActive) {
        // App came to foreground - resume sounds
        SoundManager.resumeAll();
      } else {
        // App went to background - pause sounds
        SoundManager.pauseAll();
      }
    });

    // Also handle when app is paused/resumed (Android specific)
    const handlePause = App.addListener("pause", () => {
      console.log("[AppLifecycle] App paused");
      SoundManager.pauseAll();
    });

    const handleResume = App.addListener("resume", () => {
      console.log("[AppLifecycle] App resumed");
      SoundManager.resumeAll();
    });

    // Cleanup listeners on unmount
    return () => {
      handleAppStateChange.then((listener) => listener.remove());
      handlePause.then((listener) => listener.remove());
      handleResume.then((listener) => listener.remove());
    };
  }, []);
}
