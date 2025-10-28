import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all active characters
export const getActiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return characters;
  },
});

// Get character by ID
export const getCharacter = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);
    return character;
  },
});

// Get random active character
export const getRandomCharacter = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    if (characters.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * characters.length);
    return characters[randomIndex];
  },
});

// Get bets with enriched character and player data for spawning in game
// Used by frontend to spawn characters in Phaser with correct appearance and size
export const getBetsWithCharacterData = query({
  args: { roundId: v.number() },
  handler: async (ctx, args) => {
    // Get all bets for this round
    const bets = await ctx.db
      .query("bets")
      .filter((q) => q.eq(q.field("roundId"), args.roundId as any))
      .collect();

    // Enrich each bet with character and player data
    const enrichedBets = await Promise.all(
      bets.map(async (bet) => {
        // Get character data if assigned
        const character = bet.characterId
          ? await ctx.db.get(bet.characterId)
          : null;

        // Get player data for display name
        const player = await ctx.db
          .query("players")
          .withIndex("by_wallet", (q) => q.eq("walletAddress", bet.walletAddress))
          .first();

        return {
          _id: bet._id,
          roundId: bet.roundId,
          betIndex: bet.betIndex,
          amount: bet.amount,
          walletAddress: bet.walletAddress,
          characterId: bet.characterId,
          position: bet.position,
          // Character details for spawning
          character: character ? {
            _id: character._id,
            name: character.name,
            // Derive sprite key from character name (e.g., "Orc Warrior" -> "orc-warrior")
            key: character.name.toLowerCase().replace(/\s+/g, "-"),
            assetPath: character.assetPath,
            isActive: character.isActive,
          } : null,
          // Player details
          displayName: player?.displayName || `Player ${bet.betIndex}`,
          // Flag to indicate if ready to spawn (has character and position)
          readyToSpawn: !!(bet.characterId && bet.position),
        };
      })
    );

    // Sort by bet index (chronological order)
    return enrichedBets.sort((a, b) => (a.betIndex || 0) - (b.betIndex || 0));
  },
});