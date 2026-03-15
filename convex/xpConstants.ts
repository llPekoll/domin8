/**
 * XP System Constants and Helper Functions
 * Defines level thresholds, XP rewards, and utility functions for the leveling system
 */

// XP Awards for different actions
export const XP_REWARDS = {
  DAILY_LOGIN: 25, // +25 XP just for connecting wallet each day
  PLACE_BET: 10, // +10 XP per bet placed
  WIN_GAME: 100, // +100 XP for winning
  WIN_STREAK_BONUS: 25, // +25 XP per consecutive win (capped at 5)
  DAILY_FIRST_BET: 50, // +50 XP for first bet of the day
  BET_AMOUNT_MULTIPLIER: 1, // +1 XP per 0.01 SOL bet
} as const;

// Level thresholds - exponential curve
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
export const MAX_WIN_STREAK_BONUS = 5; // Cap streak bonus at 5x

/**
 * Calculate level from total XP
 */
export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      return LEVEL_THRESHOLDS[i].level;
    }
  }
  return 1;
}

/**
 * Get level info (title, xp threshold) for a given level
 */
export function getLevelInfo(level: number): {
  level: number;
  xp: number;
  title: string;
} {
  const info = LEVEL_THRESHOLDS.find((l) => l.level === level);
  return info || LEVEL_THRESHOLDS[0];
}

/**
 * Get XP progress info for the current level
 * Returns current threshold, next threshold, and progress percentage
 */
export function getXpProgressInfo(currentXp: number): {
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
  xpToNextLevel: number;
} {
  const currentLevel = calculateLevel(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel)!;
  const nextThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel + 1);

  // Max level reached
  if (!nextThreshold) {
    return {
      currentLevelXp: currentThreshold.xp,
      nextLevelXp: currentThreshold.xp,
      progress: 100,
      xpToNextLevel: 0,
    };
  }

  const xpIntoLevel = currentXp - currentThreshold.xp;
  const xpNeededForNext = nextThreshold.xp - currentThreshold.xp;
  const progress = Math.floor((xpIntoLevel / xpNeededForNext) * 100);

  return {
    currentLevelXp: currentThreshold.xp,
    nextLevelXp: nextThreshold.xp,
    progress,
    xpToNextLevel: nextThreshold.xp - currentXp,
  };
}

/**
 * Calculate XP bonus for bet amount
 * +1 XP per 0.01 SOL bet
 */
export function calculateBetAmountXp(betAmountLamports: number): number {
  const betSol = betAmountLamports / 1_000_000_000; // Convert lamports to SOL
  return Math.floor(betSol / 0.01) * XP_REWARDS.BET_AMOUNT_MULTIPLIER;
}

/**
 * Calculate streak bonus XP (capped at 5 streak)
 */
export function calculateStreakBonusXp(streak: number): number {
  const cappedStreak = Math.min(streak, MAX_WIN_STREAK_BONUS);
  return cappedStreak * XP_REWARDS.WIN_STREAK_BONUS;
}

/**
 * Get today's date string in ISO format (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}
