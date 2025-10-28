import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Assign a character and spawn position to a bet
 * Called from frontend after placing a bet
 */
export const assignCharacterToBet = mutation({
  args: {
    roundId: v.number(), // blockchain round ID (converts to int internally)
    betIndex: v.number(), // bet index from smart contract (converts to int internally)
    characterId: v.id("characters"),
    position: v.optional(v.object({ x: v.number(), y: v.number() })), // spawn position
  },
  handler: async (ctx, args) => {
    // Convert numbers to integers to ensure type safety
    const roundId = Math.floor(args.roundId);
    const betIndex = Math.floor(args.betIndex);

    console.log(`[assignCharacterToBet] Assigning character to bet:`, { roundId, betIndex, characterId: args.characterId });

    // Find the gameRoundStates document for this round
    const gameRoundState = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_round_id", (q) => q.eq("roundId", roundId))
      .first();

    if (!gameRoundState) {
      throw new Error(
        `Game round state not found for round ${roundId}. ` +
        `The bet may not have been processed by the event listener yet.`
      );
    }

    // Find the bet by round and bet index
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_round_index", (q) =>
        q.eq("roundId", gameRoundState._id).eq("betIndex", betIndex)
      )
      .first();

    if (!bet) {
      throw new Error(
        `Bet not found for round ${roundId}, index ${betIndex}. ` +
        `The bet may not have been processed by the event listener yet. ` +
        `Please wait a moment and try again.`
      );
    }

    // Generate spawn position if not provided
    let spawnPosition = args.position;
    if (!spawnPosition) {
      // Calculate position based on bet index
      // Use a simple circular layout around center (512, 384)
      const angleStep = (Math.PI * 2) / Math.max(gameRoundState.betCount, 8);
      const angle = betIndex * angleStep;
      const radius = 200; // Default spawn radius

      // Apply ellipse transformation for better visual spread
      const ELLIPSE_RATIO_X = 1.8;
      const ELLIPSE_RATIO_Y = 0.5;
      const baseX = 512 + Math.cos(angle) * radius * ELLIPSE_RATIO_X;
      const baseY = 384 + Math.sin(angle) * radius * ELLIPSE_RATIO_Y;

      // Add some randomness
      const jitterX = (Math.random() - 0.5) * 60;
      const jitterY = (Math.random() - 0.5) * 40;

      spawnPosition = {
        x: baseX + jitterX,
        y: baseY + jitterY,
      };
    }

    // Update the bet with character ID and position
    await ctx.db.patch(bet._id, {
      characterId: args.characterId,
      position: spawnPosition,
    });

    console.log(`✓ Character ${args.characterId} assigned to bet ${bet._id} at position (${spawnPosition.x}, ${spawnPosition.y})`);

    return bet._id;
  },
});
