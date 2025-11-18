import { query } from "./_generated/server";
import { v } from "convex/values";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Get total SOL betted on a specific day
 * @param date - Optional date in format "YYYY-MM-DD". Defaults to today.
 * @returns Total SOL betted on that day
 */
export const getTotalBettedForDay = query({
  args: {
    date: v.optional(v.string()), // Format: "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    // Parse the target date or use today
    let targetDate: Date;
    if (args.date) {
      targetDate = new Date(args.date);
    } else {
      targetDate = new Date();
    }

    // Get start and end of day in Unix timestamp (seconds)
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    const endTimestamp = Math.floor(endOfDay.getTime() / 1000);

    // Query all game rounds that started on this day
    const gameRounds = await ctx.db
      .query("gameRoundStates")
      .filter((q) =>
        q.and(
          q.gte(q.field("startTimestamp"), startTimestamp),
          q.lte(q.field("startTimestamp"), endTimestamp)
        )
      )
      .collect();

    // Calculate total pot in lamports
    let totalLamports = 0;
    const processedRounds = new Set<number>(); // Track unique rounds

    for (const round of gameRounds) {
      // Only count each round once (avoid counting multiple states for same round)
      if (!processedRounds.has(round.roundId)) {
        processedRounds.add(round.roundId);
        totalLamports += round.totalPot || 0;
      }
    }

    // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
    const totalSOL = totalLamports / LAMPORTS_PER_SOL;

    return {
      date: targetDate.toISOString().split("T")[0],
      totalSOL: totalSOL,
      totalLamports: totalLamports,
      gamesCount: processedRounds.size,
      startTimestamp: startTimestamp,
      endTimestamp: endTimestamp,
    };
  },
});

/**
 * Get betting statistics for current day
 */
export const getTodayStats = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);

    // Query all game rounds that started today
    const gameRounds = await ctx.db
      .query("gameRoundStates")
      .filter((q) => q.gte(q.field("startTimestamp"), startTimestamp))
      .collect();

    // Calculate statistics
    let totalLamports = 0;
    let totalBets = 0;
    const processedRounds = new Set<number>();

    for (const round of gameRounds) {
      if (!processedRounds.has(round.roundId)) {
        processedRounds.add(round.roundId);
        totalLamports += round.totalPot || 0;
        totalBets += round.betCount || 0;
      }
    }

    const totalSOL = totalLamports / LAMPORTS_PER_SOL;
    const averagePerGame = processedRounds.size > 0 ? totalSOL / processedRounds.size : 0;
    const averagePerBet = totalBets > 0 ? totalSOL / totalBets : 0;

    return {
      date: now.toISOString().split("T")[0],
      totalSOL: totalSOL,
      totalLamports: totalLamports,
      gamesCount: processedRounds.size,
      totalBets: totalBets,
      averagePerGame: averagePerGame,
      averagePerBet: averagePerBet,
    };
  },
});

/**
 * Get betting statistics for a date range
 */
export const getStatsForDateRange = query({
  args: {
    startDate: v.string(), // Format: "YYYY-MM-DD"
    endDate: v.string(), // Format: "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const startDate = new Date(args.startDate);
    startDate.setHours(0, 0, 0, 0);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    const endDate = new Date(args.endDate);
    endDate.setHours(23, 59, 59, 999);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    // Query all game rounds in the date range
    const gameRounds = await ctx.db
      .query("gameRoundStates")
      .filter((q) =>
        q.and(
          q.gte(q.field("startTimestamp"), startTimestamp),
          q.lte(q.field("startTimestamp"), endTimestamp)
        )
      )
      .collect();

    // Calculate statistics
    let totalLamports = 0;
    let totalBets = 0;
    const processedRounds = new Set<number>();
    const dailyStats: { [date: string]: number } = {};

    for (const round of gameRounds) {
      if (!processedRounds.has(round.roundId)) {
        processedRounds.add(round.roundId);
        totalLamports += round.totalPot || 0;
        totalBets += round.betCount || 0;

        // Track daily breakdown
        const roundDate = new Date(round.startTimestamp * 1000).toISOString().split("T")[0];
        dailyStats[roundDate] = (dailyStats[roundDate] || 0) + (round.totalPot || 0);
      }
    }

    // Convert daily stats to SOL
    const dailySOL: { [date: string]: number } = {};
    for (const [date, lamports] of Object.entries(dailyStats)) {
      dailySOL[date] = lamports / LAMPORTS_PER_SOL;
    }

    const totalSOL = totalLamports / LAMPORTS_PER_SOL;

    return {
      startDate: args.startDate,
      endDate: args.endDate,
      totalSOL: totalSOL,
      totalLamports: totalLamports,
      gamesCount: processedRounds.size,
      totalBets: totalBets,
      dailyBreakdown: dailySOL,
    };
  },
});

/**
 * Get all-time betting statistics
 */
export const getAllTimeStats = query({
  args: {},
  handler: async (ctx) => {
    // Query all game rounds
    const gameRounds = await ctx.db.query("gameRoundStates").collect();

    // Calculate statistics
    let totalLamports = 0;
    let totalBets = 0;
    const processedRounds = new Set<number>();

    for (const round of gameRounds) {
      if (!processedRounds.has(round.roundId)) {
        processedRounds.add(round.roundId);
        totalLamports += round.totalPot || 0;
        totalBets += round.betCount || 0;
      }
    }

    const totalSOL = totalLamports / LAMPORTS_PER_SOL;
    const averagePerGame = processedRounds.size > 0 ? totalSOL / processedRounds.size : 0;
    const averagePerBet = totalBets > 0 ? totalSOL / totalBets : 0;

    return {
      totalSOL: totalSOL,
      totalLamports: totalLamports,
      gamesCount: processedRounds.size,
      totalBets: totalBets,
      averagePerGame: averagePerGame,
      averagePerBet: averagePerBet,
    };
  },
});

/**
 * Get the last finished game round with winner information
 * Returns the most recent completed game with winner details
 */
export const getLastFinishedGame = query({
  args: {},
  handler: async (ctx) => {
    // Query finished games, ordered by roundId descending using compound index
    const finishedGames = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status_and_round", (q) => q.eq("status", "finished"))
      .order("desc")
      .take(20); // Only fetch recent games for efficiency

    if (finishedGames.length === 0) {
      return null;
    }

    // Current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    // Minimum delay before showing a finished game (15 seconds for celebration phase)
    const MIN_DISPLAY_DELAY = 15;

    // Find the first valid game with a winner that ended at least 15 seconds ago
    // This prevents spoiling the winner during the celebration phase
    const lastGame = finishedGames.find(
      (game) =>
        game.winner &&
        game.winningBetIndex !== undefined &&
        game.totalPot &&
        game.totalPot > 0 &&
        currentTime - game.endTimestamp >= MIN_DISPLAY_DELAY
    );

    if (!lastGame) {
      return null;
    }

    // Get the winning bet details - handle case where bet arrays might be empty
    const winningBetIndex = lastGame.winningBetIndex!;
    let hasBetData = lastGame.betSkin && lastGame.betSkin.length > winningBetIndex;
    let winningBet = hasBetData ? lastGame.betSkin![winningBetIndex] : undefined;
    let winningAmount =
      lastGame.betAmounts && lastGame.betAmounts.length > winningBetIndex
        ? lastGame.betAmounts![winningBetIndex]
        : undefined;

    // If bet data is missing from finished state, try to get it from the waiting state
    if (!hasBetData || winningAmount === undefined) {
      const waitingState = await ctx.db
        .query("gameRoundStates")
        .withIndex("by_round_and_status", (q) => q.eq("roundId", lastGame.roundId).eq("status", "waiting"))
        .first();

      if (waitingState) {
        if (!hasBetData && waitingState.betSkin && waitingState.betSkin.length > winningBetIndex) {
          winningBet = waitingState.betSkin[winningBetIndex];
          hasBetData = true;
        }
        if (winningAmount === undefined && waitingState.betAmounts && waitingState.betAmounts.length > winningBetIndex) {
          winningAmount = waitingState.betAmounts[winningBetIndex];
        }
      }
    }

    // Final fallback for winning amount
    if (winningAmount === undefined) {
      winningAmount = lastGame.totalPot! / (lastGame.betCount || 1);
    }

    // Calculate prize (95% of total pot)
    const prizeAmount = lastGame.totalPot ? lastGame.totalPot * 0.95 : 0;
    const prizeSOL = prizeAmount / LAMPORTS_PER_SOL;

    // Get the character info
    const character =
      winningBet !== undefined
        ? await ctx.db
            .query("characters")
            .filter((q) => q.eq(q.field("id"), winningBet))
            .first()
        : null;

    return {
      roundId: lastGame.roundId,
      winnerAddress: lastGame.winner,
      characterId: winningBet ?? 1, // Default to character 1 if not available
      characterName: character?.name || "Unknown",
      characterAssetPath: character?.assetPath || null,
      prizeAmount: prizeSOL,
      betAmount: winningAmount ? winningAmount / LAMPORTS_PER_SOL : 0,
      totalPot: lastGame.totalPot ? lastGame.totalPot / LAMPORTS_PER_SOL : 0,
      endTimestamp: lastGame.endTimestamp,
    };
  },
});
