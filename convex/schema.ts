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
   * Supports 3 types: "free" (evolution), "lootbox", "nft"
   */
  characters: defineTable({
    id: v.number(),
    name: v.string(), // Internal name: "elf0", "bear", "orc"
    displayName: v.optional(v.string()), // UI name: "Elf Apprentice", "Bear"
    assetPath: v.optional(v.string()), // Path to character spritesheet (e.g., "/characters/v2/bear.png")
    description: v.optional(v.string()), // Character description

    // Character acquisition type
    characterType: v.optional(v.string()), // "free" | "lootbox" | "nft"

    // Evolution system (only for free evolution characters)
    evolutionLine: v.optional(v.string()), // "elf", "priest", "pumpkin", "skeleton", "zombie"
    evolutionLevel: v.optional(v.number()), // 0, 1, 2
    winsRequired: v.optional(v.number()), // 0, 20, 50

    // NFT-gated (existing)
    nftCollection: v.optional(v.string()), // NFT collection program address for special/exclusive characters
    nftCollectionName: v.optional(v.string()), // Human-readable name of the NFT collection

    // Rarity (for lootbox weighting and UI effects)
    rarity: v.optional(v.string()), // "common" | "rare" | "legendary"

    // Asset version (for animation format handling)
    assetVersion: v.optional(v.string()), // "v1" = old format, "v2" = new 3-animation format

    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"])
    .index("by_type", ["characterType"])
    .index("by_evolution_line", ["evolutionLine"]),

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
    equippedAuraId: v.optional(v.number()), // Currently equipped aura ID (null = no aura)
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
  // AURA SYSTEM TABLES
  // ============================================================================

  /**
   * Auras - Available aura effects that can be equipped on characters
   * Players can unlock auras via points or SOL purchase
   */
  auras: defineTable({
    id: v.number(), // 1, 2, 3...
    name: v.string(), // "Blue Flame", "Holy Glow", "Magic Aura"
    assetKey: v.string(), // "B", "H", "M" - matches asset file names
    description: v.optional(v.string()),
    rarity: v.string(), // "common" | "rare" | "legendary"
    pointsCost: v.optional(v.number()), // Points required to unlock
    purchasePrice: v.optional(v.number()), // Lamports to purchase (e.g., 0.1 SOL = 100_000_000)
    isActive: v.boolean(),
  }).index("by_aura_id", ["id"]),

  /**
   * Player Auras - Tracks which auras each player has unlocked
   */
  playerAuras: defineTable({
    walletAddress: v.string(), // Player wallet
    auraId: v.number(), // Aura ID
    unlockedAt: v.number(), // Unix timestamp
    unlockedBy: v.string(), // "points" | "purchase"
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_aura", ["walletAddress", "auraId"]),

  /**
   * Shop Purchases - Track all SOL purchase attempts and completions
   * Used for double-spend prevention, purchase history, and debugging
   */
  shopPurchases: defineTable({
    walletAddress: v.string(), // Buyer's wallet address
    itemType: v.string(), // "aura" | "character" | future types
    itemId: v.number(), // ID of the purchased item
    amountLamports: v.number(), // Amount paid in lamports
    status: v.string(), // "pending" | "tx_sent" | "tx_confirmed" | "completed" | "failed"
    txSignature: v.optional(v.string()), // Solana transaction signature (if sent)
    error: v.optional(v.string()), // Error message if failed
    errorStep: v.optional(v.string()), // Where it failed: "build_tx" | "sign_tx" | "confirm_tx" | "record_purchase"
    attemptedAt: v.number(), // Unix timestamp when purchase started
    completedAt: v.optional(v.number()), // Unix timestamp when completed/failed
  })
    .index("by_signature", ["txSignature"])
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_type", ["walletAddress", "itemType"])
    .index("by_status", ["status"])
    .index("by_wallet_and_status", ["walletAddress", "status"]),

  // ============================================================================
  // EVOLUTION SYSTEM TABLES
  // ============================================================================

  /**
   * Player Evolution Progress - Tracks wins per evolution class
   * Used to unlock evolution skins (20 wins = level 1, 50 wins = level 2)
   */
  playerEvolutionProgress: defineTable({
    walletAddress: v.string(),
    evolutionLine: v.string(), // "elf", "priest", "pumpkin", "skeleton", "zombie"
    wins: v.number(), // Total wins with any skin in this evolution line
    unlockedLevel: v.number(), // 0, 1, or 2
    lastWinAt: v.optional(v.number()), // Unix timestamp of last win
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_line", ["walletAddress", "evolutionLine"]),

  /**
   * Player Characters - Tracks which lootbox characters each player owns
   * Evolution characters are unlocked via playerEvolutionProgress
   */
  playerCharacters: defineTable({
    walletAddress: v.string(),
    characterId: v.number(),
    unlockedAt: v.number(), // Unix timestamp
    unlockedBy: v.string(), // "lootbox" | "purchase" | "default"
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_character", ["walletAddress", "characterId"]),

  /**
   * Player Favorites - Tracks which characters are favorited by each player
   * Favorites appear at the top of character selection
   */
  playerFavorites: defineTable({
    walletAddress: v.string(),
    characterId: v.number(),
    favoritedAt: v.number(), // Unix timestamp for ordering
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_character", ["walletAddress", "characterId"]),

  // ============================================================================
  // LOOTBOX SYSTEM TABLES
  // ============================================================================

  /**
   * Lootbox Types - Definitions of available lootbox types
   */
  lootboxTypes: defineTable({
    id: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(), // Lamports (100_000_000 = 0.1 SOL)
    assetKey: v.string(), // "lootBox" - for asset loading
    isActive: v.boolean(),
  }).index("by_lootbox_id", ["id"]),

  /**
   * Lootbox Drops - Items that can drop from each lootbox type
   * Uses weighted random selection with shrinking pool (no duplicates)
   */
  lootboxDrops: defineTable({
    lootboxTypeId: v.number(),
    itemType: v.string(), // "aura" | "character"
    itemId: v.number(),
    weight: v.number(), // Drop weight (higher = more common)
    rarity: v.string(), // "common" | "rare" | "legendary"
  }).index("by_lootbox_type", ["lootboxTypeId"]),

  /**
   * Player Lootboxes - Unopened lootboxes in player inventory
   */
  playerLootboxes: defineTable({
    walletAddress: v.string(),
    lootboxTypeId: v.number(),
    purchasedAt: v.number(), // Unix timestamp
    txSignature: v.string(), // Purchase transaction signature
  })
    .index("by_wallet", ["walletAddress"])
    .index("by_wallet_and_type", ["walletAddress", "lootboxTypeId"]),

  /**
   * Lootbox Openings - History of opened lootboxes
   */
  lootboxOpenings: defineTable({
    walletAddress: v.string(),
    lootboxTypeId: v.number(),
    itemType: v.string(), // What type of item was received
    itemId: v.number(), // Which item was received
    rarity: v.string(), // Rarity of the item
    openedAt: v.number(), // Unix timestamp
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
