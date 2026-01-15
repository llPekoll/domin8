/**
 * Debug Actions - Manual triggers for game progression
 *
 * Use from Convex Dashboard → Functions → Run
 */
"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { SolanaClient } from "./lib/solana";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899";
const CRANK_AUTHORITY_PRIVATE_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";

/**
 * Get current game state from blockchain
 */
export const getGameState = internalAction({
  args: {},
  handler: async () => {
    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

    const config = await solanaClient.getGameConfig();
    const activeGame = await solanaClient.getActiveGame();

    return {
      config: config ? {
        gameRound: config.gameRound,
        lock: config.lock,
        roundTime: config.roundTime,
        minBet: config.minDepositAmount,
        maxBet: config.maxDepositAmount,
        houseFee: config.houseFee,
      } : null,
      activeGame: activeGame ? {
        roundId: activeGame.gameRound,
        status: activeGame.status,
        statusLabel: activeGame.status === 0 ? "OPEN" : activeGame.status === 1 ? "CLOSED" : "WAITING",
        betCount: activeGame.bets?.length || 0,
        totalPot: activeGame.totalDeposit,
        startDate: activeGame.startDate ? new Date(activeGame.startDate * 1000).toISOString() : null,
        endDate: activeGame.endDate ? new Date(activeGame.endDate * 1000).toISOString() : null,
        winner: activeGame.winner,
        winnerPrize: activeGame.winnerPrize,
      } : null,
    };
  },
});

/**
 * Create a new game round
 */
export const createGameRound = internalAction({
  args: {
    mapId: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    console.log("[Debug] Creating game round...");

    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

    // Get next round ID from config
    const config = await solanaClient.getGameConfig();
    if (!config) {
      return { success: false, error: "Config not found" };
    }

    if (config.lock) {
      return { success: false, error: "System is locked - game already in progress" };
    }

    const roundId = config.gameRound;
    const mapId = args.mapId ?? (Math.random() < 0.5 ? 1 : 2);

    console.log(`[Debug] Creating round ${roundId} with map ${mapId}...`);

    const result = await solanaClient.createGameRound(roundId, mapId);
    const confirmed = await solanaClient.confirmTransaction(result.signature);

    return {
      success: confirmed,
      roundId,
      mapId,
      signature: result.signature,
    };
  },
});

/**
 * End a game round (triggers VRF for multi-player)
 */
export const endGame = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (_ctx, { roundId }) => {
    console.log(`[Debug] Ending game round ${roundId}...`);

    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

    // Check game state first
    const game = await solanaClient.getGameRound(roundId);
    if (!game) {
      return { success: false, error: `Game round ${roundId} not found` };
    }

    console.log(`[Debug] Game state: status=${game.status}, bets=${game.bets?.length}, winner=${game.winner}`);

    if (game.status === 1) {
      return { success: false, error: "Game already closed", winner: game.winner };
    }

    const result = await solanaClient.endGame(roundId);
    const confirmed = await solanaClient.confirmTransaction(result.signature);

    // Wait and check for winner
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const updatedGame = await solanaClient.getGameRound(roundId);

    return {
      success: confirmed,
      roundId,
      signature: result.signature,
      gameStatus: updatedGame?.status,
      winner: updatedGame?.winner,
      winnerPrize: updatedGame?.winnerPrize,
      note: updatedGame?.winner ? "Winner selected!" : "VRF pending - run endGame again in 3s",
    };
  },
});

/**
 * Send prize to winner
 */
export const sendPrize = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (_ctx, { roundId }) => {
    console.log(`[Debug] Sending prize for round ${roundId}...`);

    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);

    // Check game state first
    const game = await solanaClient.getGameRound(roundId);
    if (!game) {
      return { success: false, error: `Game round ${roundId} not found` };
    }

    console.log(`[Debug] Game state: status=${game.status}, winner=${game.winner}, prize=${game.winnerPrize}`);

    if (game.status !== 1) {
      return { success: false, error: `Game not closed yet (status: ${game.status})` };
    }

    if (!game.winner) {
      return { success: false, error: "No winner determined" };
    }

    if (game.winnerPrize === 0) {
      return { success: false, error: "Prize already sent" };
    }

    const result = await solanaClient.sendPrizeWinner(roundId);
    const confirmed = await solanaClient.confirmTransaction(result.signature);

    return {
      success: confirmed,
      roundId,
      signature: result.signature,
      winner: game.winner,
      prize: game.winnerPrize,
    };
  },
});

/**
 * Get specific game round by ID
 */
export const getGameRound = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (_ctx, { roundId }) => {
    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
    const game = await solanaClient.getGameRound(roundId);

    if (!game) {
      return { success: false, error: `Game round ${roundId} not found` };
    }

    return {
      success: true,
      roundId: game.gameRound,
      status: game.status,
      statusLabel: game.status === 0 ? "OPEN" : game.status === 1 ? "CLOSED" : "WAITING",
      betCount: game.bets?.length || 0,
      totalPot: game.totalDeposit,
      startDate: game.startDate ? new Date(game.startDate * 1000).toISOString() : null,
      endDate: game.endDate ? new Date(game.endDate * 1000).toISOString() : null,
      winner: game.winner,
      winnerPrize: game.winnerPrize,
      bets: game.bets?.map((b, i) => ({
        index: i,
        amount: b.amount,
        skin: b.skin,
        position: b.position,
      })),
    };
  },
});

/**
 * Full game cycle: end_game → send_prize (with VRF retry)
 */
export const completeGame = internalAction({
  args: {
    roundId: v.number(),
  },
  handler: async (_ctx, { roundId }) => {
    console.log(`[Debug] Running full game completion for round ${roundId}...`);

    const solanaClient = new SolanaClient(RPC_ENDPOINT, CRANK_AUTHORITY_PRIVATE_KEY);
    const results: any[] = [];

    // Step 1: End game (may need multiple calls for VRF)
    let game = await solanaClient.getGameRound(roundId);
    if (!game) {
      return { success: false, error: `Game round ${roundId} not found` };
    }

    let attempts = 0;
    while (game && game.status !== 1 && attempts < 5) {
      attempts++;
      console.log(`[Debug] End game attempt ${attempts}...`);

      try {
        const result = await solanaClient.endGame(roundId);
        await solanaClient.confirmTransaction(result.signature);
        results.push({ step: "end_game", attempt: attempts, signature: result.signature });
      } catch (e: any) {
        results.push({ step: "end_game", attempt: attempts, error: e.message });
      }

      // Wait for VRF callback
      await new Promise((resolve) => setTimeout(resolve, 3000));
      game = await solanaClient.getGameRound(roundId);

      if (game?.status === 1) {
        console.log(`[Debug] Game closed after ${attempts} attempts`);
        break;
      }
    }

    if (game?.status !== 1) {
      return { success: false, error: "Failed to close game after 5 attempts", results };
    }

    // Step 2: Send prize
    if (game.winner && game.winnerPrize > 0) {
      console.log(`[Debug] Sending prize to ${game.winner}...`);

      try {
        const result = await solanaClient.sendPrizeWinner(roundId);
        await solanaClient.confirmTransaction(result.signature);
        results.push({ step: "send_prize", signature: result.signature, winner: game.winner, prize: game.winnerPrize });
      } catch (e: any) {
        results.push({ step: "send_prize", error: e.message });
        return { success: false, error: "Failed to send prize", results };
      }
    } else {
      results.push({ step: "send_prize", skipped: true, reason: "No prize to send" });
    }

    return {
      success: true,
      roundId,
      results,
    };
  },
});
