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
    betWalletIndex: v.optional(v.array(v.number())), // Index into wallets array for each bet
    wallets: v.optional(v.array(v.string())), // Array of unique wallet addresses (base58)
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
    // Visual configuration for in-game rendering
    spriteOffsetY: v.optional(v.number()), // Y offset in pixels for in-game (default 0)
    baseScale: v.optional(v.number()), // Base scale multiplier for in-game (default 1.0)
    // Visual configuration for preview rendering (character selection + winner display)
    previewOffsetY: v.optional(v.number()), // Y offset in pixels for preview (default 0)
    previewScale: v.optional(v.number()), // Base scale multiplier for preview (default 1.0)
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
    // XP System fields
    xp: v.optional(v.number()), // Total XP earned
    level: v.optional(v.number()), // Current level (1-10)
    currentWinStreak: v.optional(v.number()), // Consecutive wins for streak bonus
    lastDailyLoginDate: v.optional(v.string()), // ISO date "YYYY-MM-DD" for daily login bonus
    lastDailyBetDate: v.optional(v.string()), // ISO date "YYYY-MM-DD" for first bet of day bonus
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_xp", ["xp"]),

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
   * Payout History - Record of all referral payouts
   * Shows users when they received payments
   */
  payoutHistory: defineTable({
    walletAddress: v.string(), // Referrer's wallet
    amount: v.number(), // Amount paid in lamports
    paidAt: v.number(), // Unix timestamp
    txHash: v.optional(v.string()), // Solana transaction hash (optional)
    note: v.optional(v.string()), // Optional note from admin
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_paid_at", ["paidAt"]),

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
    accumulatedRewards: v.number(), // 1% of totalRevenue - rewards earned (in lamports)
    totalPaidOut: v.optional(v.number()), // Total amount already paid out (in lamports)
    lastPayoutDate: v.optional(v.number()), // Unix timestamp of last payout
    lastPayoutAmount: v.optional(v.number()), // Amount of last payout (in lamports)
    createdAt: v.number(), // When they created their referral link
  }).index("by_wallet", ["walletAddress"])
    .index("by_code", ["referralCode"])
    .index("by_revenue", ["totalRevenue"]), // For leaderboard sorting

  // ============================================================================
  // NFT COLLECTION HOLDER CACHE TABLES
  // ============================================================================

  /**
   * NFT Collection Holders - Cached list of wallet addresses that own NFTs from specific collections
   * Updated every 12 hours via cron job + manual refresh (rate-limited)
   */
  nftCollectionHolders: defineTable({
    collectionAddress: v.string(), // Collection address (base58)
    walletAddress: v.string(), // Holder wallet address (base58)
    nftCount: v.number(), // Number of NFTs owned from this collection
    lastVerified: v.number(), // Unix timestamp when this holder was last verified
    addedBy: v.string(), // "cron" | "manual" - how this entry was created
  })
    .index("by_collection", ["collectionAddress"]) // Query all holders of a collection
    .index("by_collection_and_wallet", ["collectionAddress", "walletAddress"]) // Check specific holder
    .index("by_wallet", ["walletAddress"]), // Query all collections owned by wallet

  /**
   * NFT Refresh Rate Limits - Prevent abuse of manual refresh functionality
   * Users can refresh their NFT status once every 5 minutes
   */
  nftRefreshLimits: defineTable({
    walletAddress: v.string(), // User's wallet address
    lastRefreshAt: v.number(), // Unix timestamp of last refresh
    refreshCount: v.number(), // Total refreshes (for analytics)
  }).index("by_wallet", ["walletAddress"]),

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
    lobbyPda: v.optional(v.string()), // Public key of the Lobby PDA (base58)
    shareToken: v.string(), // 8-char unique token for sharing lobby URL (privacy-focused)

    // Players
    playerA: v.string(), // Player A's wallet address (base58)
    playerB: v.optional(v.string()), // Player B's wallet address (base58, None until joined)

    // Game state
    amount: v.number(), // Bet amount per player (in lamports)
    status: v.number(), // 0 = created (waiting), 1 = awaiting vrf, 2 = resolved
    winner: v.optional(v.string()), // Winner's wallet address (base58, None until resolved)
    isPrivate: v.optional(v.boolean()), // Private lobbies are only joinable via share link

    // Character & Map selection
    characterA: v.number(), // Player A's character/skin ID (0-255)
    characterB: v.optional(v.number()), // Player B's character/skin ID (0-255, None until joined)
    mapId: v.number(), // Map/background ID (0-255)

    // Timestamps
    createdAt: v.number(), // When lobby was created (Unix timestamp)
    resolvedAt: v.optional(v.number()), // When lobby was resolved (Unix timestamp)

    // Transaction hashes
    settleTxHash: v.optional(v.string()), // Solana transaction hash for settlement (base58)

    // Prize (parsed from on-chain settlement)
    prizeAmount: v.optional(v.number()), // Actual prize won in lamports (from tx logs)

    // Win streak (for consecutive double-down wins)
    winStreak: v.optional(v.number()), // Current streak count (increments on double-down win)
  })
    .index("by_status", ["status"]) // Query open lobbies (status = 0)
    .index("by_player_a", ["playerA"]) // Query lobbies by Player A
    .index("by_player_b", ["playerB"]) // Query lobbies by Player B
    .index("by_status_and_created", ["status", "createdAt"]) // For pagination and stuck lobby detection
    .index("by_lobbyId", ["lobbyId"]) // Query specific lobby by ID
    .index("by_shareToken", ["shareToken"]), // Fast lookup by share token for URL-based access

    

  // ============================================================================
  // PLATFORM STATS TABLE (incremental, not recomputed)
  // ============================================================================

  /**
   * Platform Stats - Running totals for TVL and earnings
   * Single row, updated incrementally when each game finishes
   */
  platformStats: defineTable({
    key: v.string(), // Always "global" - single row
    totalPotLamports: v.number(), // Sum of all game pots (TVL)
    earningsLamports: v.number(), // Sum of house fees (5% of multi-player pots)
    gamesCount: v.number(), // Total finished games
  }).index("by_key", ["key"]),

  // ============================================================================
  // AUTO-BETTING BOT TABLES
  // ============================================================================

  /**
   * Bot Purchases - Track which tiers each user has unlocked
   * Users can own multiple bots (Rookie, Pro, Elite) simultaneously
   * Each tier is a one-time purchase with its own configuration
   */
  botPurchases: defineTable({
    walletAddress: v.string(), // User's wallet address
    tier: v.string(), // "rookie" | "pro" | "elite"
    purchasedAt: v.number(), // Unix timestamp of purchase
    transactionSignature: v.string(), // Solana tx signature for purchase verification
    purchaseAmount: v.number(), // Amount paid in lamports
    isActiveBot: v.optional(v.boolean()), // Is this the currently active bot for this user
  })
    .index("by_wallet", ["walletAddress"]) // Query all bots owned by user
    .index("by_wallet_and_tier", ["walletAddress", "tier"]), // Prevent duplicate tier purchases

  /**
   * Bot Configurations - User's bot settings and state
   * Persists bot configuration and tracks spending/performance
   */
  botConfigurations: defineTable({
    walletAddress: v.string(),
    tier: v.string(), // "rookie" | "pro" | "elite"
    isActive: v.boolean(), // Is the bot currently running

    // Rookie settings (all tiers)
    fixedBetAmount: v.optional(v.number()), // Fixed bet in lamports
    selectedCharacter: v.optional(v.number()), // Character skin ID
    budgetLimit: v.optional(v.number()), // Max spending limit in lamports
    currentSpent: v.optional(v.number()), // Track spending against budget

    // Pro settings (Pro + Elite tiers)
    betMin: v.optional(v.number()), // Min bet in range (lamports)
    betMax: v.optional(v.number()), // Max bet in range (lamports)
    stopLoss: v.optional(v.number()), // Stop if losses reach X lamports
    winStreakMultiplier: v.optional(v.number()), // Multiplier after wins (e.g., 1.5)
    cooldownRounds: v.optional(v.number()), // Skip N rounds between bets
    characterRotation: v.optional(v.array(v.number())), // List of character IDs to rotate

    // Elite settings (Elite tier only)
    takeProfit: v.optional(v.number()), // Auto-stop when up X lamports
    martingaleEnabled: v.optional(v.boolean()), // Double bet after loss
    antiMartingaleEnabled: v.optional(v.boolean()), // Double bet after win
    scheduleStart: v.optional(v.number()), // Hour to start (0-23 UTC)
    scheduleEnd: v.optional(v.number()), // Hour to end (0-23 UTC)
    smartSizing: v.optional(v.boolean()), // Bet more when pot is small
    smartSizingThreshold: v.optional(v.number()), // Pot threshold in lamports

    // State tracking
    consecutiveWins: v.optional(v.number()),
    consecutiveLosses: v.optional(v.number()),
    lastBetAmount: v.optional(v.number()),
    roundsSkipped: v.optional(v.number()),
    totalProfit: v.optional(v.number()), // Track P&L (can be negative)
    totalBets: v.optional(v.number()), // Total bets placed
    totalWins: v.optional(v.number()), // Total wins

    // Session signer state
    sessionSignerEnabled: v.optional(v.boolean()),
    lastUpdated: v.number(),
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_tier", ["walletAddress", "tier"]) // Each tier has its own config
    .index("by_active", ["isActive"]),

  /**
   * Bot Performance Stats - Historical tracking of bot bets
   * Used for analytics and performance display
   */
  botPerformanceStats: defineTable({
    walletAddress: v.string(),
    roundId: v.number(),
    betAmount: v.number(), // Bet amount in lamports
    result: v.string(), // "win" | "loss" | "refund"
    prizeAmount: v.optional(v.number()), // Prize won (if win)
    profit: v.number(), // Can be negative for losses
    timestamp: v.number(),
    strategy: v.optional(v.string()), // Which strategy was used
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_round", ["walletAddress", "roundId"])
    .index("by_timestamp", ["timestamp"]),

  // ============================================================================
  // PWA PUSH NOTIFICATION TABLES
  // ============================================================================

  /**
   * Push Subscriptions - Store user push notification subscriptions
   * Used to send notifications when games start, even when app is closed
   */
  pushSubscriptions: defineTable({
    walletAddress: v.optional(v.string()), // User's wallet (optional - can subscribe before login)
    endpoint: v.string(), // Push service endpoint URL
    p256dh: v.string(), // Public key for encryption
    auth: v.string(), // Auth secret for encryption
    createdAt: v.number(), // When subscription was created
    lastUsed: v.optional(v.number()), // Last time notification was sent
    userAgent: v.optional(v.string()), // Browser/device info
    isActive: v.boolean(), // Whether subscription is still valid
  })
    .index("by_endpoint", ["endpoint"]) // Prevent duplicate subscriptions
    .index("by_wallet", ["walletAddress"]) // Query user's subscriptions
    .index("by_active", ["isActive"]), // Query active subscriptions for broadcast

  // ============================================================================
  // CURRENT GAME PARTICIPANTS TABLE
  // ============================================================================

  /**
   * Current Game Participants - Unified participant data for the active game
   * One row per "character on screen":
   * - Boss: ONE entry (character locked, betAmount = total of all bets)
   * - Non-boss: ONE entry PER BET (each bet = separate character)
   *
   * Cleared when game ends and new game starts
   */
  currentGameParticipants: defineTable({
    odid: v.string(), // Unique ID: walletAddress for boss, wallet_betIndex for others
    walletAddress: v.string(),
    displayName: v.string(), // Resolved player name or truncated wallet
    gameRound: v.number(), // Which game round this belongs to

    // Character info
    characterId: v.number(), // Skin ID from blockchain
    characterKey: v.string(), // Sprite key for Phaser (e.g., "warrior", "orc")

    // Bet info
    betIndex: v.number(), // Original index in blockchain bets array
    betAmount: v.number(), // In SOL (boss: total, others: single bet)
    position: v.array(v.number()), // [x, y] spawn position from blockchain

    // Flags
    isBoss: v.boolean(), // Previous winner gets special treatment
    spawnIndex: v.number(), // For spawn position calculation
  })
    .index("by_gameRound", ["gameRound"])
    .index("by_odid", ["odid"])
    .index("by_walletAddress", ["walletAddress"]),

  // ============================================================================
  // CHAT TABLES
  // ============================================================================

  /**
   * Chat Messages - Global chat messages for player communication
   * Includes user messages and system announcements (winners)
   */
  chatMessages: defineTable({
    senderWallet: v.optional(v.string()), // Sender wallet (null for system messages)
    senderName: v.optional(v.string()), // Display name if available
    message: v.string(), // Message content (max 200 chars)
    type: v.string(), // "user" | "system" | "winner"
    gameType: v.optional(v.string()), // "domin8" | "1v1" (for winner messages)
    timestamp: v.number(), // When message was sent
  })
    .index("by_timestamp", ["timestamp"]) // For fetching recent messages
    .index("by_sender_and_time", ["senderWallet", "timestamp"]), // For rate limiting

  // ============================================================================
  // PRESENCE BOT TABLE
  // ============================================================================

  /**
   * Presence Bot Spawns - Track which game rounds have had a bot spawned
   * One bot max per round - triggered when user views arena and no players exist
   */
  presenceBotSpawns: defineTable({
    roundId: v.number(), // Game round ID
    spawnedAt: v.number(), // Unix timestamp when bot was spawned
  }).index("by_round", ["roundId"]),
});
    
