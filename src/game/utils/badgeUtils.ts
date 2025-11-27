/**
 * Badge System Utility (Puyo Puyo style stacking)
 *
 * Badge progression (base-5 system):
 * - 5 lvl1 badges = 1 lvl2 badge
 * - 5 lvl2 badges = 1 lvl3 badge
 * - 5 lvl3 badges = 1 lvl4 badge
 *
 * Example:
 * - 3 wins = 3 lvl1 badges
 * - 8 wins = 1 lvl2 + 3 lvl1 badges
 * - 27 wins = 1 lvl3 + 0 lvl2 + 2 lvl1 badges
 */

export interface BadgeDisplay {
  lvl1: number; // 0-4 lvl1 badges to show
  lvl2: number; // 0-4 lvl2 badges to show
  lvl3: number; // 0-4 lvl3 badges to show
  lvl4: number; // 0+ lvl4 badges to show
}

/**
 * Calculate badge display from total wins (base-5 decomposition)
 * @param totalWins - Total number of wins
 * @returns BadgeDisplay with count at each level
 */
export function calculateBadges(totalWins: number): BadgeDisplay {
  if (totalWins <= 0) {
    return { lvl1: 0, lvl2: 0, lvl3: 0, lvl4: 0 };
  }

  let remaining = totalWins;

  // lvl4: each = 125 wins (5^3)
  const lvl4 = Math.floor(remaining / 125);
  remaining = remaining % 125;

  // lvl3: each = 25 wins (5^2)
  const lvl3 = Math.floor(remaining / 25);
  remaining = remaining % 25;

  // lvl2: each = 5 wins (5^1)
  const lvl2 = Math.floor(remaining / 5);
  remaining = remaining % 5;

  // lvl1: remaining wins (5^0)
  const lvl1 = remaining;

  return { lvl1, lvl2, lvl3, lvl4 };
}

/**
 * Get texture keys for badges to display
 * Returns array of texture keys in order (lvl4 first, then lvl3, etc.)
 * Uses stacked badge images when available (e.g., badge-lvl1-3 shows 3 lvl1 badges)
 */
export function getBadgeTextureKeys(badges: BadgeDisplay): string[] {
  const keys: string[] = [];

  // lvl4 badges (only have 1 variant, show multiple if needed)
  for (let i = 0; i < badges.lvl4; i++) {
    keys.push("badge-lvl4-1");
  }

  // lvl3 badges (only have 1 variant)
  for (let i = 0; i < badges.lvl3; i++) {
    keys.push("badge-lvl3-1");
  }

  // lvl2 badges - use stacked images (lvl2-1 through lvl2-4)
  if (badges.lvl2 > 0) {
    const variant = Math.min(badges.lvl2, 4);
    keys.push(`badge-lvl2-${variant}`);
  }

  // lvl1 badges - use stacked images (lvl1-1 through lvl1-3)
  if (badges.lvl1 > 0) {
    const variant = Math.min(badges.lvl1, 3);
    keys.push(`badge-lvl1-${variant}`);
  }

  return keys;
}

/**
 * Get badge scale based on level
 */
export function getBadgeScale(level: number): number {
  switch (level) {
    case 1: return 0.12;
    case 2: return 0.14;
    case 3: return 0.16;
    case 4: return 0.18;
    default: return 0.12;
  }
}

/**
 * Get level from texture key
 */
export function getLevelFromKey(key: string): number {
  if (key.includes("lvl4")) return 4;
  if (key.includes("lvl3")) return 3;
  if (key.includes("lvl2")) return 2;
  return 1;
}
