/**
 * Current Game Participants - Unified participant management
 *
 * Provides real-time participant data combining:
 * - Wallet address
 * - Display name (resolved from players table)
 * - Character info
 * - Bet amounts
 * - Boss status
 *
 * One row per "character on screen":
 * - Boss: ONE entry (locked character, betAmount = sum of all bets)
 * - Non-boss: ONE entry PER BET (each bet = separate character)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

/**
 * Get all participants for the current game round
 * Used by React to subscribe to real-time updates
 */
export const getParticipants = query({
  args: { gameRound: v.number() },
  handler: async (ctx, { gameRound }) => {
    const participants = await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_gameRound", (q) => q.eq("gameRound", gameRound))
      .collect();

    return participants;
  },
});

/**
 * Get participant by odid
 */
export const getParticipantByOdid = query({
  args: { odid: v.string() },
  handler: async (ctx, { odid }) => {
    const participant = await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_odid", (q) => q.eq("odid", odid))
      .first();

    return participant;
  },
});

/**
 * Internal query to get participant by odid
 */
export const getParticipantByOdidInternal = internalQuery({
  args: { odid: v.string() },
  handler: async (ctx, { odid }) => {
    return await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_odid", (q) => q.eq("odid", odid))
      .first();
  },
});

/**
 * Internal query to get all participants for a wallet in current game
 */
export const getParticipantsByWallet = internalQuery({
  args: { walletAddress: v.string(), gameRound: v.number() },
  handler: async (ctx, { walletAddress, gameRound }) => {
    const participants = await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", walletAddress))
      .filter((q) => q.eq(q.field("gameRound"), gameRound))
      .collect();

    return participants;
  },
});

/**
 * Upsert a participant (insert or update)
 * Called from sync service when processing blockchain bets
 */
export const upsertParticipant = internalMutation({
  args: {
    odid: v.string(),
    walletAddress: v.string(),
    displayName: v.string(),
    gameRound: v.number(),
    characterId: v.number(),
    characterKey: v.string(),
    betIndex: v.number(),
    betAmount: v.number(),
    position: v.array(v.number()),
    isBoss: v.boolean(),
    spawnIndex: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if participant already exists
    const existing = await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_odid", (q) => q.eq("odid", args.odid))
      .first();

    if (existing) {
      // Update existing participant (e.g., boss bet amount increased)
      await ctx.db.patch(existing._id, {
        betAmount: args.betAmount,
        // Don't update characterId/characterKey for boss (locked on first bet)
        // But update position if needed
        position: args.position,
      });
      return existing._id;
    } else {
      // Insert new participant
      return await ctx.db.insert("currentGameParticipants", args);
    }
  },
});

/**
 * Clear all participants for a game round
 * Called when game ends and new game starts
 */
export const clearParticipants = internalMutation({
  args: { gameRound: v.number() },
  handler: async (ctx, { gameRound }) => {
    const participants = await ctx.db
      .query("currentGameParticipants")
      .withIndex("by_gameRound", (q) => q.eq("gameRound", gameRound))
      .collect();

    for (const participant of participants) {
      await ctx.db.delete(participant._id);
    }

    console.log(`[CurrentGameParticipants] Cleared ${participants.length} participants for round ${gameRound}`);
    return participants.length;
  },
});

/**
 * Clear all participants (for cleanup/reset)
 */
export const clearAllParticipants = internalMutation({
  handler: async (ctx) => {
    const participants = await ctx.db.query("currentGameParticipants").collect();

    for (const participant of participants) {
      await ctx.db.delete(participant._id);
    }

    console.log(`[CurrentGameParticipants] Cleared all ${participants.length} participants`);
    return participants.length;
  },
});

/**
 * Helper to resolve display name from wallet address
 * Returns truncated wallet if no display name found
 */
export const resolveDisplayName = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, { walletAddress }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
      .first();

    if (player?.displayName) {
      return player.displayName;
    }

    // Fallback to truncated wallet
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  },
});

/**
 * PUBLIC mutation: Sync participants from React when useActiveGame detects changes
 * Called directly from frontend when blockchain data updates (real-time, no cron delay)
 *
 * Handles:
 * - Boss: ONE entry (locked character, betAmount = sum of all bets)
 * - Non-boss: ONE entry PER BET (each bet = separate character)
 *
 * Note: bossWallet is resolved SERVER-SIDE to avoid race conditions between clients
 */
export const syncFromBlockchain = mutation({
  args: {
    gameRound: v.number(),
    bets: v.array(v.object({
      walletIndex: v.number(),
      amount: v.number(), // In lamports
      skin: v.number(),
      position: v.array(v.number()),
    })),
    wallets: v.array(v.string()),
  },
  handler: async (ctx, { gameRound, bets, wallets }) => {
    const { db } = ctx;

    // Get boss wallet SERVER-SIDE to avoid race conditions between clients
    const finishedGames = await db
      .query("gameRoundStates")
      .withIndex("by_status_and_round", (q) => q.eq("status", "finished"))
      .order("desc")
      .take(5);

    const lastGame = finishedGames.find(
      (game) => game.winner && game.totalPot && game.totalPot > 0
    );
    const bossWallet = lastGame?.winner ?? null;

    if (!bets || bets.length === 0 || !wallets || wallets.length === 0) {
      return { synced: 0, updated: 0 };
    }

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
    }

    let syncedCount = 0;
    let updatedCount = 0;

    // Process each bet
    for (let betIndex = 0; betIndex < bets.length; betIndex++) {
      const bet = bets[betIndex];
      const walletAddress = wallets[bet.walletIndex];

      if (!walletAddress) continue;

      const isBoss = walletAddress === bossWallet;

      // For boss: only create ONE participant (skip subsequent bets)
      if (isBoss && betIndex !== bossFirstBetIndex) {
        // Update boss's total bet amount if participant already exists
        const bossOdid = walletAddress;
        const existingBoss = await db
          .query("currentGameParticipants")
          .withIndex("by_odid", (q) => q.eq("odid", bossOdid))
          .first();

        if (existingBoss && existingBoss.betAmount !== bossTotalBet / 1_000_000_000) {
          await db.patch(existingBoss._id, {
            betAmount: bossTotalBet / 1_000_000_000,
          });
          updatedCount++;
        }
        continue;
      }

      // Generate odid: wallet for boss, wallet_betIndex for others
      const odid = isBoss ? walletAddress : `${walletAddress}_${betIndex}`;

      // Check if participant already exists
      const existing = await db
        .query("currentGameParticipants")
        .withIndex("by_odid", (q) => q.eq("odid", odid))
        .first();

      if (existing) {
        // Update bet amount if changed
        const newBetAmount = isBoss ? bossTotalBet / 1_000_000_000 : bet.amount / 1_000_000_000;
        if (existing.betAmount !== newBetAmount) {
          await db.patch(existing._id, { betAmount: newBetAmount });
          updatedCount++;
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

      syncedCount++;
    }

    // Clear old participants from previous rounds
    const oldParticipants = await db
      .query("currentGameParticipants")
      .filter((q) => q.neq(q.field("gameRound"), gameRound))
      .collect();

    for (const participant of oldParticipants) {
      await db.delete(participant._id);
    }

    return { synced: syncedCount, updated: updatedCount, cleared: oldParticipants.length };
  },
});
