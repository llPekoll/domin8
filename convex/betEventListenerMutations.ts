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
    const existing = await ctx.db
      .query("bets")
      .filter((q) =>
        q.and(
          q.eq(q.field("roundId"), args.roundId as any),
          q.eq(q.field("betIndex"), args.betIndex)
        )
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

    // Check if bet already exists (extra safety check)
    const existing = await ctx.db
      .query("bets")
      .filter((q) =>
        q.and(
          q.eq(q.field("roundId"), bet.gameRoundId as any),
          q.eq(q.field("betIndex"), bet.betIndex)
        )
      )
      .first();

    if (existing) {
      console.log(`Bet already exists: Round ${bet.gameRoundId}, Index ${bet.betIndex}`);
      return existing._id;
    }

    // Create new bet record
    const betId = await ctx.db.insert("bets", {
      roundId: bet.gameRoundId as any, // Blockchain round ID (TODO: Map to games table ID later)
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
