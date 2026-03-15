/**
 * XP System Constants and Helper Functions
 */

export const XP_REWARDS = {
  DAILY_LOGIN: 25,
  PLACE_BET: 10,
  WIN_GAME: 100,
  WIN_STREAK_BONUS: 25,
  DAILY_FIRST_BET: 50,
  BET_AMOUNT_MULTIPLIER: 1,
} as const;

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
export const MAX_WIN_STREAK_BONUS = 5;

export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      return LEVEL_THRESHOLDS[i].level;
    }
  }
  return 1;
}

export function getLevelInfo(level: number) {
  const info = LEVEL_THRESHOLDS.find((l) => l.level === level);
  return info || LEVEL_THRESHOLDS[0];
}

export function getXpProgressInfo(currentXp: number) {
  const currentLevel = calculateLevel(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel)!;
  const nextThreshold = LEVEL_THRESHOLDS.find((l) => l.level === currentLevel + 1);

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

export function calculateBetAmountXp(betAmountLamports: number): number {
  const betSol = betAmountLamports / 1_000_000_000;
  return Math.floor(betSol / 0.01) * XP_REWARDS.BET_AMOUNT_MULTIPLIER;
}

export function calculateStreakBonusXp(streak: number): number {
  const cappedStreak = Math.min(streak, MAX_WIN_STREAK_BONUS);
  return cappedStreak * XP_REWARDS.WIN_STREAK_BONUS;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}
