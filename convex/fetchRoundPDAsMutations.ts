import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const checkStateCaptured = internalMutation({
  args: {
    roundId: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", args.status)
      )
      .first();
    return existing !== null;
  },
});

export const saveGameRoundState = internalMutation({
  args: {
    gameRound: v.object({
      roundId: v.number(),
      status: v.string(),
      startTimestamp: v.number(),
      endTimestamp: v.number(),
      betCount: v.number(),
      betAmounts: v.array(v.number()),
      totalPot: v.number(),
      winner: v.union(v.string(), v.null()),
      winningBetIndex: v.number(),
      vrfRequestPubkey: v.union(v.string(), v.null()),
      vrfSeed: v.array(v.number()),
      randomnessFulfilled: v.boolean(),
      winnerPrizeUnclaimed: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const { gameRound } = args;
    await ctx.db.insert("gameRoundStates", {
      roundId: gameRound.roundId,
      status: gameRound.status,
      startTimestamp: gameRound.startTimestamp,
      endTimestamp: gameRound.endTimestamp,
      capturedAt: Math.floor(Date.now() / 1000),
      betCount: gameRound.betCount,
      betAmounts: gameRound.betAmounts,
      totalPot: gameRound.totalPot,
      winner: gameRound.winner,
      winningBetIndex: gameRound.winningBetIndex,
      vrfRequestPubkey: gameRound.vrfRequestPubkey,
      vrfSeed: gameRound.vrfSeed,
      randomnessFulfilled: gameRound.randomnessFulfilled,
      winnerPrizeUnclaimed: gameRound.winnerPrizeUnclaimed,
    });
  },
});
