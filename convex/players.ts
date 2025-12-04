import { mutation, query, action, internalQuery, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const getPlayer = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      return null;
    }

    return player;
  },
});

/**
 * Internal query to get player display name by wallet address
 * Can be called from internal actions
 */
export const getPlayerDisplayNameInternal = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    return player?.displayName || null;
  },
});

/**
 * Get multiple players by wallet addresses
 * Returns a map of wallet address -> display name for quick lookups
 */
export const getPlayersByWallets = query({
  args: { walletAddresses: v.array(v.string()) },
  handler: async (ctx, args) => {
    const players = await Promise.all(
      args.walletAddresses.map(async (walletAddress) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
          .first();

        // Get equipped aura's assetKey if player has one equipped
        let auraKey: string | null = null;
        if (player?.equippedAuraId) {
          const aura = await ctx.db
            .query("auras")
            .withIndex("by_aura_id", (q) => q.eq("id", player.equippedAuraId!))
            .first();
          auraKey = aura?.assetKey || null;
        }

        return {
          walletAddress,
          displayName: player?.displayName || null,
          totalWins: player?.totalWins || 0,
          auraKey,
        };
      })
    );

    return players;
  },
});

export const getPlayerWithCharacter = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      return null;
    }

    // Get a random character for the player (since players don't have persistent characters)
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const character =
      characters.length > 0 ? characters[Math.floor(Math.random() * characters.length)] : null;

    return {
      ...player,
      character,
    };
  },
});

export const createPlayer = mutation({
  args: {
    walletAddress: v.string(),
    displayName: v.optional(v.string()),
    externalWalletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (existingPlayer) {
      return existingPlayer._id;
    }

    const playerId = await ctx.db.insert("players", {
      walletAddress: args.walletAddress,
      externalWalletAddress: args.externalWalletAddress,
      displayName: args.displayName,
      lastActive: Date.now(),
      totalGamesPlayed: 0,
      totalWins: 0,
      totalPoints: 0,
      achievements: [],
    });

    return playerId;
  },
});

export const updateLastActive = mutation({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (player) {
      await ctx.db.patch(player._id, {
        lastActive: Date.now(),
      });
    }
  },
});

// NOTE: gameCoins and pendingCoins removed from schema
// This game uses real SOL directly via Privy wallets
// Balances are queried from on-chain wallet, not stored in database

export const updateDisplayName = mutation({
  args: {
    walletAddress: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    // Validate display name
    const trimmedName = args.displayName.trim();
    if (trimmedName.length < 3) {
      throw new Error("Display name must be at least 3 characters long");
    }
    if (trimmedName.length > 20) {
      throw new Error("Display name must be less than 20 characters");
    }

    await ctx.db.patch(player._id, {
      displayName: trimmedName,
      lastActive: Date.now(),
    });

    return trimmedName;
  },
});

// Update player statistics after game
export const updatePlayerStats = mutation({
  args: {
    playerId: v.id("players"),
    won: v.boolean(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    await ctx.db.patch(args.playerId, {
      totalGamesPlayed: player.totalGamesPlayed + 1,
      totalWins: player.totalWins + (args.won ? 1 : 0),
      lastActive: Date.now(),
    });
  },
});

// NOTE: Pending coins and coin processing removed
// SOL transactions are handled directly via Privy + smart contract
// No internal coin system needed

// Add achievement to player
export const addAchievement = mutation({
  args: {
    playerId: v.id("players"),
    achievementId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const achievements = player.achievements || [];
    if (!achievements.includes(args.achievementId)) {
      achievements.push(args.achievementId);

      await ctx.db.patch(args.playerId, {
        achievements,
      });
    }
  },
});

/**
 * Get Character Requirements
 *
 * Returns information about a character's requirements (e.g., NFT ownership).
 * Used by frontend to determine if character needs special verification.
 */
export const getCharacterRequirements = query({
  args: {
    characterId: v.id("characters"),
  },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);

    if (!character) {
      return null;
    }

    return {
      characterId: character._id,
      characterName: character.name,
      requiresNFT: !!character.nftCollection,
      nftCollection: character.nftCollection || null,
    };
  },
});

/**
 * Server-side verification helper for bets
 *
 * This mutation can be called by the frontend prior to submitting an on-chain
 * place_bet transaction. It verifies (on the server) that the external wallet
 * owns any required NFT for the requested character. It does NOT attempt to
 * place the on-chain bet — that remains the responsibility of the client.
 */
export const verifyAndPlaceBet = action({
  args: {
    walletAddress: v.string(),
    externalWalletAddress: v.optional(v.string()),
    characterId: v.id("characters"),
    betAmount: v.number(),
  },
  handler: async (ctx, args) => {
    // Basic sanity checks - fetch character requirements via query (actions don't have direct db access)
    const characterRequirements = await ctx.runQuery(api.players.getCharacterRequirements, {
      characterId: args.characterId,
    });

    if (!characterRequirements) {
      throw new Error("Character not found");
    }

    // If character requires an NFT, verify ownership via cached data
    if (characterRequirements.requiresNFT && characterRequirements.nftCollection) {
      if (!args.externalWalletAddress) {
        throw new Error("External wallet required for NFT characters");
      }

      // Check cached NFT ownership (instant verification!)
      const ownership = await ctx.runQuery(api.nftHolderScanner.checkCachedOwnership, {
        walletAddress: args.externalWalletAddress,
        collectionAddress: characterRequirements.nftCollection,
      });

      if (!ownership.hasNFT) {
        throw new Error(
          `You don't own the required NFT for ${characterRequirements.characterName}. Try using the refresh button if you just bought this NFT.`
        );
      }
    }

    // All verification passed. Actions can perform additional server-side
    // work here (e.g., logging, running mutations) if desired. We return
    // success so the client can proceed to submit the on-chain transaction.
    return { ok: true };
  },
});

/**
 * Update game stats for all participants after a game ends (internal - called from gameScheduler)
 *
 * - Increments totalGamesPlayed for all participants
 * - Increments totalWins for the winner
 * - Creates player records if they don't exist
 *
 * @param participantWallets - Array of all unique wallet addresses that participated
 * @param winnerWallet - The winner's wallet address
 */
export const updateGameStatsForParticipants = internalMutation({
  args: {
    participantWallets: v.array(v.string()),
    winnerWallet: v.string(),
  },
  handler: async (ctx, args) => {
    const { participantWallets, winnerWallet } = args;

    console.log(`[Player Stats] Updating stats for ${participantWallets.length} participants, winner: ${winnerWallet.slice(0, 8)}...`);

    for (const walletAddress of participantWallets) {
      const isWinner = walletAddress === winnerWallet;

      // Find existing player
      const player = await ctx.db
        .query("players")
        .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
        .first();

      if (player) {
        // Update existing player
        await ctx.db.patch(player._id, {
          totalGamesPlayed: player.totalGamesPlayed + 1,
          totalWins: player.totalWins + (isWinner ? 1 : 0),
          lastActive: Date.now(),
        });
      } else {
        // Create new player record
        await ctx.db.insert("players", {
          walletAddress,
          displayName: undefined,
          externalWalletAddress: undefined,
          lastActive: Date.now(),
          totalGamesPlayed: 1,
          totalWins: isWinner ? 1 : 0,
          totalPoints: 0,
          achievements: [],
        });
      }

      console.log(`[Player Stats] Updated ${walletAddress.slice(0, 8)}... (gamesPlayed+1${isWinner ? ', wins+1' : ''})`);
    }

    console.log(`[Player Stats] ✅ All participant stats updated`);
  },
});

/**
 * Award points to a player (internal - called from backend)
 *
 * Awards points based on SOL amount (1 point per 0.001 SOL).
 * Used for prize distribution from gameScheduler.
 * Creates player record if it doesn't exist.
 *
 * @param walletAddress - Player's wallet address
 * @param amountLamports - Amount in lamports to convert to points
 */
const awardPointsHandler = async (
  ctx: any,
  args: { walletAddress: string; amountLamports: number }
) => {
  // Calculate points: 1 point per 0.001 SOL
  // 0.001 SOL = 1_000_000 lamports

  // Ensure amountLamports is a valid number
  const amount = Number(args.amountLamports);
  if (isNaN(amount)) {
    console.error("[awardPoints] Invalid amountLamports:", args.amountLamports);
    return;
  }

  const points = Math.floor(amount / 1_000_000);

  if (points <= 0) {
    // No points to award
    return;
  }

  // Find player
  const player = await ctx.db
    .query("players")
    .withIndex("by_wallet", (q: any) => q.eq("walletAddress", args.walletAddress))
    .first();

  if (player) {
    // Update existing player (handle case where totalPoints might be undefined for old players)
    const currentPoints = Number(player.totalPoints) || 0;
    await ctx.db.patch(player._id, {
      totalPoints: currentPoints + points,
      lastActive: Date.now(),
    });
  } else {
    // Create new player with points
    await ctx.db.insert("players", {
      walletAddress: args.walletAddress,
      displayName: undefined,
      externalWalletAddress: undefined,
      lastActive: Date.now(),
      totalGamesPlayed: 0,
      totalWins: 0,
      totalPoints: points,
      achievements: [],
    });
  }
};

/**
 * Award points to a player (public mutation - called from frontend)
 */
export const awardPoints = mutation({
  args: {
    walletAddress: v.string(),
    amountLamports: v.number(),
  },
  handler: awardPointsHandler,
});

/**
 * Award points to a player (internal mutation - called from backend actions)
 */
export const awardPointsInternal = internalMutation({
  args: {
    walletAddress: v.string(),
    amountLamports: v.number(),
  },
  handler: awardPointsHandler,
});

/**
 * Get player statistics from game history
 * Calculates total wins and total winnings by querying finished games
 *
 * @param walletAddress - Player's wallet address
 * @returns Player stats including total wins, total winnings in SOL, and games played
 */
export const getPlayerStatsFromHistory = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all finished games where this player was the winner
    const finishedGames = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .collect();

    // Filter games where this player won and calculate total winnings
    let totalWins = 0;
    let totalWinningsLamports = 0;

    for (const game of finishedGames) {
      if (game.winner === args.walletAddress) {
        totalWins++;
        // Prize is 95% of total pot
        if (game.totalPot) {
          const prizeAmount = game.totalPot * 0.95;
          totalWinningsLamports += prizeAmount;
        }
      }
    }

    // Convert to SOL (1 SOL = 1,000,000,000 lamports)
    const totalWinningsSOL = totalWinningsLamports / 1_000_000_000;

    return {
      walletAddress: args.walletAddress,
      totalWins,
      totalWinningsSOL,
      totalWinningsLamports,
    };
  },
});

/**
 * Get recent games for a player
 *
 * @param walletAddress - Player's wallet address
 * @param limit - Number of games to return (default: 10)
 * @returns Array of recent games with result info
 */
export const getRecentGames = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    // Get all finished games
    const finishedGames = await ctx.db
      .query("gameRoundStates")
      .withIndex("by_status", (q) => q.eq("status", "finished"))
      .order("desc")
      .collect();

    // Filter games where this player participated
    const playerGames = finishedGames
      .filter((game) => game.wallets?.includes(args.walletAddress))
      .slice(0, limit);

    // Map to a simpler format
    return playerGames.map((game) => {
      const isWinner = game.winner === args.walletAddress;
      const playerBetIndex = game.wallets?.indexOf(args.walletAddress) ?? -1;

      // Calculate player's total bet amount (they may have multiple bets)
      let playerBetAmount = 0;
      if (game.betWalletIndex && game.betAmounts) {
        for (let i = 0; i < game.betWalletIndex.length; i++) {
          if (game.betWalletIndex[i] === playerBetIndex) {
            playerBetAmount += game.betAmounts[i] ?? 0;
          }
        }
      }

      return {
        roundId: game.roundId,
        timestamp: game.endTimestamp || game.capturedAt,
        isWinner,
        playerCount: game.wallets?.length ?? 0,
        totalPot: game.totalPot ?? 0,
        playerBetAmount,
        prizeWon: isWinner ? Math.floor((game.totalPot ?? 0) * 0.95) : 0,
      };
    });
  },
});

/**
 * Get leaderboard (top players by points)
 *
 * @param limit - Number of top players to return (default: 100)
 * @returns Array of players sorted by totalPoints (descending)
 */
export const getLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Get all players with points
    const allPlayers = await ctx.db.query("players").collect();

    // Filter and sort by totalPoints (descending)
    const topPlayers = allPlayers
      .filter((player) => (player.totalPoints ?? 0) > 0)
      .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      .slice(0, limit);

    // Return with rank
    return topPlayers.map((player, index) => ({
      rank: index + 1,
      walletAddress: player.walletAddress,
      displayName: player.displayName || `Player ${player.walletAddress.slice(0, 6)}`,
      totalPoints: player.totalPoints ?? 0,
      totalWins: player.totalWins,
      totalGamesPlayed: player.totalGamesPlayed,
    }));
  },
});
