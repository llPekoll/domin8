/**
 * Main game loop - replaces Convex crons
 * Uses setTimeout chains instead of setInterval
 */
import type { Server } from "socket.io";
import { SolanaClient } from "../lib/solana.js";
import { GAME_STATUS, GAME_TIMING } from "../lib/types.js";
import { config } from "../config.js";
import {
  upsertGameState,
  upsertScheduledJob,
  isActionScheduled,
  getFinishedGamesNeedingPrize,
  syncParticipants,
  clearOldParticipants,
  getBossWallet,
  cleanupOldJobs,
} from "./gameQueries.js";
import {
  executeCreateGameRound,
  executeEndGame,
  executeSendPrize,
} from "./gameActions.js";
import { emitGameStateUpdate, emitParticipantsUpdate } from "../socket/emitter.js";

let io: Server;

export function setIO(socketIO: Server) {
  io = socketIO;
}

function getSolanaClient(): SolanaClient {
  return new SolanaClient(config.solanaRpcEndpoint, config.crankAuthorityPrivateKey);
}

/**
 * Sync active game from blockchain to database
 */
async function syncActiveGame(activeGame: any) {
  try {
    if (!activeGame) return;

    await upsertGameState({
      roundId: activeGame.gameRound,
      status: activeGame.status,
      startTimestamp: activeGame.startDate,
      endTimestamp: activeGame.endDate,
      map: activeGame.map,
      betCount: activeGame.bets?.length,
      betAmounts: activeGame.bets?.map((b: any) => b.amount),
      betSkin: activeGame.bets?.map((b: any) => b.skin),
      betPosition: activeGame.bets?.map((b: any) => b.position),
      betWalletIndex: activeGame.bets?.map((b: any) => b.walletIndex),
      wallets: activeGame.wallets,
      totalPot: activeGame.totalDeposit,
      winner: activeGame.winner,
      winningBetIndex: activeGame.winningBetIndex ?? undefined,
      prizeSent: activeGame.prizeSent,
    });

    // Sync participants
    if (activeGame.bets && activeGame.bets.length > 0 && activeGame.wallets) {
      const bossWallet = await getBossWallet();

      await syncParticipants(
        activeGame.gameRound,
        activeGame.bets.map((b: any) => ({
          walletIndex: b.walletIndex,
          amount: typeof b.amount === "object" ? Number(b.amount.toString()) : b.amount,
          skin: b.skin,
          position: b.position,
        })),
        activeGame.wallets.map((w: any) =>
          typeof w === "string" ? w : w.toBase58?.() || w.toString()
        ),
        bossWallet
      );

      await clearOldParticipants(activeGame.gameRound);

      // Emit participants update via socket
      emitParticipantsUpdate(activeGame.gameRound);
    }

    // Emit game state update
    emitGameStateUpdate({
      roundId: activeGame.gameRound,
      status: activeGame.status === GAME_STATUS.CLOSED ? "finished" : "waiting",
      startTimestamp: activeGame.startDate,
      endTimestamp: activeGame.endDate,
      mapId: activeGame.map,
      betCount: activeGame.bets?.length || 0,
      totalPot: activeGame.totalDeposit,
      winner: activeGame.winner,
    });
  } catch (error) {
    console.error("[GameLoop] Error syncing active game:", error);
  }
}

/**
 * Main game loop tick - runs every cronInterval ms
 */
async function gameLoopTick() {
  console.log("\n[GameLoop] Running game state check...");

  try {
    const solanaClient = getSolanaClient();
    const now = Math.floor(Date.now() / 1000);

    const activeGame = await solanaClient.getActiveGame();
    const gameConfig = await solanaClient.getGameConfig();

    if (!gameConfig) {
      console.log("[GameLoop] Config not found");
      scheduleNextTick();
      return;
    }

    // No active game - check if we should create one
    if (!activeGame) {
      console.log("[GameLoop] No active game found");

      if (!gameConfig.lock) {
        const scheduled = await isActionScheduled(gameConfig.gameRound, "create_game");
        if (!scheduled) {
          console.log(`[GameLoop] Creating game round ${gameConfig.gameRound}...`);
          await executeCreateGameRound();
        }
      }

      scheduleNextTick();
      return;
    }

    // Sync active game state
    await syncActiveGame(activeGame);

    // Game is WAITING (no bets)
    if (activeGame.status === GAME_STATUS.WAITING) {
      console.log(`[GameLoop] Game ${activeGame.gameRound} is WAITING for first bet`);
      scheduleNextTick();
      return;
    }

    // Game is OPEN - schedule or execute end_game
    if (activeGame.status === GAME_STATUS.OPEN) {
      const remaining = Math.max(0, activeGame.endDate - now);

      // Past end time - force end_game
      if (remaining === 0) {
        console.log(`[GameLoop] Game ${activeGame.gameRound} past end time - forcing end_game`);
        await executeEndGame(activeGame.gameRound);
        scheduleNextTick();
        return;
      }

      // Check if jobs already scheduled
      const endGameScheduled = await isActionScheduled(activeGame.gameRound, "end_game");

      if (endGameScheduled) {
        console.log(`[GameLoop] Jobs already scheduled for round ${activeGame.gameRound}, ${remaining}s remaining`);
        scheduleNextTick();
        return;
      }

      // Schedule the entire job chain
      const endGameDelayMs = remaining * 1000;
      const sendPrizeDelayMs = endGameDelayMs + GAME_TIMING.SEND_PRIZE_DELAY;
      const createGameDelayMs = sendPrizeDelayMs + GAME_TIMING.CREATE_GAME_DELAY;

      console.log(`[GameLoop] Scheduling job chain for round ${activeGame.gameRound}:`);
      console.log(`  - end_game in ${Math.round(endGameDelayMs / 1000)}s`);
      console.log(`  - send_prize in ${Math.round(sendPrizeDelayMs / 1000)}s`);
      console.log(`  - create_game in ${Math.round(createGameDelayMs / 1000)}s`);

      // Schedule end_game
      setTimeout(() => executeEndGame(activeGame.gameRound), endGameDelayMs);
      await upsertScheduledJob({
        jobId: `end_game_${activeGame.gameRound}_${Date.now()}`,
        roundId: activeGame.gameRound,
        action: "end_game",
        scheduledTime: activeGame.endDate,
      });

      // Schedule send_prize
      setTimeout(() => executeSendPrize(activeGame.gameRound), sendPrizeDelayMs);
      await upsertScheduledJob({
        jobId: `send_prize_${activeGame.gameRound}_${Date.now()}`,
        roundId: activeGame.gameRound,
        action: "send_prize",
        scheduledTime: activeGame.endDate + GAME_TIMING.SEND_PRIZE_DELAY / 1000,
      });

      // Schedule create_game
      setTimeout(() => executeCreateGameRound(), createGameDelayMs);
      await upsertScheduledJob({
        jobId: `create_game_${activeGame.gameRound + 1}_${Date.now()}`,
        roundId: activeGame.gameRound + 1,
        action: "create_game",
        scheduledTime:
          activeGame.endDate +
          (GAME_TIMING.SEND_PRIZE_DELAY + GAME_TIMING.CREATE_GAME_DELAY) / 1000,
      });

      console.log(`[GameLoop] All jobs scheduled for round ${activeGame.gameRound}`);
      scheduleNextTick();
      return;
    }

    // Game is CLOSED - recovery checks
    if (activeGame.status === GAME_STATUS.CLOSED) {
      // Check if prize needs sending
      if (activeGame.winnerPrize > 0 && activeGame.winner) {
        const sendPrizeScheduled = await isActionScheduled(activeGame.gameRound, "send_prize");
        if (!sendPrizeScheduled) {
          console.log(`[GameLoop] RECOVERY: Scheduling send_prize for round ${activeGame.gameRound}`);
          setTimeout(() => executeSendPrize(activeGame.gameRound), 0);
          await upsertScheduledJob({
            jobId: `send_prize_recovery_${activeGame.gameRound}_${Date.now()}`,
            roundId: activeGame.gameRound,
            action: "send_prize",
            scheduledTime: now,
          });
        }
      }

      // Check if next game needs creating
      const createGameScheduled = await isActionScheduled(
        activeGame.gameRound + 1,
        "create_game"
      );
      if (!createGameScheduled) {
        console.log(`[GameLoop] RECOVERY: Creating round ${activeGame.gameRound + 1}`);
        setTimeout(() => executeCreateGameRound(), 0);
        await upsertScheduledJob({
          jobId: `create_game_recovery_${activeGame.gameRound + 1}_${Date.now()}`,
          roundId: activeGame.gameRound + 1,
          action: "create_game",
          scheduledTime: now,
        });
      }
    }

    // Process past ended games needing prize
    const finishedGames = await getFinishedGamesNeedingPrize(5);
    for (const game of finishedGames) {
      const scheduled = await isActionScheduled(game.roundId, "send_prize");
      if (!scheduled) {
        console.log(`[GameLoop] Scheduling prize for historical round ${game.roundId}`);
        setTimeout(() => executeSendPrize(game.roundId), 0);
        await upsertScheduledJob({
          jobId: `send_prize_hist_${game.roundId}_${Date.now()}`,
          roundId: game.roundId,
          action: "send_prize",
          scheduledTime: now,
        });
      }
    }
  } catch (error) {
    console.error("[GameLoop] Error:", error);
  }

  scheduleNextTick();
}

function scheduleNextTick() {
  setTimeout(gameLoopTick, GAME_TIMING.CRON_INTERVAL);
}

/**
 * Bootstrap game loop from DB state
 */
export async function bootstrapGameLoop() {
  console.log("[GameLoop] Bootstrapping game loop...");

  // Cleanup old jobs
  await cleanupOldJobs();

  // Start the main tick
  gameLoopTick();

  console.log(`[GameLoop] Started (interval: ${GAME_TIMING.CRON_INTERVAL / 1000}s)`);
}
