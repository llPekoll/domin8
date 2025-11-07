import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================================
  // BLOCKCHAIN DATA TABLES (Risk Architecture)
  // ============================================================================

  /**
   * Game Round States - Snapshots of game round state from blockchain
   * Risk architecture: Simple polling of active_game PDA
   * Stores states per round: waiting → finished
   */
  gameRoundStates: defineTable({
    // Round identification
    roundId: v.number(), // Game round ID
    status: v.string(), // "waiting" | "finished"

    // Timestamps
    startTimestamp: v.number(), // When round started (Unix timestamp)
    endTimestamp: v.number(), // When betting window closes
    capturedAt: v.number(), // When this state was captured (Unix timestamp)

    // Game configuration (selected when round is created)
    mapId: v.optional(v.number()), // Map ID from blockchain (0-255) - matches smart contract

    // Game state (snapshot from blockchain)
    betCount: v.optional(v.number()), // Number of bets placed
    betAmounts: v.optional(v.array(v.number())), // Array of bet amounts
    betSkin: v.optional(v.array(v.number())), // Array of skin IDs (u8) - character customization
    betPosition: v.optional(v.array(v.array(v.number()))), // Array of [x, y] positions (u16)
    totalPot: v.optional(v.number()), // Total accumulated pot in lamports
    winner: v.optional(v.union(v.string(), v.null())), // Winner wallet (base58), null if not determined
    winningBetIndex: v.optional(v.number()), // Index of winning bet

    prizeSent: v.optional(v.boolean()), // Whether prize has been sent to winner
  })
    .index("by_round_and_status", ["roundId", "status"]) // Prevent duplicate states (PRIMARY)
    .index("by_round_id", ["roundId"]) // Query all states for a round
    .index("by_status", ["status"]) // Query rounds by status
    .index("by_captured_at", ["capturedAt"]), // Chronological ordering

  // ============================================================================
  // SCHEDULER TABLES
  // ============================================================================

  /**
   * Scheduled Jobs - Track scheduled game progression actions
   * Used for debugging and preventing duplicate scheduling
   */
  scheduledJobs: defineTable({
    jobId: v.string(), // Unique job ID (Convex scheduler ID)
    roundId: v.number(), // Game round
    action: v.string(), // "end_game" | "send_prize"
    scheduledTime: v.number(), // When to execute (Unix timestamp)
    status: v.string(), // "pending" | "completed" | "failed"
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_round_and_status", ["roundId", "status"])
    .index("by_status", ["status"]),

  // ============================================================================
  // GAME DATA TABLES (Frontend UI)
  // ============================================================================

  /**
   * Characters - Available character sprites for the game
   */
  characters: defineTable({
    name: v.string(),
    id: v.number(),
    assetPath: v.string(), // Path to character spritesheet (e.g., "/characters/orc.png")
    description: v.optional(v.string()), // Character description
    nftCollection: v.optional(v.string()), // NFT collection program address for special/exclusive characters
    nftCollectionName: v.optional(v.string()), // Human-readable name of the NFT collection
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
   */
  maps: defineTable({
    name: v.string(),
    id: v.number(),
    background: v.optional(v.string()), // Background identifier (e.g., "arena_classic")
    assetPath: v.optional(v.string()), // Path to map asset (e.g., "/maps/arena_classic.png")
    description: v.optional(v.string()), // Map description
    spawnConfiguration: v.object({
      maxPlayers: v.number(), // Maximum players for this map
      spawnRadius: v.number(), // Radius for spawn area
      minSpacing: v.number(), // Minimum spacing between spawns
    }),
    isActive: v.boolean(),
  }).index("by_active", ["isActive"]),

  /**
   * Players - User profiles and stats
   */
  players: defineTable({
    walletAddress: v.string(),
    externalWalletAddress: v.optional(v.string()), // External wallet (e.g., Phantom) for NFT verification
    displayName: v.optional(v.string()),
    lastActive: v.number(),
    totalGamesPlayed: v.number(),
    totalWins: v.number(),
    achievements: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),
});
