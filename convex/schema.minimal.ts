/**
 * MINIMAL CONVEX SCHEMA - Post active_game PDA Integration
 *
 * With active_game PDA subscription, we no longer need:
 * ❌ blockchainEvents - Event listening (real-time subscription handles this)
 * ❌ gameRoundStates - PDA state snapshots (active_game provides real-time state)
 * ❌ scheduledJobs - Game progression scheduling (blockchain handles timing)
 *
 * We keep only:
 * ✅ Static metadata tables (characters, maps)
 * ✅ User profiles (players)
 * ✅ Historical bet records (for analytics/leaderboards)
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================================
  // STATIC METADATA (rarely changes)
  // ============================================================================

  /**
   * Characters - Available character sprites for the game
   * Used by: Character selection UI, sprite rendering
   */
  characters: defineTable({
    name: v.string(),
    id: v.optional(v.number()),
    assetPath: v.string(), // Path to character spritesheet
    description: v.optional(v.string()),
    animations: v.optional(
      v.object({
        idle: v.object({
          start: v.number(),
          end: v.number(),
        }),
        walk: v.object({
          start: v.number(),
          end: v.number(),
        }),
      })
    ),
    isActive: v.boolean(),
  }).index("by_active", ["isActive"]),

  /**
   * Maps - Available game maps/arenas
   * Used by: Map selection, spawn configuration
   */
  maps: defineTable({
    name: v.string(),
    background: v.string(),
    assetPath: v.string(),
    description: v.optional(v.string()),
    spawnConfiguration: v.object({
      maxPlayers: v.number(),
      spawnRadius: v.number(),
      minSpacing: v.number(),
    }),
    isActive: v.boolean(),
  }).index("by_active", ["isActive"]),

  // ============================================================================
  // USER DATA (persistent across games)
  // ============================================================================

  /**
   * Players - User profiles and stats
   * Used by: Leaderboards, achievements, user profiles
   */
  players: defineTable({
    walletAddress: v.string(),
    displayName: v.optional(v.string()),
    lastActive: v.number(),
    totalGamesPlayed: v.number(),
    totalWins: v.number(),
    totalEarnings: v.optional(v.number()), // Total SOL earned
    achievements: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),

  // ============================================================================
  // HISTORICAL DATA (for analytics)
  // ============================================================================

  /**
   * Bet History - Historical bet records
   * Used by: Analytics, leaderboards, bet history page
   *
   * NOTE: Active game bets come from active_game PDA subscription
   * This table is only for completed game history
   */
  betHistory: defineTable({
    // Game identification
    roundId: v.number(), // Game round ID
    walletAddress: v.string(),

    // Bet details
    amount: v.number(), // Bet amount in lamports
    betIndex: v.number(), // Index in game (0, 1, 2, ...)
    characterId: v.optional(v.id("characters")),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),

    // Outcome
    isWinner: v.boolean(),
    payout: v.optional(v.number()), // Payout amount if won

    // Timestamps
    placedAt: v.number(), // When bet was placed
    gameEndedAt: v.optional(v.number()), // When game ended

    // Blockchain tracking
    txSignature: v.string(), // Transaction signature for verification
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_round", ["roundId"])
    .index("by_tx_signature", ["txSignature"])
    .index("by_placed_at", ["placedAt"]), // For chronological queries

  /**
   * Game History - Historical game records
   * Used by: Game history page, statistics
   */
  gameHistory: defineTable({
    roundId: v.number(),

    // Game details
    startTimestamp: v.number(),
    endTimestamp: v.number(),
    betCount: v.number(),
    totalPot: v.number(),

    // Winner info
    winner: v.string(), // Wallet address
    winningBetIndex: v.number(),
    winnerPayout: v.number(),

    // Map used
    mapId: v.optional(v.id("maps")),

    // Blockchain reference
    txSignature: v.string(), // WinnerSelected event signature
  })
    .index("by_round", ["roundId"])
    .index("by_end_timestamp", ["endTimestamp"]) // For recent games
    .index("by_winner", ["winner"]), // For player history
});
