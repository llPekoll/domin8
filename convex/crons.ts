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
 * PRIMARY EVENT LISTENER - monitors blockchain for new events (event-driven architecture)
 * Runs every 3 seconds to capture BetPlaced, GameCreated, WinnerSelected events
 * This is the main data ingestion mechanism (replaces PDA polling)
 */
crons.interval(
  "blockchain-event-listener",
  { seconds: 3 },
  internal.blockchainEventListener.listenForEvents
);

/**
 * LEGACY PDA POLLING - captures game round state changes
 * Runs every 5 seconds as fallback/supplement to event listener
 * TODO: Can be removed once event-driven architecture is fully tested
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
