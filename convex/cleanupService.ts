/**
 * Cleanup Service - Automated cleanup of old game accounts
 *
 * Closes old game PDAs (older than 2 days) to recover rent
 * Runs every 2 days via cron
 */
"use node";
import { internalAction } from "./_generated/server";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY;

// Constants
const GAMES_TO_KEEP = 50; // Keep the last 50 games, delete everything older

/**
 * Clean up old game accounts (keep only last 50 games)
 *
 * SIMPLE STRATEGY:
 * - Keep the most recent 50 games
 * - Delete all older games to recover rent
 *
 * FLOW:
 * 1. Get current round ID from config
 * 2. Calculate cutoff: currentRoundId - 50
 * 3. Delete all games with roundId < cutoff
 * 4. Rent refunded to backend wallet
 *
 * RENT REFUND:
 * - When you close a PDA, rent is refunded to the closer (backend wallet)
 * - Typical game account rent: ~0.01-0.05 SOL
 * - Net cost: Only transaction fee (~0.000005 SOL)
 * - You PROFIT from cleanup (rent > tx fee)
 */
export const cleanupOldGames = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log("\n[Cleanup] Starting cleanup of old game accounts...");

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT!, CRANK_AUTHORITY_PRIVATE_KEY!);

      // 1. Get current round ID
      const currentRoundId = await solanaClient.getCurrentRoundId();
      console.log(`[Cleanup] Current round ID: ${currentRoundId}`);

      if (currentRoundId === 0) {
        console.log("[Cleanup] No games found (round ID is 0)");
        return;
      }

      // 2. Calculate cutoff round (keep last 50 games)
      const cutoffRound = Math.max(1, currentRoundId - GAMES_TO_KEEP);
      console.log(`[Cleanup] Keeping rounds ${cutoffRound} to ${currentRoundId}`);
      console.log(`[Cleanup] Deleting rounds 1 to ${cutoffRound - 1}`);

      if (cutoffRound <= 1) {
        console.log(`[Cleanup] Only ${currentRoundId} games exist, nothing to delete yet`);
        return;
      }

      let deletedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // 3. Delete all games older than cutoff
      for (let roundId = 1; roundId < cutoffRound; roundId++) {
        try {
          // Check if game account exists
          const game = await solanaClient.getGameRound(roundId);

          if (!game) {
            console.log(`[Cleanup] Round ${roundId}: Account doesn't exist (already deleted)`);
            skippedCount++;
            continue;
          }

          // Check if game is closed or expired (safety check)
          const currentTime = Math.floor(Date.now() / 1000);
          const isClosed = game.status === 1;
          const isExpired = currentTime > game.endDate + 86400; // 24 hours after end

          if (!isClosed && !isExpired) {
            console.log(
              `[Cleanup] Round ${roundId}: Not eligible for deletion (status: ${game.status}, not expired)`
            );
            skippedCount++;
            continue;
          }

          // Delete the game account
          console.log(`[Cleanup] Round ${roundId}: Deleting (status: ${game.status})`);

          const txSignature = await solanaClient.deleteGame(roundId);
          const confirmed = await solanaClient.confirmTransaction(txSignature);

          if (confirmed) {
            console.log(`[Cleanup] Round ${roundId}: ✅ Deleted successfully. Tx: ${txSignature}`);
            console.log(`[Cleanup] Round ${roundId}: 💰 Rent refunded to backend wallet`);
            deletedCount++;
          } else {
            console.error(
              `[Cleanup] Round ${roundId}: ❌ Transaction confirmation failed: ${txSignature}`
            );
            errorCount++;
          }
        } catch (error) {
          console.error(`[Cleanup] Round ${roundId}: Error during cleanup:`, error);
          errorCount++;
          // Continue with next round
        }
      }

      // Summary
      console.log("\n[Cleanup] Cleanup complete:");
      console.log(`  - Deleted: ${deletedCount} games`);
      console.log(`  - Skipped: ${skippedCount} games`);
      console.log(`  - Errors: ${errorCount} games`);
      console.log(`  - Estimated rent recovered: ~${(deletedCount * 0.02).toFixed(4)} SOL`);
    } catch (error) {
      console.error("[Cleanup] Fatal error during cleanup:", error);
      throw error;
    }
  },
});
