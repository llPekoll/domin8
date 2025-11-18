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
    .index("by_status_and_round", ["status", "roundId"]) // Query by status, ordered by roundId
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
    assetPath: v.optional(v.string()), // Path to character spritesheet (e.g., "/characters/orc.png")
    description: v.optional(v.string()), // Character description
    nftCollection: v.optional(v.string()), // NFT collection program address for special/exclusive characters
    nftCollectionName: v.optional(v.string()), // Human-readable name of the NFT collection
    isActive: v.boolean(),
  }).index("by_active", ["isActive"]),

  /**
   * Maps - Available game maps/arenas
   */
  maps: defineTable({
    name: v.string(),
    id: v.number(),
    description: v.optional(v.string()), // Map description
    spawnConfiguration: v.object({
      centerX: v.number(), // Center X position in pixels
      centerY: v.number(), // Center Y position in pixels (from top of image)
      radiusX: v.number(), // Horizontal ellipse radius (from Aseprite measurement)
      radiusY: v.number(), // Vertical ellipse radius (max of top/bottom)
      minSpawnRadius: v.number(), // Inner dead zone (avoid center clustering)
      maxSpawnRadius: v.number(), // Outer spawn boundary (radiusY - character margin)
      minSpacing: v.number(), // Minimum distance between character spawns
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
    totalPoints: v.optional(v.number()), // Points earned from bets and prizes (1 point per 0.001 SOL)
    achievements: v.array(v.string()),
  }).index("by_wallet", ["walletAddress"]),

  // ============================================================================
  // REFERRAL SYSTEM TABLES
  // ============================================================================

  /**
   * Referrals - Individual referral relationships
   * Tracks which users were referred by whom
   */
  referrals: defineTable({
    referrerId: v.string(), // Wallet address of the person who referred
    referredUserId: v.string(), // Wallet address of the person who signed up
    referralCode: v.string(), // The referral code used
    signupDate: v.number(), // Unix timestamp when they signed up
    totalBetVolume: v.number(), // Total SOL (in lamports) bet by this referred user
    status: v.string(), // "active" | "inactive"
  })
    .index("by_referrer", ["referrerId"]) // Query all users referred by someone
    .index("by_referred_user", ["referredUserId"]) // Check if user was referred
    .index("by_referral_code", ["referralCode"]), // Look up by code during signup

  /**
   * Referral Stats - Aggregated statistics per referrer
   * Used for leaderboards and personal dashboards
   * Rank is calculated on-demand, not stored
   */
  referralStats: defineTable({
    walletAddress: v.string(), // Referrer's wallet address
    referralCode: v.string(), // Their unique referral code
    totalReferred: v.number(), // Count of users they've referred
    totalRevenue: v.number(), // Sum of all referred users' bet volume (in lamports)
    accumulatedRewards: v.number(), // 1.5% of totalRevenue - rewards earned (in lamports)
    createdAt: v.number(), // When they created their referral link
  }).index("by_wallet", ["walletAddress"])
    .index("by_code", ["referralCode"])
    .index("by_revenue", ["totalRevenue"]), // For leaderboard sorting

  // ============================================================================
  // 1V1 LOBBY TABLES
  // ============================================================================

  /**
   * OneVOne Lobbies - Track 1v1 coinflip games
   * Mirrors the on-chain Domin81v1Lobby PDA accounts
   */
  oneVOneLobbies: defineTable({
    // Identifiers
    lobbyId: v.number(), // Unique lobby ID from on-chain
    lobbyPda: v.string(), // Public key of the Lobby PDA (base58)

    // Players
    playerA: v.string(), // Player A's wallet address (base58)
    playerB: v.optional(v.string()), // Player B's wallet address (base58, None until joined)

    // Game state
    amount: v.number(), // Bet amount per player (in lamports)
    status: v.number(), // 0 = created (waiting), 1 = resolved
    winner: v.optional(v.string()), // Winner's wallet address (base58, None until resolved)

    // Character & Map selection
    characterA: v.number(), // Player A's character/skin ID (0-255)
    characterB: v.optional(v.number()), // Player B's character/skin ID (0-255, None until joined)
    mapId: v.number(), // Map/background ID (0-255)

    // Positioning (optional, for future expansion)
    positionA: v.optional(v.array(v.number())), // [x, y] spawn position for Player A
    positionB: v.optional(v.array(v.number())), // [x, y] spawn position for Player B

    // Timestamps
    createdAt: v.number(), // When lobby was created (Unix timestamp)
    resolvedAt: v.optional(v.number()), // When lobby was resolved (Unix timestamp)
  })
    .index("by_status", ["status"]) // Query open lobbies (status = 0)
    .index("by_player_a", ["playerA"]) // Query lobbies by Player A
    .index("by_player_b", ["playerB"]) // Query lobbies by Player B
    .index("by_status_and_created", ["status", "createdAt"]), // For pagination and stuck lobby detection
});
