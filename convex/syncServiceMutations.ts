/**
 * Sync Service Mutations - Database operations for blockchain sync
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { type GameRound } from "./lib/types";

/**
 * Upsert game state from blockchain to database
 * Creates or updates the game round in Convex (uses gameRoundStates table)
 */
export const upsertGameState = internalMutation({
  args: {
    gameRound: v.object({
      roundId: v.number(),
      startTimestamp: v.number(),
      endTimestamp: v.number(),
      totalDeposit: v.number(),
      rand: v.string(),
      map: v.number(),
      userCount: v.number(),
      force: v.array(v.number()),
      status: v.number(),
      winner: v.union(v.string(), v.null()),
      winnerPrize: v.number(),
      winningBetIndex: v.union(v.number(), v.null()),
      wallets: v.array(v.string()),
      bets: v.array(
        v.object({
          walletIndex: v.number(),
          amount: v.number(),
          skin: v.number(),
          position: v.array(v.number()),
        })
      ),
      prizeSent: v.boolean(),
    }),
  },
  handler: async (ctx, { gameRound }) => {
    const { db } = ctx;

    const roundId = gameRound.roundId;

    // Convert status: 0 = "waiting" (open), 1 = "finished" (closed)
    const status = gameRound.status === 0 ? "waiting" : "finished";

    // Look up the map by its integer ID
    let mapId = undefined;
    if (gameRound.map !== undefined) {
      const mapDoc = await db
        .query("maps")
        .filter((q) => q.eq(q.field("id"), gameRound.map))
        .first();
      if (mapDoc) {
        mapId = mapDoc._id;
      } else {
        console.warn(`[Sync Mutations] Map with id ${gameRound.map} not found in database`);
      }
    }

    // BACKFILL LOGIC: If this is a "finished" game, ensure we have a "waiting" state
    if (status === "finished") {
      const waitingState = await db
        .query("gameRoundStates")
        .withIndex("by_round_and_status", (q) => q.eq("roundId", roundId).eq("status", "waiting"))
        .first();

      if (!waitingState) {
        console.log(`[Sync Mutations] Backfilling missing "waiting" state for round ${roundId}`);

        // Create the missing "waiting" state using game start data
        await db.insert("gameRoundStates", {
          roundId,
          status: "waiting",
          startTimestamp: gameRound.startTimestamp ,
          endTimestamp: gameRound.endTimestamp,
          capturedAt: gameRound.startTimestamp,
          mapId,
          betCount: gameRound.bets.length,
          betAmounts: gameRound.bets.map((b) => b.amount),
          betSkin: gameRound.bets.map((b) => b.skin),
          betPosition: gameRound.bets.map((b) => b.position),
          totalPot: gameRound.totalDeposit,
          winner: null, // No winner during waiting phase
          winningBetIndex: 0,
          prizeSent: false, // No prize sent during waiting phase
        });

        console.log(`[Sync Mutations] ✅ Created backfilled "waiting" state for round ${roundId}`);
      }
    }

    // Check if game state already exists for this round and status
    const existingState = await db
      .query("gameRoundStates")
      .withIndex("by_round_and_status", (q) => q.eq("roundId", roundId).eq("status", status))
      .first();

    const gameData = {
      roundId,
      status,
      startTimestamp: gameRound.startTimestamp,
      endTimestamp: gameRound.endTimestamp,
      capturedAt: Math.floor(Date.now() / 1000),
      mapId, // Map reference from blockchain map field
      betCount: gameRound.bets.length,
      betAmounts: gameRound.bets.map((b) => b.amount),
      betSkin: gameRound.bets.map((b) => b.skin),
      betPosition:  gameRound.bets.map((b) => b.position),
      totalPot: gameRound.totalDeposit,
      winner: gameRound.winner,
      winningBetIndex: gameRound.winningBetIndex ?? 0,
      prizeSent: gameRound.prizeSent ?? false, // Use provided value or default to false
    };

    // Do not update if the existing state is finished as the data is final
    if (existingState && existingState.status === "waiting") {
      // Update existing state
      await db.patch(existingState._id, gameData);
      console.log(`[Sync Mutations] Updated game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    } else if (!existingState) {
      // Create new state
      await db.insert("gameRoundStates", gameData);
      console.log(`[Sync Mutations] Created game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    }
  },
});

/**
 * Query to find ended games still in "waiting" status
 * Returns games where endTimestamp < currentTime and status = "waiting"
 */
export const getEndedWaitingGames = internalQuery({
  args: {
    currentTime: v.number(),
  },
  handler: async (ctx, { currentTime }) => {
    const { db } = ctx;

    // Find all games in "waiting" status that have passed their end time
    const endedGames = await db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .filter((q) => q.lt(q.field("endTimestamp"), currentTime))
      .collect();

    // Return simplified game data
    return endedGames.map((game) => ({
      _id: game._id,
      roundId: game.roundId,
      endTimestamp: game.endTimestamp,
      startTimestamp: game.startTimestamp,
      betCount: game.betCount,
      totalPot: game.totalPot,
    }));
  },
});

/**
 * Query to find finished games (for prize distribution check)
 * Returns games in "finished" status, ordered by most recent first
 */
export const getFinishedGames = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, { limit }) => {
    const { db } = ctx;

    // Find all games in "finished" status, ordered by roundId descending (most recent first)
    const finishedGames = await db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .order("desc")
      .take(limit);

    // Return simplified game data
    return finishedGames.map((game) => ({
      _id: game._id,
      roundId: game.roundId,
      endTimestamp: game.endTimestamp,
      startTimestamp: game.startTimestamp,
      betCount: game.betCount,
      totalPot: game.totalPot,
      winner: game.winner,
    }));
  },
});

/**
 * Query to find finished games that need prize distribution
 * Returns games in "finished" status with prizeSent = false
 */
export const getFinishedGamesNeedingPrize = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, { limit }) => {
    const { db } = ctx;

    // Find all games in "finished" status with prizeSent = false
    const finishedGames = await db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .filter((q) => q.eq(q.field("prizeSent"), false))
      .order("desc")
      .take(limit);

    // Return simplified game data
    return finishedGames.map((game) => ({
      _id: game._id,
      roundId: game.roundId,
      endTimestamp: game.endTimestamp,
      startTimestamp: game.startTimestamp,
      betCount: game.betCount,
      totalPot: game.totalPot,
      winner: game.winner,
      prizeSent: game.prizeSent,
    }));
  },
});
