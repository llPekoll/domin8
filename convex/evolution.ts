import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Evolution thresholds
const EVOLUTION_THRESHOLDS = {
  LEVEL_1: 20,
  LEVEL_2: 50,
};

// All evolution lines
const EVOLUTION_LINES = ["elf", "priest", "pumpkin", "skeleton", "zombie"];

/**
 * Get all evolution progress for a player
 */
export const getPlayerEvolutionProgress = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
  },
});

/**
 * Get evolution progress for a specific line
 */
export const getEvolutionProgressForLine = query({
  args: {
    walletAddress: v.string(),
    evolutionLine: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet_and_line", (q) =>
        q
          .eq("walletAddress", args.walletAddress)
          .eq("evolutionLine", args.evolutionLine)
      )
      .first();
  },
});

/**
 * Get available evolution skins for a player
 * Returns only the skins the player has unlocked
 */
export const getAvailableEvolutionSkins = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    // Get all evolution characters
    const evolutionChars = await ctx.db
      .query("characters")
      .withIndex("by_type", (q) => q.eq("characterType", "free"))
      .collect();

    // Get player's evolution progress
    const progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const progressMap = new Map(progress.map((p) => [p.evolutionLine, p]));

    // Filter to only unlocked skins
    return evolutionChars.filter((char) => {
      if (!char.evolutionLine) return false;
      const playerProgress = progressMap.get(char.evolutionLine);
      // If no progress record, player has level 0 (base skin) unlocked
      const unlockedLevel = playerProgress?.unlockedLevel ?? 0;
      return (char.evolutionLevel ?? 0) <= unlockedLevel;
    });
  },
});

/**
 * Record a win and check for evolution unlock
 * Called internally when a player wins a game
 */
export const recordWin = internalMutation({
  args: {
    walletAddress: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    // Get the character to check if it's an evolution character
    const character = await ctx.db
      .query("characters")
      .filter((q) => q.eq(q.field("id"), args.characterId))
      .first();

    if (
      !character ||
      character.characterType !== "free" ||
      !character.evolutionLine
    ) {
      // Not an evolution character, no tracking needed
      return { evolved: false, tracked: false };
    }

    const evolutionLine = character.evolutionLine;

    // Get or create evolution progress
    let progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet_and_line", (q) =>
        q
          .eq("walletAddress", args.walletAddress)
          .eq("evolutionLine", evolutionLine)
      )
      .first();

    if (!progress) {
      // Create new progress entry
      await ctx.db.insert("playerEvolutionProgress", {
        walletAddress: args.walletAddress,
        evolutionLine,
        wins: 1,
        unlockedLevel: 0,
        lastWinAt: Date.now(),
      });
      return {
        evolved: false,
        tracked: true,
        wins: 1,
        unlockedLevel: 0,
        evolutionLine,
      };
    }

    // Increment wins
    const newWins = progress.wins + 1;
    let newUnlockedLevel = progress.unlockedLevel;
    let evolved = false;

    // Check for evolution thresholds
    if (newWins >= EVOLUTION_THRESHOLDS.LEVEL_2 && progress.unlockedLevel < 2) {
      newUnlockedLevel = 2;
      evolved = true;
    } else if (
      newWins >= EVOLUTION_THRESHOLDS.LEVEL_1 &&
      progress.unlockedLevel < 1
    ) {
      newUnlockedLevel = 1;
      evolved = true;
    }

    await ctx.db.patch(progress._id, {
      wins: newWins,
      unlockedLevel: newUnlockedLevel,
      lastWinAt: Date.now(),
    });

    return {
      evolved,
      tracked: true,
      wins: newWins,
      unlockedLevel: newUnlockedLevel,
      evolutionLine,
      previousLevel: progress.unlockedLevel,
    };
  },
});

/**
 * Initialize evolution progress for a new player
 * Creates progress entries for all evolution lines at level 0
 */
export const initializeEvolutionProgress = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const created: string[] = [];

    for (const line of EVOLUTION_LINES) {
      const existing = await ctx.db
        .query("playerEvolutionProgress")
        .withIndex("by_wallet_and_line", (q) =>
          q.eq("walletAddress", args.walletAddress).eq("evolutionLine", line)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("playerEvolutionProgress", {
          walletAddress: args.walletAddress,
          evolutionLine: line,
          wins: 0,
          unlockedLevel: 0,
        });
        created.push(line);
      }
    }

    return { initialized: created.length > 0, lines: created };
  },
});

/**
 * Get evolution summary for a player
 * Returns all lines with their progress and unlock status
 */
export const getEvolutionSummary = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();

    const progressMap = new Map(progress.map((p) => [p.evolutionLine, p]));

    return EVOLUTION_LINES.map((line) => {
      const lineProgress = progressMap.get(line);
      const wins = lineProgress?.wins ?? 0;
      const unlockedLevel = lineProgress?.unlockedLevel ?? 0;

      let nextThreshold: number | null = null;
      let winsToNextLevel: number | null = null;

      if (unlockedLevel === 0) {
        nextThreshold = EVOLUTION_THRESHOLDS.LEVEL_1;
        winsToNextLevel = EVOLUTION_THRESHOLDS.LEVEL_1 - wins;
      } else if (unlockedLevel === 1) {
        nextThreshold = EVOLUTION_THRESHOLDS.LEVEL_2;
        winsToNextLevel = EVOLUTION_THRESHOLDS.LEVEL_2 - wins;
      }

      return {
        evolutionLine: line,
        wins,
        unlockedLevel,
        nextThreshold,
        winsToNextLevel: winsToNextLevel !== null ? Math.max(0, winsToNextLevel) : null,
        isMaxLevel: unlockedLevel >= 2,
      };
    });
  },
});

/**
 * Check if a player can use a specific evolution skin
 */
export const canUseEvolutionSkin = query({
  args: {
    walletAddress: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    // Get the character
    const character = await ctx.db
      .query("characters")
      .filter((q) => q.eq(q.field("id"), args.characterId))
      .first();

    if (!character) {
      return { canUse: false, reason: "Character not found" };
    }

    if (character.characterType !== "free") {
      return { canUse: false, reason: "Not an evolution character" };
    }

    if (!character.evolutionLine) {
      return { canUse: false, reason: "No evolution line defined" };
    }

    // Get player's progress for this line
    const progress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet_and_line", (q) =>
        q
          .eq("walletAddress", args.walletAddress)
          .eq("evolutionLine", character.evolutionLine!)
      )
      .first();

    const unlockedLevel = progress?.unlockedLevel ?? 0;
    const requiredLevel = character.evolutionLevel ?? 0;

    if (requiredLevel <= unlockedLevel) {
      return { canUse: true };
    }

    const winsNeeded =
      requiredLevel === 1
        ? EVOLUTION_THRESHOLDS.LEVEL_1
        : EVOLUTION_THRESHOLDS.LEVEL_2;
    const currentWins = progress?.wins ?? 0;

    return {
      canUse: false,
      reason: `Need ${winsNeeded - currentWins} more wins to unlock`,
      winsNeeded,
      currentWins,
    };
  },
});
