/**
 * Game Scheduler - Automated Game Progression (Risk-based Architecture)
 *
 * Handles scheduled execution of game state transitions:
 * 1. Create new game round (when system is unlocked)
 * 2. End game at endTimestamp (status: 0 → 1, winner selected on-chain)
 * 3. Send prize to winner (distributes funds)
 *
 * This module is called by ctx.scheduler.runAfter() from eventListener.ts
 */
"use node";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { SolanaClient } from "./lib/solana";
import { GAME_STATUS, GAME_TIMING } from "./constants";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

// ============================================================================
// CREATE GAME ROUND SCHEDULER
// ============================================================================

/**
 * Execute create game round action
 * Creates a new game on-chain when the system is unlocked
 *
 * FLOW:
 * 1. Check if system is unlocked (previous game finished)
 * 2. Get next round ID from config
 * 3. Create game round with random map
 * 4. System gets locked until game completes
 */
export const executeCreateGameRound = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("\n[Scheduler] Executing create game round");

    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      // 1. Get current config state
      const config = await solanaClient.getGameConfig();

      if (!config) {
        console.error("Config not found - has initialize_config been called?");
        return { success: false, error: "Config not found" };
      }

      // 2. Check if system is locked (game already in progress)
      if (config.lock) {
        console.log("System is locked - game already in progress");

        // Get active game info
        const activeGame = await solanaClient.getActiveGame();
        console.log("Active game info:", {
          roundId: activeGame?.gameRound,
          status: activeGame?.status,
          betCount: activeGame?.bets?.length || 0,
          endDate: activeGame?.endDate ? new Date(activeGame.endDate * 1000).toISOString() : "not set",
        });

        return {
          success: false,
          error: "System locked",
          activeRoundId: activeGame?.gameRound
        };
      }

      // 3. Get next round ID from config
      const nextRoundId = config.gameRound;
      console.log(`Next round ID: ${nextRoundId}`);

      // 4. Select random map (1 or 2 based on seed data)
      const mapId = Math.random() < 0.5 ? 1 : 2;
      console.log(`Selected map ID: ${mapId}`);

      // 5. Create the game round on-chain
      console.log(`Creating game round ${nextRoundId} with map ${mapId}...`);
      const txResult = await solanaClient.createGameRound(nextRoundId, mapId);
      const txSignature = txResult.signature;

      // 6. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`✅ Game round ${nextRoundId} created successfully. Tx: ${txSignature}`);

        // Save to database for tracking
        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: `create_game_${nextRoundId}`,
          roundId: nextRoundId,
          action: "create_game",
          scheduledTime: Math.floor(Date.now() / 1000),
        });

        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId: nextRoundId,
          action: "create_game",
        });

        // The countdown will start when first bet is placed
        // end_game will be scheduled when Helius webhook detects first bet
        console.log(`Game ${nextRoundId} waiting for first bet to start countdown`);

        return {
          success: true,
          roundId: nextRoundId,
          mapId,
          signature: txSignature
        };
      } else {
        console.error(`❌ Transaction confirmation failed: ${txSignature}`);
        return { success: false, error: "Transaction confirmation failed" };
      }
    } catch (error) {
      console.error("Error creating game round:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
});

/**
 * Get info about next round from blockchain config
 * Useful for frontend to know if a game can be created
 */
export const getNextRoundInfo = internalAction({
  args: {},
  handler: async () => {
    try {
      const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

      const config = await solanaClient.getGameConfig();
      const activeGame = await solanaClient.getActiveGame();

      return {
        nextRoundId: config?.gameRound ?? 0,
        isLocked: config?.lock ?? true,
        roundTime: config?.roundTime ?? 60,
        minBet: config?.minDepositAmount ?? 1_000_000,
        maxBet: config?.maxDepositAmount ?? 10_000_000_000,
        activeGame: activeGame ? {
          roundId: activeGame.gameRound,
          status: activeGame.status,
          betCount: activeGame.bets?.length || 0,
          startDate: activeGame.startDate,
          endDate: activeGame.endDate,
          totalPot: activeGame.totalDeposit,
        } : null,
      };
    } catch (error) {
      console.error("Error fetching next round info:", error);
      return {
        nextRoundId: 0,
        isLocked: true,
        roundTime: 60,
        minBet: 1_000_000,
        maxBet: 10_000_000_000,
        activeGame: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
});

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

      // Check game status
      // GAME_STATUS: OPEN=0 (can end), CLOSED=1 (already ended), WAITING=2 (no bets yet)
      if (activeGame.status === GAME_STATUS.WAITING) {
        console.log(`Round ${roundId}: Game is WAITING for first bet (status: ${activeGame.status}), cannot end yet`);
        return;
      }

      if (activeGame.status === GAME_STATUS.CLOSED) {
        console.log(`Round ${roundId}: Already CLOSED (status: ${activeGame.status})`);
        console.log("winner and winner prize info:", {
          winner: activeGame.winner,
          winnerPrize: activeGame.winnerPrize,
        });

        // Recovery: If game is closed but prize not sent, schedule sendPrizeWinner
        if (activeGame.winner && activeGame.winnerPrize > 0) {
          console.log(`Round ${roundId}: Game closed but prize not sent yet, scheduling...`);

          // Check if already scheduled
          const alreadyScheduled = await ctx.runQuery(internal.gameSchedulerMutations.isActionScheduled, {
            roundId,
            action: "send_prize",
          });

          if (!alreadyScheduled) {
            const jobId = await ctx.scheduler.runAfter(
              GAME_TIMING.SEND_PRIZE_DELAY,
              internal.gameScheduler.executeSendPrize,
              { roundId }
            );

            // Save job to database
            await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
              jobId: jobId.toString(),
              roundId,
              action: "send_prize",
              scheduledTime: Math.floor(Date.now() / 1000) + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
            });

            console.log(`Round ${roundId}: Scheduled send_prize (jobId: ${jobId})`);
          }
        }
        return;
      }

      // 2. Verify time window has closed (with buffer for blockchain clock)
      const currentTime = Math.floor(Date.now() / 1000);

      if (currentTime < activeGame.endDate) {
        const remaining = activeGame.endDate - currentTime;
        console.log(
          `Round ${roundId}: Waiting for time window (${remaining}s remaining), skipping`
        );
        
        // Update the scheduled job to execute at the correct time
        const newScheduledTime = currentTime + remaining;
        await ctx.runMutation(internal.gameSchedulerMutations.updateScheduledJobTime, {
          roundId,
          action: "end_game",
          scheduledTime: newScheduledTime,
        });
        
        console.log(`Round ${roundId}: Updated job to execute at ${new Date(newScheduledTime * 1000).toISOString()}`);
        
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
      const txResult = await solanaClient.endGame(roundId);
      const txSignature = txResult.signature;

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

        // Use getGameRound to fetch from specific game PDA (not active_game which may be cleared)
        const updatedGame = await solanaClient.getGameRound(roundId);
        if (updatedGame?.winner) {
          console.log(`Round ${roundId}: Winner selected: ${updatedGame.winner}`);
          console.log(`Round ${roundId}: Prize amount: ${updatedGame.winnerPrize} lamports`);

          // Send webhook notification for winner
          const winningBetIndex = updatedGame.winningBetIndex ?? -1;
          const winnerBet = winningBetIndex >= 0 && updatedGame.bets?.[winningBetIndex] 
            ? updatedGame.bets[winningBetIndex] 
            : null;

          await ctx.runAction(internal.webhooks.notifyGameWinner, {
            roundId,
            winnerWalletAddress: updatedGame.winner.toString(),
            betAmount: winnerBet?.amount || 0,
            totalPot: updatedGame.totalDeposit || 0,
            participantCount: updatedGame.bets?.length || 0,
          });

          // Sync finished game state to database (with winner, all bets, wallets)
          // Use activeGame for bet data (doesn't change after game ends)
          // Use updatedGame for winner info (added after end_game)
          const bets = activeGame?.bets || updatedGame.bets || [];
          const wallets = activeGame?.wallets || updatedGame.wallets || [];

          await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
            gameRound: {
              roundId: updatedGame.gameRound,
              status: updatedGame.status,
              startTimestamp: updatedGame.startDate,
              endTimestamp: updatedGame.endDate,
              map: updatedGame.map,
              betCount: bets.length,
              betAmounts: bets.map((b) => b.amount),
              betSkin: bets.map((b) => b.skin),
              betPosition: bets.map((b) => b.position),
              betWalletIndex: bets.map((b) => b.walletIndex),
              wallets: wallets,
              totalPot: updatedGame.totalDeposit || activeGame?.totalDeposit || 0,
              winner: updatedGame.winner,
              winningBetIndex: updatedGame.winningBetIndex ?? undefined,
              prizeSent: false, // Prize not sent yet at this point
            },
          });
          console.log(`Round ${roundId}: Synced finished game state to database (${bets.length} bets, ${wallets.length} wallets)`);

          // Check if send_prize already scheduled (by webhook)
          // Only schedule as fallback if webhook missed it
          const sendPrizeScheduled = await ctx.runQuery(
            internal.gameSchedulerMutations.isActionScheduled,
            { roundId, action: "send_prize" }
          );

          if (!sendPrizeScheduled) {
            // Schedule sendPrizeWinner (fallback - webhook should have done this)
            const jobId = await ctx.scheduler.runAfter(
              GAME_TIMING.SEND_PRIZE_DELAY,
              internal.gameScheduler.executeSendPrize,
              { roundId }
            );

            // Save job to database
            await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
              jobId: jobId.toString(),
              roundId,
              action: "send_prize",
              scheduledTime: Math.floor(Date.now() / 1000) + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
            });

            console.log(`Round ${roundId}: Scheduled send_prize as fallback (jobId: ${jobId})`);
          } else {
            console.log(`Round ${roundId}: send_prize already scheduled by webhook`);
          }
        } else {
          // No winner yet - likely VRF pending for multi-player game
          // Reschedule end_game to try again in 3 seconds
          console.warn(`Round ${roundId}: ⚠️ No winner yet (VRF pending?), rescheduling end_game...`);

          // Reset job status to pending so it can be rescheduled
          await ctx.runMutation(internal.gameSchedulerMutations.markJobFailed, {
            roundId,
            action: "end_game",
            error: "VRF pending - needs retry",
          });

          // Schedule retry
          const retryJobId = await ctx.scheduler.runAfter(
            3000, // 3 seconds
            internal.gameScheduler.executeEndGame,
            { roundId }
          );

          await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
            jobId: retryJobId.toString(),
            roundId,
            action: "end_game",
            scheduledTime: Math.floor(Date.now() / 1000) + 3,
          });

          console.log(`Round ${roundId}: Rescheduled end_game retry in 3s (jobId: ${retryJobId})`);
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
        console.log(`Round ${roundId}: Game not closed yet (status: ${gameRound.status}), rescheduling...`);

        // Reschedule send_prize to try again in 3 seconds
        const retryJobId = await ctx.scheduler.runAfter(
          3000,
          internal.gameScheduler.executeSendPrize,
          { roundId }
        );

        await ctx.runMutation(internal.gameSchedulerMutations.upsertScheduledJob, {
          jobId: retryJobId.toString(),
          roundId,
          action: "send_prize",
          scheduledTime: Math.floor(Date.now() / 1000) + 3,
        });

        console.log(`Round ${roundId}: Rescheduled send_prize in 3s (jobId: ${retryJobId})`);
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

        // mark game as complete in database
        await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
            gameRound: {
              roundId: gameRound.gameRound,
              status: gameRound.status,
              startTimestamp: gameRound.startDate,
              endTimestamp: gameRound.endDate,
              map: gameRound.map,
              betCount: gameRound.bets.length,
              betAmounts: gameRound.bets.map((b) => b.amount),
              betSkin: gameRound.bets.map((b) => b.skin),
              betPosition: gameRound.bets.map((b) => b.position),
              betWalletIndex: gameRound.bets.map((b) => b.walletIndex),
              wallets: gameRound.wallets,
              totalPot: gameRound.totalDeposit,
              winner: gameRound.winner,
              winningBetIndex: gameRound.winningBetIndex ?? undefined,
              prizeSent: true,
            },
          });


        console.log(`Round ${roundId}: 🎉 GAME COMPLETE - System ready for next game`);
        return;
      }

      // 2. Call sendPrizeWinner
      console.log(`Round ${roundId}: Calling send_prize_winner instruction...`);
      console.log(`Round ${roundId}: Winner: ${gameRound.winner}`);
      console.log(`Round ${roundId}: Prize: ${gameRound.winnerPrize} lamports`);

      const txResult = await solanaClient.sendPrizeWinner(roundId);
      const txSignature = txResult.signature;

      // 3. Wait for confirmation
      const confirmed = await solanaClient.confirmTransaction(txSignature);

      if (confirmed) {
        console.log(`Round ${roundId}: ✅ Prize sent successfully. Tx: ${txSignature}`);

        // Mark job as completed
        await ctx.runMutation(internal.gameSchedulerMutations.markJobCompleted, {
          roundId,
          action: "send_prize",
        });

        // Update player stats (totalGamesPlayed, totalWins) for all participants
        // This runs after prize transaction is confirmed, regardless of winnerPrize value
        if (gameRound.wallets && gameRound.wallets.length > 0 && gameRound.winner) {
          try {
            await ctx.runMutation(internal.players.updateGameStatsForParticipants, {
              participantWallets: gameRound.wallets,
              winnerWallet: gameRound.winner.toString(),
            });
            console.log(`Round ${roundId}: Player stats updated for ${gameRound.wallets.length} participants`);
          } catch (statsError) {
            console.error(`Round ${roundId}: Failed to update player stats:`, statsError);
          }
        }

        // Award points to winner for the prize amount
        if (gameRound.winner && gameRound.winnerPrize > 0) {
          try {
            await ctx.runMutation(internal.players.awardPointsInternal, {
              walletAddress: gameRound.winner.toString(),
              amountLamports: gameRound.winnerPrize,
            });
            console.log(`Round ${roundId}: Points awarded to winner for prize`);
          } catch (pointsError) {
            console.error(`Round ${roundId}: Failed to award points to winner:`, pointsError);
          }
        }

        // 4. Verify prize was sent and update database
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const updatedGame = await solanaClient.getGameRound(roundId);

        // Update database with final game state
        await ctx.runMutation(internal.syncServiceMutations.upsertGameState, {
          gameRound: {
            roundId: gameRound.gameRound,
            status: gameRound.status,
            startTimestamp: gameRound.startDate,
            endTimestamp: gameRound.endDate,
            map: gameRound.map,
            betCount: gameRound.bets.length,
            betAmounts: gameRound.bets.map((b) => b.amount),
            betSkin: gameRound.bets.map((b) => b.skin),
            betPosition: gameRound.bets.map((b) => b.position),
            betWalletIndex: gameRound.bets.map((b) => b.walletIndex),
            wallets: gameRound.wallets,
            totalPot: gameRound.totalDeposit,
            winner: gameRound.winner,
            winningBetIndex: gameRound.winningBetIndex ?? undefined,
            prizeSent: true,
          },
        });

        if (updatedGame?.winnerPrize === 0) {
          console.log(`Round ${roundId}: ✅ Verified: Prize successfully distributed`);
        } else {
          console.warn(`Round ${roundId}: ⚠️ winnerPrize not zeroed (${updatedGame?.winnerPrize} remaining) - this may be expected behavior`);
        }
        console.log(`Round ${roundId}: 🎉 GAME COMPLETE - Cron will create next game`);
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
