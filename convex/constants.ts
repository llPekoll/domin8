/**
 * Convex Backend Constants
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *                              GAME LOOP TIMING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a continuous loop - no demo mode:
 *
 *  1. MAP_CAROUSEL → Rolling backgrounds, waiting for game creation
 *  2. INSERT_COIN (status=2) → Game created, waiting for first bet
 *  3. BETTING (status=0) → First bet placed, BETTING_COUNTDOWN countdown
 *  4. END_GAME → Cron calls end_game instruction
 *  5. SEND_PRIZE → Prize sent to winner after SEND_PRIZE_DELAY
 *  6. CREATE_NEXT_GAME → New game created after CREATE_GAME_DELAY
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Game loop timing constants (in milliseconds unless noted)
export const GAME_TIMING = {
  /** Cron check interval - primary scheduler (matches betting round duration) */
  CRON_INTERVAL: 60_000, // 60 seconds

  /** Buffer after endTimestamp before calling end_game */
  END_GAME_BUFFER: 1_000, // 1 second

  /** Delay before sending prize after end_game */
  SEND_PRIZE_DELAY: 4_000, // 4 seconds after end_game

  /** Delay before creating next game after send_prize */
  CREATE_GAME_DELAY: 14_000, // 14 seconds after send_prize

  /** Buffer for blockchain clock drift (in seconds, not ms) */
  BLOCKCHAIN_CLOCK_BUFFER: 1, // 1 second
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

// Scheduled job actions
export const JOB_ACTIONS = {
  END_GAME: "end_game",
  SEND_PRIZE: "send_prize",
  CREATE_GAME: "create_game",
} as const;
