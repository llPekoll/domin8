/**
 * Sync Service Mutations - Database operations for blockchain sync
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert game state from blockchain to database
 * Creates or updates the game round in Convex (uses gameRoundStates table)
 */
export const upsertGameState = internalMutation({
  args: {
    gameRound: v.object({
      gameRound: v.number(),
      startDate: v.number(),
      endDate: v.number(),
      totalDeposit: v.number(),
      rand: v.string(), // Changed to string to avoid BN overflow
      map: v.number(), // Map/background ID (0-255)
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
      // Computed properties for backward compatibility
      roundId: v.optional(v.number()),
      startTimestamp: v.optional(v.number()),
      endTimestamp: v.optional(v.number()),
      totalPot: v.optional(v.number()),
      betCount: v.optional(v.number()),
      betAmounts: v.optional(v.array(v.number())),
      betSkin: v.optional(v.array(v.number())),
      betPosition: v.optional(v.array(v.array(v.number()))),
    }),
  },
  handler: async (ctx, { gameRound }) => {
    const { db } = ctx;

    const roundId = gameRound.roundId || gameRound.gameRound;

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
          startTimestamp: gameRound.startTimestamp || gameRound.startDate,
          endTimestamp: gameRound.endTimestamp || gameRound.endDate,
          totalPot: gameRound.totalPot || gameRound.totalDeposit,
          betCount: gameRound.betCount || gameRound.bets.length,
          mapId,
          winner: null, // No winner during waiting phase
          winningBetIndex: 0,
          betAmounts: gameRound.betAmounts || gameRound.bets.map((b) => b.amount),
          betSkin: gameRound.betSkin || gameRound.bets.map((b) => b.skin),
          betPosition: gameRound.betPosition || gameRound.bets.map((b) => b.position),
          vrfRequestPubkey: null,
          vrfSeed: [],
          randomnessFulfilled: false, // Not fulfilled during waiting
          capturedAt: gameRound.startTimestamp || gameRound.startDate, // Use start time
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
      startTimestamp: gameRound.startTimestamp || gameRound.startDate,
      endTimestamp: gameRound.endTimestamp || gameRound.endDate,
      totalPot: gameRound.totalPot || gameRound.totalDeposit,
      betCount: gameRound.betCount || gameRound.bets.length,
      mapId, // Map reference from blockchain map field
      winner: gameRound.winner,
      winningBetIndex: gameRound.winningBetIndex || 0,
      // Store bets data
      betAmounts: gameRound.betAmounts || gameRound.bets.map((b) => b.amount),
      betSkin: gameRound.betSkin || gameRound.bets.map((b) => b.skin),
      betPosition: gameRound.betPosition || gameRound.bets.map((b) => b.position),
      // VRF data (simplified for risk architecture)
      vrfRequestPubkey: null,
      vrfSeed: [],
      randomnessFulfilled: gameRound.status === 1, // True if game is closed
      capturedAt: Math.floor(Date.now() / 1000),
    };

    if (existingState) {
      // Update existing state
      await db.patch(existingState._id, gameData);
      console.log(`[Sync Mutations] Updated game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    } else {
      // Create new state
      await db.insert("gameRoundStates", gameData);
      console.log(`[Sync Mutations] Created game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    }
  },
});
