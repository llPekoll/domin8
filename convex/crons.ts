/**
 * Convex Cron Jobs for Domin8 Game Management (Risk-based Architecture)
 *
 * Scheduled functions for periodic maintenance tasks.
 * Uses simple polling pattern from risk.fun worker (proven, reliable).
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * PRIMARY SYNC SERVICE - Syncs blockchain state to Convex database
 * Runs every 5 seconds (matches risk.fun worker pattern)
 *
 * Functionality:
 * 1. Fetches active game from blockchain (getActiveGame)
 * 2. Syncs to Convex database
 * 3. Schedules endGame action when game expires
 */
crons.interval(
  "sync-blockchain-state",
  { seconds: 5 },
  internal.syncService.syncBlockchainState
);

/**
 * Game recovery - self-healing system that catches unsent prizes
 * Runs every 30 seconds to check for finished games with unclaimed prizes
 * TODO: Implement recoverUnsentPrizes function in syncService.ts
 */
// crons.interval(
//   "recover-unsent-prizes",
//   { seconds: 30 },
//   internal.syncService.recoverUnsentPrizes
// );

/**
 * Transaction cleanup - removes 7-day old transactions
 */
// TODO LATER: priority low

/**
 * Game cleanup - removes old completed games
 */
// TODO LATER: priority low

/**
 * Scheduled jobs cleanup - removes old completed/failed jobs (safety net)
 * Runs every 6 hours to clean up jobs older than 7 days
 * Note: Jobs should be marked completed/failed immediately by the scheduler,
 * but this cron provides a safety net for any edge cases
 */
crons.interval(
  "cleanup-old-scheduled-jobs",
  { hours: 6 },
  internal.gameSchedulerMutations.cleanupOldJobs
);

export default crons;
