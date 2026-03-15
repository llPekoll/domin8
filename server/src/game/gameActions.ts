/**
 * Game action implementations
 * Replaces gameScheduler.ts from Convex
 */
import { SolanaClient } from "../lib/solana.js";
import { GAME_STATUS, GAME_TIMING } from "../lib/types.js";
import { config } from "../config.js";
import {
  upsertGameState,
  upsertScheduledJob,
  markJobCompleted,
  markJobFailed,
  isActionScheduled,
  syncParticipants,
  clearOldParticipants,
  getBossWallet,
} from "./gameQueries.js";
import { notifyGameWinner } from "./notifications.js";
import { emitGameStateUpdate } from "../socket/emitter.js";

function getSolanaClient(): SolanaClient {
  return new SolanaClient(config.solanaRpcEndpoint, config.crankAuthorityPrivateKey);
}

/**
 * Create a new game round on-chain
 */
export async function executeCreateGameRound(): Promise<{
  success: boolean;
  roundId?: number;
  mapId?: number;
  signature?: string;
  error?: string;
}> {
  console.log("\n[GameActions] Executing create game round");

  try {
    const solanaClient = getSolanaClient();
    const gameConfig = await solanaClient.getGameConfig();

    if (!gameConfig) {
      console.error("[GameActions] Config not found");
      return { success: false, error: "Config not found" };
    }

    if (gameConfig.lock) {
      console.log("[GameActions] System is locked - game already in progress");
      return { success: false, error: "System locked" };
    }

    const nextRoundId = gameConfig.gameRound;
    const mapId = Math.random() < 0.5 ? 1 : 2;

    console.log(`[GameActions] Creating round ${nextRoundId} with map ${mapId}...`);
    const txResult = await solanaClient.createGameRound(nextRoundId, mapId);
    const confirmed = await solanaClient.confirmTransaction(txResult.signature);

    if (confirmed) {
      console.log(`[GameActions] Game round ${nextRoundId} created: ${txResult.signature}`);

      await upsertScheduledJob({
        jobId: `create_game_${nextRoundId}`,
        roundId: nextRoundId,
        action: "create_game",
        scheduledTime: Math.floor(Date.now() / 1000),
      });
      await markJobCompleted(nextRoundId, "create_game");

      return { success: true, roundId: nextRoundId, mapId, signature: txResult.signature };
    } else {
      return { success: false, error: "Transaction confirmation failed" };
    }
  } catch (error) {
    console.error("[GameActions] Error creating game round:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * End a game round (calls end_game instruction)
 */
export async function executeEndGame(roundId: number): Promise<void> {
  console.log(`\n[GameActions] Executing end game for round ${roundId}`);

  try {
    const solanaClient = getSolanaClient();

    let activeGame = await solanaClient.getActiveGame();

    if (activeGame?.gameRound !== roundId) {
      activeGame = await solanaClient.getGameRound(roundId);
      if (!activeGame) {
        console.log(`[GameActions] Round ${roundId}: No game found, skipping`);
        return;
      }
    }

    if (activeGame.status === GAME_STATUS.WAITING) {
      console.log(`[GameActions] Round ${roundId}: Game is WAITING, cannot end yet`);
      return;
    }

    if (activeGame.status === GAME_STATUS.CLOSED) {
      console.log(`[GameActions] Round ${roundId}: Already CLOSED`);

      // Recovery: schedule send_prize if needed
      if (activeGame.winner && activeGame.winnerPrize > 0) {
        const scheduled = await isActionScheduled(roundId, "send_prize");
        if (!scheduled) {
          console.log(`[GameActions] Round ${roundId}: Scheduling send_prize recovery`);
          setTimeout(() => executeSendPrize(roundId), GAME_TIMING.SEND_PRIZE_DELAY);
          await upsertScheduledJob({
            jobId: `send_prize_recovery_${roundId}`,
            roundId,
            action: "send_prize",
            scheduledTime: Math.floor(Date.now() / 1000) + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
          });
        }
      }
      return;
    }

    // Verify time window
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < activeGame.endDate) {
      const remaining = activeGame.endDate - currentTime;
      console.log(`[GameActions] Round ${roundId}: ${remaining}s remaining, rescheduling`);
      setTimeout(() => executeEndGame(roundId), remaining * 1000);
      return;
    }

    const betCount = activeGame.bets?.length || 0;
    if (betCount === 0) {
      console.log(`[GameActions] Round ${roundId}: NO BETS - empty game`);
      await markJobFailed(roundId, "end_game", "NO BETS");
      return;
    }

    // Call end_game instruction
    console.log(`[GameActions] Round ${roundId}: Calling end_game...`);
    const txResult = await solanaClient.endGame(roundId);
    const confirmed = await solanaClient.confirmTransaction(txResult.signature);

    if (confirmed) {
      console.log(`[GameActions] Round ${roundId}: Game ended: ${txResult.signature}`);
      await markJobCompleted(roundId, "end_game");

      // Wait for blockchain update
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const updatedGame = await solanaClient.getGameRound(roundId);
      if (updatedGame?.winner) {
        console.log(`[GameActions] Round ${roundId}: Winner: ${updatedGame.winner}`);

        // Notify winner
        const winningBetIndex = updatedGame.winningBetIndex ?? -1;
        const winnerBet = winningBetIndex >= 0 ? updatedGame.bets?.[winningBetIndex] : null;

        await notifyGameWinner({
          roundId,
          winnerWalletAddress: updatedGame.winner,
          betAmount: winnerBet?.amount || 0,
          totalPot: updatedGame.totalDeposit || 0,
          participantCount: updatedGame.bets?.length || 0,
        });

        // Sync finished state
        const bets = activeGame?.bets || updatedGame.bets || [];
        const wallets = activeGame?.wallets || updatedGame.wallets || [];

        await upsertGameState({
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
          wallets,
          totalPot: updatedGame.totalDeposit || 0,
          winner: updatedGame.winner,
          winningBetIndex: updatedGame.winningBetIndex ?? undefined,
          prizeSent: false,
        });

        // Emit game state update via socket
        emitGameStateUpdate({
          roundId: updatedGame.gameRound,
          status: "finished",
          winner: updatedGame.winner,
          winnerPrize: updatedGame.winnerPrize,
          winningBetIndex: updatedGame.winningBetIndex,
        });

        // Schedule send_prize
        const sendPrizeScheduled = await isActionScheduled(roundId, "send_prize");
        if (!sendPrizeScheduled) {
          setTimeout(() => executeSendPrize(roundId), GAME_TIMING.SEND_PRIZE_DELAY);
          await upsertScheduledJob({
            jobId: `send_prize_${roundId}_${Date.now()}`,
            roundId,
            action: "send_prize",
            scheduledTime: Math.floor(Date.now() / 1000) + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
          });
        }
      } else {
        // VRF pending - retry
        console.log(`[GameActions] Round ${roundId}: No winner yet (VRF pending), retrying...`);
        await markJobFailed(roundId, "end_game", "VRF pending");
        setTimeout(() => executeEndGame(roundId), 3000);
        await upsertScheduledJob({
          jobId: `end_game_retry_${roundId}_${Date.now()}`,
          roundId,
          action: "end_game",
          scheduledTime: Math.floor(Date.now() / 1000) + 3,
        });
      }
    } else {
      console.error(`[GameActions] Round ${roundId}: Transaction confirmation failed`);
      await markJobFailed(roundId, "end_game", "Transaction confirmation failed");
    }
  } catch (error) {
    console.error(`[GameActions] Round ${roundId}: Error:`, error);
    await markJobFailed(
      roundId,
      "end_game",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Send prize to winner
 */
export async function executeSendPrize(roundId: number): Promise<void> {
  console.log(`\n[GameActions] Executing send prize for round ${roundId}`);

  try {
    const solanaClient = getSolanaClient();
    const gameRound = await solanaClient.getGameRound(roundId);

    if (!gameRound) {
      console.log(`[GameActions] Round ${roundId}: No game found, skipping`);
      return;
    }

    if (gameRound.gameRound !== roundId) {
      console.log(`[GameActions] Round ${roundId}: Wrong round, skipping`);
      return;
    }

    if (gameRound.status !== 1) {
      console.log(`[GameActions] Round ${roundId}: Not closed (status: ${gameRound.status}), rescheduling`);
      setTimeout(() => executeSendPrize(roundId), 3000);
      return;
    }

    if (!gameRound.winner) {
      console.log(`[GameActions] Round ${roundId}: No winner, skipping`);
      return;
    }

    if (gameRound.winnerPrize === 0) {
      console.log(`[GameActions] Round ${roundId}: Prize already sent`);
      await markJobCompleted(roundId, "send_prize");

      // Update database
      await upsertGameState({
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
      });
      return;
    }

    console.log(`[GameActions] Round ${roundId}: Sending prize to ${gameRound.winner}`);
    const txResult = await solanaClient.sendPrizeWinner(roundId);
    const confirmed = await solanaClient.confirmTransaction(txResult.signature);

    if (confirmed) {
      console.log(`[GameActions] Round ${roundId}: Prize sent: ${txResult.signature}`);
      await markJobCompleted(roundId, "send_prize");

      // Update game state with prizeSent=true
      await upsertGameState({
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
      });

      // Schedule next game creation
      const createScheduled = await isActionScheduled(gameRound.gameRound + 1, "create_game");
      if (!createScheduled) {
        setTimeout(() => executeCreateGameRound(), GAME_TIMING.CREATE_GAME_DELAY);
        await upsertScheduledJob({
          jobId: `create_game_${gameRound.gameRound + 1}_${Date.now()}`,
          roundId: gameRound.gameRound + 1,
          action: "create_game",
          scheduledTime:
            Math.floor(Date.now() / 1000) + GAME_TIMING.CREATE_GAME_DELAY / 1000,
        });
      }

      console.log(`[GameActions] Round ${roundId}: GAME COMPLETE`);
    } else {
      console.error(`[GameActions] Round ${roundId}: Transaction confirmation failed`);
      await markJobFailed(roundId, "send_prize", "Transaction confirmation failed");
    }
  } catch (error) {
    console.error(`[GameActions] Round ${roundId}: Error sending prize:`, error);
    await markJobFailed(
      roundId,
      "send_prize",
      error instanceof Error ? error.message : String(error)
    );
  }
}
