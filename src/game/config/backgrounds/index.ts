import { BackgroundConfig } from "./types";
import { bg1 } from "./bg1";
import { bg2 } from "./bg2";

/**
 * Load background configuration by ID
 * Each background is defined in its own file (bg1.ts, bg2.ts, etc.)
 */
export function loadBackgroundConfig(id: number): BackgroundConfig | null {
  switch (id) {
    case 1:
      return bg1;
    case 2:
      return bg2;
    // Add more cases as you create more background files
    default:
      console.error(`[BackgroundLoader] Unknown background ID: ${id}`);
      return null;
  }
}

// Re-export types for convenience
export type { BackgroundConfig, BackgroundAnimation, BackgroundClickable } from "./types";
