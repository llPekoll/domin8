import { query } from "./_generated/server";
import { v } from "convex/values";

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
    const totalSOL = totalLamports / 1_000_000_000;

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

    const totalSOL = totalLamports / 1_000_000_000;
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
      dailySOL[date] = lamports / 1_000_000_000;
    }

    const totalSOL = totalLamports / 1_000_000_000;

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

    const totalSOL = totalLamports / 1_000_000_000;
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
    // Query all finished games, ordered by roundId descending
    const finishedGames = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .order("desc")
      .collect();

    if (finishedGames.length === 0) {
      return null;
    }

    // Filter to only games with valid bet data
    const validGames = finishedGames.filter(
      (game) =>
        game.winner &&
        game.winningBetIndex !== undefined &&
        game.betSkin &&
        game.betSkin.length > 0 &&
        game.betAmounts &&
        game.betAmounts.length > 0
    );

    if (validGames.length === 0) {
      return null;
    }

    // Get the most recent finished game with valid data (highest roundId)
    const lastGame = validGames.reduce((latest, current) => {
      return current.roundId > latest.roundId ? current : latest;
    }, validGames[0]);

    // Get the winning bet details (we know these exist from the filter above)
    const winningBetIndex = lastGame.winningBetIndex!; // Non-null assertion - we filtered for this
    const winningBet = lastGame.betSkin![winningBetIndex];
    const winningAmount = lastGame.betAmounts![winningBetIndex];

    // Calculate prize (95% of total pot)
    const prizeAmount = lastGame.totalPot ? lastGame.totalPot * 0.95 : 0;
    const prizeSOL = prizeAmount / 1_000_000_000;

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
      characterId: winningBet,
      characterName: character?.name || "Unknown",
      characterAssetPath: character?.assetPath || null,
      prizeAmount: prizeSOL,
      betAmount: winningAmount ? winningAmount / 1_000_000_000 : 0,
      totalPot: lastGame.totalPot ? lastGame.totalPot / 1_000_000_000 : 0,
      endTimestamp: lastGame.endTimestamp,
    };
  },
});
