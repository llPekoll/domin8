import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Check if a bet is already stored in the database
 * Used to prevent duplicate bet storage
 */
export const isBetStored = internalMutation({
  args: {
    roundId: v.number(),
    betIndex: v.number(),
  },
  handler: async (ctx, args) => {
    // Find the gameRoundStates document ID for this round
    const gameRoundState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", args.roundId))
      .first();

    if (!gameRoundState) {
      // If no game round state exists yet, bet can't be stored
      return false;
    }

    const existing = await ctx.db
      .query("bets")
      .withIndex("by_round_index", (q) =>
        q.eq("roundId", gameRoundState._id).eq("betIndex", args.betIndex)
      )
      .first();

    return existing !== null;
  },
});

/**
 * Store a bet from BetEntry PDA data
 * Converts blockchain data to Convex database format
 */
export const storeBetFromPDA = internalMutation({
  args: {
    bet: v.object({
      gameRoundId: v.number(),
      betIndex: v.number(),
      wallet: v.string(),
      betAmount: v.number(),
      timestamp: v.number(),
      payoutCollected: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const { bet } = args;

    // ⭐ Find the gameRoundStates document ID for this round
    const gameRoundState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", bet.gameRoundId))
      .first();

    if (!gameRoundState) {
      throw new Error(
        `Cannot store bet: gameRoundStates not found for round ${bet.gameRoundId}. ` +
        `Make sure the game round state is captured before storing bets.`
      );
    }

    // Check if bet already exists (extra safety check)
    const existing = await ctx.db
      .query("bets")
      .withIndex("by_round_index", (q) =>
        q.eq("roundId", gameRoundState._id).eq("betIndex", bet.betIndex)
      )
      .first();

    if (existing) {
      console.log(`Bet already exists: Round ${bet.gameRoundId}, Index ${bet.betIndex}`);
      return existing._id;
    }

    // Create new bet record
    const betId = await ctx.db.insert("bets", {
      roundId: gameRoundState._id, // Reference to gameRoundStates document
      walletAddress: bet.wallet,
      betType: "self", // All bets are "self" bets for now
      amount: bet.betAmount / 1e9, // Convert lamports to SOL
      status: "pending",
      placedAt: bet.timestamp,
      onChainConfirmed: true,
      timestamp: bet.timestamp,
      betIndex: bet.betIndex, // Store bet index for ordering
    });

    console.log(`✓ Stored bet: Round ${bet.gameRoundId}, Index ${bet.betIndex}, Wallet ${bet.wallet}, Amount ${bet.betAmount / 1e9} SOL`);

    return betId;
  },
});
