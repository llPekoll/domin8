import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================================
  // BLOCKCHAIN DATA TABLES
  // ============================================================================

  /**
   * Blockchain Events - Raw events from Solana program logs
   * Stores all emitted events (GameCreated, BetPlaced, WinnerSelected, etc.)
   */
  blockchainEvents: defineTable({
    // Event identification
    eventName: v.string(), // e.g., "GameCreated", "BetPlaced", "WinnerSelected"
    signature: v.string(), // Transaction signature (unique)
    slot: v.number(), // Solana slot number
    blockTime: v.optional(v.number()), // Unix timestamp from blockchain (optional for immediate processing)

    // Event data (raw JSON)
    eventData: v.any(), // Full event data as parsed from logs

    // Metadata
    roundId: v.optional(v.number()), // Game round ID (if applicable)
    processed: v.boolean(), // Whether the event has been processed into database records
    processedAt: v.optional(v.number()), // When the event was processed
  })
    .index("by_signature", ["signature"]) // Prevent duplicates
    .index("by_event_name", ["eventName"]) // Query by event type
    .index("by_round_id", ["roundId"]) // Query events for specific round
    .index("by_slot", ["slot"]) // Chronological ordering by slot
    .index("by_block_time", ["blockTime"]) // Chronological ordering by block time
    .index("by_processed", ["processed"]), // Query unprocessed events

  /**
   * Game Round States - Snapshots of game round PDA state
   * Stores 3 states per round: waiting → awaitingWinnerRandomness → finished
   */
  gameRoundStates: defineTable({
    // Round identification
    roundId: v.number(), // Game round ID
    status: v.string(), // "waiting" | "awaitingWinnerRandomness" | "finished"

    // Timestamps
    startTimestamp: v.number(), // When round started (Unix timestamp)
    endTimestamp: v.number(), // When betting window closes
    capturedAt: v.number(), // When this state was captured (Unix timestamp)

    // Game configuration (selected when round is created)
    mapId: v.optional(v.id("maps")), // Which map/arena this round uses (all players see same map)

    // Game state (snapshot from blockchain)
    betCount: v.number(), // Number of bets placed
    betAmounts: v.array(v.number()), // Array of bet amounts (max 64)
    betSkin: v.array(v.number()), // Array of skin IDs (u8, max 64) - from GameRound.bet_skin
    betPosition: v.array(v.array(v.number())), // Array of [x, y] positions (u16, max 64) - from GameRound.bet_position
    totalPot: v.number(), // Total accumulated pot in lamports
    winner: v.union(v.string(), v.null()), // Winner wallet (base58), null if not determined
    winningBetIndex: v.number(), // Index of winning bet

    // VRF data
    vrfRequestPubkey: v.union(v.string(), v.null()), // VRF request public key
    vrfSeed: v.array(v.number()), // VRF seed bytes
    randomnessFulfilled: v.boolean(), // Whether VRF has been fulfilled

    // Single-player fields (for auto-refund tracking)
    winnerPrizeUnclaimed: v.optional(v.number()), // Unclaimed prize amount
  })
    .index("by_round_and_status", ["roundId", "status"]) // Prevent duplicate states (PRIMARY)
    .index("by_round_id", ["roundId"]) // Query all states for a round
    .index("by_status", ["status"]) // Query rounds by status
    .index("by_captured_at", ["capturedAt"]), // Chronological ordering

  bets: defineTable({
    // Core identifiers
    roundId: v.id("gameRoundStates"),
    walletAddress: v.string(),

    // Financial data
    amount: v.number(), // Bet amount in SOL

    placedAt: v.number(), // Timestamp when bet was placed
    // Participant data (only for self/bank bets, null for spectator)
    characterId: v.optional(v.id("characters")),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),

    // Blockchain tracking
    betIndex: v.optional(v.number()), // Index of this bet in the round (0, 1, 2, ...) - REQUIRED from blockchain
    txSignature: v.optional(v.string()), // Transaction signature
    timestamp: v.optional(v.number()), // When bet was placed (for event listener)
  })
    .index("by_round", ["roundId"])
    .index("by_wallet", ["walletAddress"])
    .index("by_round_wallet", ["roundId", "walletAddress"])
    .index("by_round_index", ["roundId", "betIndex"]) // Query bets by round and index
    .index("by_character", ["characterId"])
    .index("by_tx_signature", ["txSignature"]),
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
    action: v.string(), // "close_betting" | "check_vrf"
    scheduledTime: v.number(), // When to execute (Unix timestamp)
    status: v.string(), // "pending" | "completed" | "failed"
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_round_and_status", ["roundId", "status"])
    .index("by_status", ["status"]),

  // ============================================================================
  // FRONTEND UI TABLES (existing)
  // ============================================================================

  /**
   * Characters - Available character sprites for the game
   */
  characters: defineTable({
    name: v.string(),
    id: v.optional(v.number()),
    assetPath: v.string(), // Path to character spritesheet (e.g., "/characters/orc.png")
    description: v.optional(v.string()), // Character description
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
    background: v.string(), // Background identifier (e.g., "arena_classic")
    assetPath: v.string(), // Path to map asset (e.g., "/maps/arena_classic.png")
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
    displayName: v.optional(v.string()),
    lastActive: v.number(),
    totalGamesPlayed: v.number(),
    totalWins: v.number(),
    achievements: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),
});
