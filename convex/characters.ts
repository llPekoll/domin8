import { v } from "convex/values";
import { query } from "./_generated/server";

export const getActiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Shuffle the characters array using Fisher-Yates algorithm
    const shuffled = [...characters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
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

// Get characters by NFT collection address
export const getCharactersByCollection = query({
  args: { nftCollection: v.string() },
  handler: async (ctx, args) => {
    const characters = await ctx.db
      .query("characters")
      .filter((q) => q.eq(q.field("nftCollection"), args.nftCollection))
      .collect();

    return characters;
  },
});

// Get all characters with NFT collection requirement (exclusive characters)
export const getExclusiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .filter((q) => q.neq(q.field("nftCollection"), undefined))
      .collect();

    return characters;
  },
});

// Note: Bet data with skin/position now comes directly from blockchain via useActiveGame hook
// No longer stored in Convex database - source of truth is on-chain

/**
 * Get all characters with unlock status for a specific player
 * This is the main query for character selection UI
 */
export const getAvailableCharacters = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allChars = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Get player's lootbox characters
    const ownedChars = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCharIds = new Set(ownedChars.map((c) => c.characterId));

    // Get player's evolution progress
    const evoProgress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const evoProgressMap = new Map(evoProgress.map((p) => [p.evolutionLine, p]));

    // Get NFT verification
    const nftHoldings = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCollections = new Set(nftHoldings.map((h) => h.collectionAddress));

    return allChars.map((char) => {
      let isUnlocked = false;
      let unlockProgress = null;
      let unlockMethod: "free" | "lootbox" | "nft" | "unknown" = "unknown";

      if (char.characterType === "free") {
        // Evolution character - check if level is unlocked
        unlockMethod = "free";
        const progress = evoProgressMap.get(char.evolutionLine ?? "");
        const unlockedLevel = progress?.unlockedLevel ?? 0;
        isUnlocked = (char.evolutionLevel ?? 0) <= unlockedLevel;

        if (progress) {
          const nextThreshold =
            progress.unlockedLevel === 0
              ? 20
              : progress.unlockedLevel === 1
                ? 50
                : null;
          unlockProgress = {
            wins: progress.wins,
            unlockedLevel: progress.unlockedLevel,
            nextThreshold,
            winsToNext: nextThreshold ? Math.max(0, nextThreshold - progress.wins) : null,
          };
        } else {
          // No progress record, player has level 0 unlocked by default
          unlockProgress = {
            wins: 0,
            unlockedLevel: 0,
            nextThreshold: 20,
            winsToNext: 20,
          };
        }
      } else if (char.characterType === "lootbox") {
        // Lootbox character - check if owned
        unlockMethod = "lootbox";
        isUnlocked = ownedCharIds.has(char.id);
      } else if (char.characterType === "nft") {
        // NFT character - check if owns collection
        unlockMethod = "nft";
        isUnlocked = char.nftCollection
          ? ownedCollections.has(char.nftCollection)
          : false;
      }

      return {
        ...char,
        isUnlocked,
        unlockMethod,
        unlockProgress,
      };
    });
  },
});

/**
 * Get characters grouped by type for character selection UI
 * Includes favorites at the top
 */
export const getCharactersGrouped = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const allChars = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Get player's lootbox characters
    const ownedChars = await ctx.db
      .query("playerCharacters")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCharIds = new Set(ownedChars.map((c) => c.characterId));

    // Get player's evolution progress
    const evoProgress = await ctx.db
      .query("playerEvolutionProgress")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const evoProgressMap = new Map(evoProgress.map((p) => [p.evolutionLine, p]));

    // Get NFT verification
    const nftHoldings = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const ownedCollections = new Set(nftHoldings.map((h) => h.collectionAddress));

    // Get player's favorites
    const favorites = await ctx.db
      .query("playerFavorites")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .collect();
    const favoriteCharIds = new Set(favorites.map((f) => f.characterId));
    const favoritesOrder = new Map(favorites.map((f) => [f.characterId, f.favoritedAt]));

    // Helper to determine unlock status
    const getUnlockStatus = (char: (typeof allChars)[0]) => {
      if (char.characterType === "free") {
        const progress = evoProgressMap.get(char.evolutionLine ?? "");
        const unlockedLevel = progress?.unlockedLevel ?? 0;
        return (char.evolutionLevel ?? 0) <= unlockedLevel;
      } else if (char.characterType === "lootbox") {
        return ownedCharIds.has(char.id);
      } else if (char.characterType === "nft") {
        return char.nftCollection ? ownedCollections.has(char.nftCollection) : false;
      }
      return false;
    };

    // Group characters
    const freeChars: typeof allChars = [];
    const lootboxChars: typeof allChars = [];
    const nftChars: typeof allChars = [];

    for (const char of allChars) {
      if (char.characterType === "free") {
        freeChars.push(char);
      } else if (char.characterType === "lootbox") {
        lootboxChars.push(char);
      } else if (char.characterType === "nft") {
        nftChars.push(char);
      }
    }

    // Build favorites list with unlock status
    const favoriteChars = allChars
      .filter((char) => favoriteCharIds.has(char.id))
      .map((char) => ({
        ...char,
        isUnlocked: getUnlockStatus(char),
        isFavorite: true,
      }))
      .sort((a, b) => (favoritesOrder.get(a.id) ?? 0) - (favoritesOrder.get(b.id) ?? 0));

    // Group evolution characters by line
    const evolutionLines: Record<
      string,
      {
        line: string;
        progress: { wins: number; unlockedLevel: number } | null;
        characters: Array<(typeof allChars)[0] & { isUnlocked: boolean; isFavorite: boolean }>;
      }
    > = {};

    for (const char of freeChars) {
      const line = char.evolutionLine ?? "unknown";
      if (!evolutionLines[line]) {
        const progress = evoProgressMap.get(line);
        evolutionLines[line] = {
          line,
          progress: progress
            ? { wins: progress.wins, unlockedLevel: progress.unlockedLevel }
            : { wins: 0, unlockedLevel: 0 },
          characters: [],
        };
      }
      const progress = evoProgressMap.get(line);
      const unlockedLevel = progress?.unlockedLevel ?? 0;
      evolutionLines[line].characters.push({
        ...char,
        isUnlocked: (char.evolutionLevel ?? 0) <= unlockedLevel,
        isFavorite: favoriteCharIds.has(char.id),
      });
    }

    // Sort evolution characters by level within each line
    for (const line of Object.values(evolutionLines)) {
      line.characters.sort(
        (a, b) => (a.evolutionLevel ?? 0) - (b.evolutionLevel ?? 0)
      );
    }

    // Count owned lootbox characters
    const ownedLootboxCount = lootboxChars.filter((c) =>
      ownedCharIds.has(c.id)
    ).length;

    // Add unlock status to lootbox chars
    const lootboxCharsWithStatus = lootboxChars.map((char) => ({
      ...char,
      isUnlocked: ownedCharIds.has(char.id),
      isFavorite: favoriteCharIds.has(char.id),
    }));

    // Add unlock status to NFT chars
    const nftCharsWithStatus = nftChars.map((char) => ({
      ...char,
      isUnlocked: char.nftCollection
        ? ownedCollections.has(char.nftCollection)
        : false,
      isFavorite: favoriteCharIds.has(char.id),
    }));

    return {
      favorites: favoriteChars,
      evolution: Object.values(evolutionLines),
      lootbox: {
        owned: ownedLootboxCount,
        total: lootboxChars.length,
        characters: lootboxCharsWithStatus,
      },
      nft: {
        characters: nftCharsWithStatus,
      },
    };
  },
});

/**
 * Get character by numeric ID
 */
export const getCharacterById = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const character = await ctx.db
      .query("characters")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    return character;
  },
});
