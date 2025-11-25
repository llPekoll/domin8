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
 * Runs every 10 seconds (matches risk.fun worker pattern)
 *
 * Functionality:
 * 1. Fetches active game from blockchain (getActiveGame)
 * 2. Syncs to Convex database
 * 3. Schedules endGame action when game expires
 */
// crons.interval("sync-blockchain-state", { seconds: 45 }, internal.syncService.syncBlockchainState);

/**
 * 1v1 Lobby Recovery - Reconciles stuck lobbies
 * Runs every 30 seconds as a backup safety net
 * Checks for lobbies that are stuck in status 0 or have discrepancies between
 * on-chain and Convex state, and attempts to sync them
 * NOTE: Uncomment after Convex regenerates the API with lobbies module
 */
// crons.interval(
//   "sync-1v1-stuck-lobbies",
//   { seconds: 30 },
//   internal.lobbies.syncLobbyFromBlockchain
// );

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
 * Game cleanup - removes old game accounts (2+ days old)
 * Runs every 2 days to delete old PDAs and recover rent
 *
 * Benefits:
 * - Recovers rent from closed game accounts (~0.01-0.05 SOL per game)
 * - Keeps blockchain storage clean
 * - Net profit: Rent recovered > transaction fees
 */
// crons.interval(
//   "cleanup-old-games",
//   { hours: 48 }, // Every 2 days
//   internal.cleanupService.cleanupOldGames
// );

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

export default crons;
