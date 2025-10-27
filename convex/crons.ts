/**
 * Convex Cron Jobs for Domin8 Game Management
 *
 * Scheduled functions for periodic maintenance tasks.
 * Note: Game state progression now uses ctx.scheduler.runAfter() instead of polling.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Event listener - monitors blockchain for new bets and game events
 * Runs every 5 seconds to detect on-chain transactions
 */
crons.interval(
  "blockchain-fetch-round-pdas",
  { seconds: 5 },
  internal.fetchRoundPDAs.fetchRoundPDAs
);

/**
 * Game recovery - self-healing system that catches overdue actions
 * Runs every 30 seconds to check if blockchain is ahead of expected state
 */
// TODO LATER: priority medium

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
