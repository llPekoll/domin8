/**
 * Sync Service Mutations - Database operations for blockchain sync
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { GAME_STATUS } from "./constants";

/**
 * Upsert game state from blockchain to database
 * Creates or updates the game round in Convex (uses gameRoundStates table)
 */
export const upsertGameState = internalMutation({
  args: {
    gameRound: v.object({
      // Round identification
      roundId: v.number(),
      status: v.number(), // Blockchain status (0 = waiting, 1 = finished)

      // Timestamps
      startTimestamp: v.number(),
      endTimestamp: v.number(),

      // Game configuration
      map: v.optional(v.number()), // Map ID from blockchain

      // Game state
      betCount: v.optional(v.number()),
      betAmounts: v.optional(v.array(v.number())),
      betSkin: v.optional(v.array(v.number())),
      betPosition: v.optional(v.array(v.array(v.number()))),
      betWalletIndex: v.optional(v.array(v.number())),
      wallets: v.optional(v.array(v.string())),
      totalPot: v.optional(v.number()),
      winner: v.optional(v.union(v.string(), v.null())),
      winningBetIndex: v.optional(v.number()),

      prizeSent: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { gameRound }) => {
    const { db } = ctx;

    const roundId = gameRound.roundId;

    // Convert blockchain status to database format
    // GAME_STATUS: OPEN=0, CLOSED=1, WAITING=2
    const statusMap: Record<number, string> = {
      [GAME_STATUS.OPEN]: "waiting",      // OPEN (has bets) → "waiting" in DB
      [GAME_STATUS.CLOSED]: "finished",   // CLOSED (ended) → "finished" in DB
      [GAME_STATUS.WAITING]: "waiting",   // WAITING (no bets) → "waiting" in DB
    };
    const status = statusMap[gameRound.status] ?? "waiting";

    // Store map ID directly from blockchain (no lookup needed)
    const mapId = gameRound.map;

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
          startTimestamp: gameRound.startTimestamp,
          endTimestamp: gameRound.endTimestamp,
          capturedAt: gameRound.startTimestamp,
          mapId,
          betCount: gameRound.betCount,
          betAmounts: gameRound.betAmounts,
          betSkin: gameRound.betSkin,
          betPosition: gameRound.betPosition,
          betWalletIndex: gameRound.betWalletIndex,
          wallets: gameRound.wallets,
          totalPot: gameRound.totalPot,
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
      betCount: gameRound.betCount,
      betAmounts: gameRound.betAmounts,
      betSkin: gameRound.betSkin,
      betPosition: gameRound.betPosition,
      betWalletIndex: gameRound.betWalletIndex,
      wallets: gameRound.wallets,
      totalPot: gameRound.totalPot,
      winner: gameRound.winner,
      winningBetIndex: gameRound.winningBetIndex ?? 0,
      prizeSent: gameRound.prizeSent ?? false, // Use provided value or default to false
    };

    // Do not update if the existing state is finished as the data is final
    if (existingState && existingState.status === "waiting") {
      // Update existing state
      await db.patch(existingState._id, gameData);
      console.log(`[Sync Mutations] Updated game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    } else if (existingState && existingState.status === "finished" && existingState.prizeSent === false && gameData.prizeSent === true) {
      // Update existing finished state only if prizeSent is changing from false to true
      await db.patch(existingState._id, {
        prizeSent: true,
      });
      console.log(`[Sync Mutations] Updated game ${roundId} prizeSent to true (status: ${status}, map: ${gameRound.map})`);
    } else if (!existingState) {
      // Create new state
      await db.insert("gameRoundStates", gameData);
      console.log(`[Sync Mutations] Created game ${roundId} (status: ${status}, map: ${gameRound.map})`);
    }
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

/**
 * Query to get the current (most recent) game state
 * Used by bot executor to check if betting is open
 */
export const getCurrentGameState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { db } = ctx;

    // Get the most recent game in "waiting" status (active game)
    const activeGame = await db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .order("desc")
      .first();

    if (!activeGame) {
      return null;
    }

    // Convert database status to blockchain status
    // Database: "waiting" = betting open, "finished" = game ended
    // Blockchain: OPEN=0, CLOSED=1, WAITING=2
    const status = activeGame.status === "waiting" ? 0 : 1;

    return {
      roundId: activeGame.roundId,
      status,
      startTimestamp: activeGame.startTimestamp,
      endTimestamp: activeGame.endTimestamp,
      mapId: activeGame.mapId,
      betCount: activeGame.betCount,
      totalPot: activeGame.totalPot,
      winner: activeGame.winner,
      prizeSent: activeGame.prizeSent,
    };
  },
});

/**
 * Sync participants from blockchain game state
 * Called by syncService when game state is updated
 *
 * Handles:
 * - Boss: ONE entry (locked character, betAmount = sum of all bets)
 * - Non-boss: ONE entry PER BET (each bet = separate character)
 */
export const syncParticipants = internalMutation({
  args: {
    gameRound: v.number(),
    bets: v.array(v.object({
      walletIndex: v.number(),
      amount: v.number(), // In lamports
      skin: v.number(),
      position: v.array(v.number()),
    })),
    wallets: v.array(v.string()),
    bossWallet: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { gameRound, bets, wallets, bossWallet }) => {
    const { db } = ctx;

    if (!bets || bets.length === 0 || !wallets || wallets.length === 0) {
      console.log(`[Sync Participants] No bets to sync for round ${gameRound}`);
      return { synced: 0 };
    }

    console.log(`[Sync Participants] Syncing ${bets.length} bets for round ${gameRound}, bossWallet: ${bossWallet?.slice(0, 8)}...`);

    // Track boss's total bet amount
    let bossTotalBet = 0;
    let bossFirstBetIndex = -1;

    // First pass: calculate boss total if boss is in this game
    if (bossWallet) {
      bets.forEach((bet, betIndex) => {
        const walletAddress = wallets[bet.walletIndex];
        if (walletAddress === bossWallet) {
          bossTotalBet += bet.amount;
          if (bossFirstBetIndex === -1) {
            bossFirstBetIndex = betIndex;
          }
        }
      });
      if (bossTotalBet > 0) {
        console.log(`[Sync Participants] Boss total bet: ${bossTotalBet / 1_000_000_000} SOL`);
      }
    }

    let syncedCount = 0;

    // Process each bet
    for (let betIndex = 0; betIndex < bets.length; betIndex++) {
      const bet = bets[betIndex];
      const walletAddress = wallets[bet.walletIndex];

      if (!walletAddress) {
        console.warn(`[Sync Participants] No wallet for bet index ${betIndex}`);
        continue;
      }

      const isBoss = walletAddress === bossWallet;

      // For boss: only create ONE participant (skip subsequent bets)
      if (isBoss && betIndex !== bossFirstBetIndex) {
        // Update boss's total bet amount if participant already exists
        const bossOdid = walletAddress;
        const existingBoss = await db
          .query("currentGameParticipants")
          .withIndex("by_odid", (q) => q.eq("odid", bossOdid))
          .first();

        if (existingBoss) {
          await db.patch(existingBoss._id, {
            betAmount: bossTotalBet / 1_000_000_000, // Convert to SOL
          });
        }
        continue; // Skip creating new participant for subsequent boss bets
      }

      // Generate odid: wallet for boss, wallet_betIndex for others
      const odid = isBoss ? walletAddress : `${walletAddress}_${betIndex}`;

      // Check if participant already exists
      const existing = await db
        .query("currentGameParticipants")
        .withIndex("by_odid", (q) => q.eq("odid", odid))
        .first();

      if (existing) {
        // Update bet amount (for boss who may have added more bets)
        const newBetAmount = isBoss ? bossTotalBet / 1_000_000_000 : bet.amount / 1_000_000_000;
        if (existing.betAmount !== newBetAmount) {
          await db.patch(existing._id, { betAmount: newBetAmount });
          console.log(`[Sync Participants] Updated ${odid} betAmount to ${newBetAmount} SOL`);
        }
        continue;
      }

      // Resolve display name
      const player = await db
        .query("players")
        .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
        .first();

      const displayName = player?.displayName ||
        `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

      // Resolve character key from skin ID
      const character = await db
        .query("characters")
        .filter((q) => q.eq(q.field("id"), bet.skin))
        .first();

      const characterKey = character?.name
        ? character.name.toLowerCase().replace(/\s+/g, "-")
        : "warrior";

      // Calculate bet amount in SOL
      const betAmount = isBoss ? bossTotalBet / 1_000_000_000 : bet.amount / 1_000_000_000;

      // Insert new participant
      await db.insert("currentGameParticipants", {
        odid,
        walletAddress,
        displayName,
        gameRound,
        characterId: bet.skin,
        characterKey,
        betIndex,
        betAmount,
        position: bet.position,
        isBoss,
        spawnIndex: betIndex,
      });

      console.log(`[Sync Participants] Created participant ${odid} (${displayName}, ${characterKey}, ${betAmount} SOL, boss: ${isBoss})`);
      syncedCount++;
    }

    console.log(`[Sync Participants] Synced ${syncedCount} new participants for round ${gameRound}`);
    return { synced: syncedCount };
  },
});

/**
 * Clear participants for old game rounds
 * Called when a new game starts to clean up old data
 */
export const clearOldParticipants = internalMutation({
  args: { currentGameRound: v.number() },
  handler: async (ctx, { currentGameRound }) => {
    const { db } = ctx;

    // Find all participants NOT in current game round
    const oldParticipants = await db
      .query("currentGameParticipants")
      .filter((q) => q.neq(q.field("gameRound"), currentGameRound))
      .collect();

    for (const participant of oldParticipants) {
      await db.delete(participant._id);
    }

    if (oldParticipants.length > 0) {
      console.log(`[Sync Participants] Cleared ${oldParticipants.length} old participants (keeping round ${currentGameRound})`);
    }

    return { cleared: oldParticipants.length };
  },
});
