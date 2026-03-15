/**
 * XP System Utilities for Frontend
 * Mirrors the level thresholds from convex/xpConstants.ts
 */

// Level thresholds - must match backend
export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: "Newcomer" },
  { level: 2, xp: 500, title: "Challenger" },
  { level: 3, xp: 1500, title: "Contender" },
  { level: 4, xp: 3500, title: "Fighter" },
  { level: 5, xp: 7000, title: "Warrior" },
  { level: 6, xp: 12000, title: "Champion" },
  { level: 7, xp: 20000, title: "Elite" },
  { level: 8, xp: 35000, title: "Master" },
  { level: 9, xp: 60000, title: "Legend" },
  { level: 10, xp: 100000, title: "Dominator" },
] as const;

export const MAX_LEVEL = 10;

/**
 * Get XP progress info for the current level
 * Returns current threshold, next threshold, and progress percentage
 */
export function getXpProgressInfo(currentXp: number, currentLevel: number): {
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNextLevel: number;
  xpIntoLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
} {
  const currentThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel);
  const nextThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel + 1);

  if (!currentThreshold) {
    return {
      currentLevelXp: 0,
      nextLevelXp: 500,
      progress: 0,
      xpToNextLevel: 500,
      xpIntoLevel: 0,
      levelTitle: "Newcomer",
      nextLevelTitle: "Challenger",
    };
  }

  // Max level reached
  if (!nextThreshold) {
    return {
      currentLevelXp: currentThreshold.xp,
      nextLevelXp: currentThreshold.xp,
      progress: 100,
      xpToNextLevel: 0,
      xpIntoLevel: currentXp - currentThreshold.xp,
      levelTitle: currentThreshold.title,
      nextLevelTitle: null,
    };
  }

  const xpIntoLevel = currentXp - currentThreshold.xp;
  const xpNeededForNext = nextThreshold.xp - currentThreshold.xp;
  const progress = Math.min(100, Math.floor((xpIntoLevel / xpNeededForNext) * 100));

  return {
    currentLevelXp: currentThreshold.xp,
    nextLevelXp: nextThreshold.xp,
    progress,
    xpToNextLevel: nextThreshold.xp - currentXp,
    xpIntoLevel,
    levelTitle: currentThreshold.title,
    nextLevelTitle: nextThreshold.title,
  };
}
