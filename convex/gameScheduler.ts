/**
 * Game Scheduler - Automated Game Progression (Risk-based Architecture)
 *
 * Handles scheduled execution of game state transitions:
 * 1. End game at endTimestamp (status: 0 → 1, winner selected on-chain)
 * 2. Send prize to winner (distributes funds)
 *
 * This module is called by ctx.scheduler.runAfter() from eventListener.ts
 */
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

// ============================================================================
// END GAME SCHEDULER
// ============================================================================

/**
 * Execute end game action (risk-based architecture)
 * Called at endTimestamp to end the game and select winner on-chain
 *
 * LOGIC:
 * 1. Check player count (unique wallets)
 * 2. If single player → Refund (TODO: needs refund_game instruction)
 * 3. If multiple players → End game with VRF winner selection
 * 4. Handle game state transitions and cleanup
 */
export const executeEndGame = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, { roundId }) => {
    console.log(`\n[Scheduler] Executing end game for round ${roundId}`);

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      

      // 1. Get current game state from blockchain (active_game PDA)
      let activeGame = await solanaClient.getActiveGame();

      // If this is not the active game, use getGameRound to fetch specific round data
      if (activeGame?.gameRound !== roundId) {
        console.log(`Round ${roundId}: Not the active game (active: ${activeGame?.gameRound}), fetching specific round data`);
        activeGame = await solanaClient.getGameRound(roundId);
        if (!activeGame) {
          console.log(`Round ${roundId}: No game found on blockchain, skipping`);
          return;
        }
      }

      if (!activeGame) {
        console.log(`Round ${roundId}: No active game found, skipping`);
        return;
      }

      // Check if already closed
      if (activeGame.status !== 0) {
        console.log(`Round ${roundId}: Already closed (status: ${activeGame.status})`);
        console.log("winner and winner prize info:", {
          winner: activeGame.winner,
          winnerPrize: activeGame.winnerPrize,
        });

        // Recovery: If game is closed but prize not sent, schedule sendPrizeWinner
        if (activeGame.status === 1 && activeGame.winner && activeGame.winnerPrize > 0) {
          console.log(`Round ${roundId}: Game closed but prize not sent yet, scheduling...`);

          // Check if already scheduled
          const alreadyScheduled = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
            roundId,
            action: "send_prize",
          });

          if (!alreadyScheduled) {
            const jobId = await ctx.scheduler.runAfter(
              0, // Execute immediately
              internal.gameScheduler.executeSendPrize,
              { roundId }
            );

            // Save job to database
            await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
              jobId: jobId.toString(),
              roundId,
              action: "send_prize",
              scheduledTime: Math.floor(Date.now() / 1000),
            });

            console.log(`Round ${roundId}: Scheduled send_prize (jobId: ${jobId})`);
          }
        }
        return;
      }

      // 2. Verify time window has closed (with buffer for blockchain clock)
      const currentTime = Math.floor(Date.now() / 1000);
      const BLOCKCHAIN_CLOCK_BUFFER = 2; // seconds to account for blockchain clock drift

      if (currentTime < activeGame.endDate + BLOCKCHAIN_CLOCK_BUFFER) {
        const remaining = activeGame.endDate + BLOCKCHAIN_CLOCK_BUFFER - currentTime;
        console.log(
          `Round ${roundId}: Waiting for time window (${remaining}s remaining), skipping`
        );
        return;
      }

      // 3. **CRITICAL CHECK**: Count unique players (wallet addresses)
      const uniquePlayers = new Set(activeGame.wallets).size;
      const betCount = activeGame.bets?.length || 0;

      console.log(`Round ${roundId}: Player analysis:`, {
        uniquePlayers,
        betCount,
        totalPot: activeGame.totalDeposit,
      });

      // 4b. CASE: No players (edge case) → Delete game
      if (betCount === 0) {
        console.log(`Round ${roundId}: ⚠️ NO BETS - Marking for cleanup`);

        await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
          roundId,
          action: "end_game",
          error: "NO BETS - Empty game needs cleanup",
        });

        return;
      }

      // 4c. CASE: Multiple players → END GAME NORMALLY
      console.log(`Round ${roundId}: 🎮 MULTIPLE PLAYERS (${uniquePlayers} unique) - Ending game...`);

      // 5. Call Solana endGame() instruction
      console.log(`Round ${roundId}: Calling end_game instruction...`);
      const txSignature = await solanaClient.endGame(roundId);

      // 6. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: ✅ Game ended successfully. Tx: ${txSignature}`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "end_game",
        });

        // 7. Wait for blockchain to update, then schedule prize distribution
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

        const updatedGame = await solanaClient.getActiveGame();
        if (updatedGame?.winner) {
          console.log(`Round ${roundId}: Winner selected: ${updatedGame.winner}`);
          console.log(`Round ${roundId}: Prize amount: ${updatedGame.winnerPrize} lamports`);

          // Schedule sendPrizeWinner
          const jobId = await ctx.scheduler.runAfter(
            1000, // 1 second delay
            internal.gameScheduler.executeSendPrize,
            { roundId }
          );

          // Save job to database
          await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
            jobId: jobId.toString(),
            roundId,
            action: "send_prize",
            scheduledTime: Math.floor(Date.now() / 1000) + 1, // 1 second from now
          });

          console.log(`Round ${roundId}: Scheduled send_prize (jobId: ${jobId})`);
        } else {
          console.warn(`Round ${roundId}: ⚠️ No winner found after end_game`);
        }
      } else {
        console.error(`Round ${roundId}: ❌ Transaction confirmation failed: ${txSignature}`);

        // Mark job as failed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
          roundId,
          action: "end_game",
          error: `Transaction confirmation failed: ${txSignature}`,
        });
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error ending game:`, error);

      // Mark job as failed in database
      await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
        roundId,
        action: "end_game",
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - recovery cron will handle later
    }
  },
});

// ============================================================================
// SEND PRIZE SCHEDULER
// ============================================================================

/**
 * Execute send prize to winner (risk-based architecture)
 * Distributes the winner's prize from the game account
 *
 * FLOW:
 * 1. Verify game is closed (status 1) and winner exists
 * 2. Send prize to winner
 * 3. Prepare system for next game
 */
export const executeSendPrize = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, { roundId }) => {
    console.log(`\n[Scheduler] Executing send prize for round ${roundId}`);

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      // 1. Get current game state from blockchain
      const gameRound = await solanaClient.getGameRound(roundId);

      if (!gameRound) {
        console.log(`Round ${roundId}: No active game found, skipping`);
        return;
      }

      // Verify this is the correct round
      if (gameRound.gameRound !== roundId) {
        console.log(`Round ${roundId}: Not the active game (active: ${gameRound.gameRound}), skipping`);
        return;
      }

      // Check if game is closed (status: 1)
      if (gameRound.status !== 1) {
        console.log(`Round ${roundId}: Game not closed yet (status: ${gameRound.status}), skipping`);
        return;
      }

      // Check if winner exists
      if (!gameRound.winner) {
        console.warn(`Round ${roundId}: ⚠️ No winner determined yet, skipping`);
        return;
      }

      // Check if prize already sent (winnerPrize will be 0 after sending)
      if (gameRound.winnerPrize === 0) {
        console.log(`Round ${roundId}: ✅ Prize already sent, game complete`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "send_prize",
        });

        console.log(`Round ${roundId}: 🎉 GAME COMPLETE - System ready for next game`);
        return;
      }

      // 2. Call sendPrizeWinner
      console.log(`Round ${roundId}: Calling send_prize_winner instruction...`);
      console.log(`Round ${roundId}: Winner: ${gameRound.winner}`);
      console.log(`Round ${roundId}: Prize: ${gameRound.winnerPrize} lamports`);

      const txSignature = await solanaClient.sendPrizeWinner(roundId);

      // 3. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: ✅ Prize sent successfully. Tx: ${txSignature}`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "send_prize",
        });

        // 4. Verify prize was sent
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const updatedGame = await solanaClient.getGameRound(roundId);

        if (updatedGame?.winnerPrize === 0) {
          console.log(`Round ${roundId}: ✅ Verified: Prize successfully distributed`);
          console.log(`Round ${roundId}: 🎉 GAME COMPLETE - Ready for next round`);
        } else {
          console.warn(`Round ${roundId}: ⚠️ Prize may not have been fully sent (${updatedGame?.winnerPrize} remaining)`);
        }

        // The system is now ready for the next game
        // When a new bet is placed, it will trigger create_game_round automatically
      } else {
        console.error(`Round ${roundId}: ❌ Transaction confirmation failed: ${txSignature}`);

        // Mark job as failed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
          roundId,
          action: "send_prize",
          error: `Transaction confirmation failed: ${txSignature}`,
        });
      }
    } catch (error) {
      console.error(`Round ${roundId}: Error sending prize:`, error);

      // Mark job as failed in database
      await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
        roundId,
        action: "send_prize",
        error: error instanceof Error ? error.message : String(error),
      });

      // Don't throw - recovery cron will handle later
    }
  },
});
