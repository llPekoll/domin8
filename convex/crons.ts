/**
 * Convex Cron Jobs for Domin8 Game Management
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *                         SCHEDULING ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PRIMARY: 60-second Cron (syncService.checkAndEndOpenGames)
 * - Polls blockchain via SolanaClient.getActiveGame()
 * - When OPEN game detected → schedules precise job chain:
 *   - end_game at endTimestamp + 1s
 *   - send_prize at endTimestamp + 5s
 *   - create_game at endTimestamp + 19s
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *                              GAME LOOP FLOW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  1. MAP CAROUSEL → 2. INSERT COIN (WAITING) → 3. BETTING (OPEN)
 *       ↑                                              ↓
 *       └──── 7. CLEANUP ← 6. CELEBRATION ← 5. FIGHTING ← 4. END GAME (CLOSED)
 *
 * Timing: 60s betting + 1s end_game + 4s send_prize + 18s create_game = ~83s cycle
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * MAIN GAME LOOP CRON - Primary scheduler for game progression
 *
 * Runs every 60 seconds to:
 * 1. Check if active game has bets and needs job scheduling
 * 2. Schedule precise jobs via runAfter() for end_game, send_prize, create_game
 * 3. Handle recovery for any missed/failed jobs
 *
 * When a game is OPEN with endTimestamp set, schedules jobs at exact times.
 * This is simpler and more reliable than webhook-driven scheduling.
 */
crons.interval(
  "game-loop-scheduler",
  { seconds: 50 },
  internal.syncService.checkAndEndOpenGames
);


crons.interval(
  "sync-1v1-stuck-lobbies",
  { seconds: 30 },
  internal.lobbiesActions.syncLobbyFromBlockchain
)
/**
 * Scheduled jobs cleanup - removes old completed/failed jobs
 * Runs every 6 hours to clean up jobs older than 7 days
 */
crons.interval(
  "cleanup-old-scheduled-jobs",
  { hours: 6 },
  internal.gameSchedulerMutations.cleanupOldJobs
);

/**
 * NFT Collection Holder Scanning - Pre-cache ALL holders of each collection
 * Runs every 12 hours to scan complete holder lists for instant verification
 *
 * Benefits:
 * - Instant NFT verification (no API calls during character selection)
 * - Massive API savings (one comprehensive scan vs thousands of individual checks)
 * - Better UX (no loading spinners for NFT-gated characters)
 *
 * Backup: Manual refresh button for users (rate-limited every 5 minutes)
 */
crons.interval(
  "scan-nft-collection-holders",
  { hours: 12 },
  internal.nftHolderScanner.scanAllCollectionHolders
);

/**
 * BOT EXECUTOR - Automated betting for users with active bots
 *
 * Runs every 30 seconds to:
 * 1. Get all active bots with session signers enabled
 * 2. Check if a game is currently open for betting
 * 3. Evaluate each bot's strategy and conditions (budget, stop-loss, schedule, etc.)
 * 4. Place bets automatically via Privy session signers
 *
 * Note: Bots only place bets when:
 * - Bot is active AND session signer is enabled
 * - Game is OPEN (status = 0) with time remaining
 * - Budget limits and strategy conditions are met
 * - Bot hasn't already bet this round
 */
crons.interval(
  "bot-executor",
  { seconds: 15 },
  internal.botExecutor.executeBots
);

/**
 * CHOP BOT DETECTION - Daily analysis of solo mode input patterns
 *
 * Runs once per day to:
 * 1. Analyze all solo sessions from last 24 hours
 * 2. Flag suspicious patterns (inhuman timing, perfect consistency)
 * 3. Store flags for admin review
 *
 * Detection signals:
 * - Reaction times < 80ms (human minimum ~80ms)
 * - Very low timing variance (bots are unnaturally consistent)
 * - High ratio of "perfect" timing between chops
 */
crons.daily(
  "chop-bot-detection",
  { hourUTC: 4, minuteUTC: 0 }, // Run at 4:00 AM UTC daily
  internal.chopBotDetection.analyzeRecentSessions
);

/**
 * CHOP WEEKLY JACKPOT - Saturday midnight UTC snapshot
 *
 * Runs every Saturday at 00:00 UTC to:
 * 1. End the current week's jackpot
 * 2. Snapshot the leaderboard (top 20 players)
 * 3. Create new jackpot for the upcoming week
 *
 * Payouts are done manually by admin after validation.
 */
crons.weekly(
  "chop-jackpot-weekly-snapshot",
  { dayOfWeek: "saturday", hourUTC: 0, minuteUTC: 0 },
  internal.chopJackpot.endWeekAndSnapshot
);

export default crons;
