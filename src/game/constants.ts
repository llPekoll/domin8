/**
 * Game Constants
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *                              GAME LOOP TIMING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a continuous loop - no demo mode:
 *
 *  1. MAP_CAROUSEL (IDLE) → Rolling backgrounds, waiting for game creation
 *  2. INSERT_COIN (status=2) → Game created, waiting for first bet
 *  3. WAITING (status=0) → First bet placed, BETTING_COUNTDOWN countdown
 *  4. VRF_PENDING → Countdown ended, waiting for winner
 *  5. FIGHTING → BATTLE_DURATION battle animations
 *  6. CELEBRATING → CELEBRATION_DURATION winner celebration
 *  7. CLEANUP → CLEANUP_DURATION fade, back to MapCarousel
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Game loop timing constants (in milliseconds)
export const GAME_TIMING = {
  /** Betting countdown duration - 60 seconds (set on blockchain) */
  BETTING_COUNTDOWN: 60_000,

  /** Battle animation duration - 2 seconds */
  BATTLE_DURATION: 2_000,

  /** Winner celebration duration - 10 seconds */
  CELEBRATION_DURATION: 10_000,

  /** Cleanup/fade duration - 1 second */
  CLEANUP_DURATION: 1_000,
  MAP_CAROUSEL: 5_000,

  // /** Delay before creating next game after prize sent - 20 seconds (backend) */
  NEXT_GAME_DELAY: 20_000,
} as const;

// Game status constants (matching smart contract constants.rs)
export const GAME_STATUS = {
  /** First bet placed, countdown started */
  OPEN: 0,
  /** Game ended, winner selected */
  CLOSED: 1,
  /** Game created by backend, no bets yet */
  WAITING: 2,
} as const;

// Blockchain timing constants
export const BLOCKCHAIN_TIMING = {
  /** Buffer for blockchain clock drift - 1 second */
  CLOCK_BUFFER: 1_000,

  /** Cron check interval - 40 seconds (backend) */
  CRON_INTERVAL: 40_000,

  /** Delay before sending prize after end_game - 2 seconds (backend) */
  SEND_PRIZE_DELAY: 2_000,
} as const;
