import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  real,
  json,
  uniqueIndex,
  index,
  timestamp,
} from "drizzle-orm/pg-core";

// ============================================================================
// BLOCKCHAIN DATA TABLES
// ============================================================================

/**
 * Game Round States - Snapshots of game round state from blockchain
 * Stores states per round: waiting -> finished
 */
export const gameRoundStates = pgTable(
  "game_round_states",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id").notNull(),
    status: text("status").notNull(), // "waiting" | "finished"

    // Timestamps
    startTimestamp: bigint("start_timestamp", { mode: "number" }).notNull().default(0),
    endTimestamp: bigint("end_timestamp", { mode: "number" }).notNull().default(0),
    capturedAt: bigint("captured_at", { mode: "number" }).notNull().default(0),

    // Game configuration
    mapId: integer("map_id"),

    // Game state (snapshot from blockchain)
    betCount: integer("bet_count"),
    betAmounts: json("bet_amounts").$type<number[]>(),
    betSkin: json("bet_skin").$type<number[]>(),
    betPosition: json("bet_position").$type<number[][]>(),
    betWalletIndex: json("bet_wallet_index").$type<number[]>(),
    wallets: json("wallets").$type<string[]>(),
    totalPot: bigint("total_pot", { mode: "number" }),
    winner: text("winner"),
    winningBetIndex: integer("winning_bet_index").default(0),
    prizeSent: boolean("prize_sent").default(false),
  },
  (table) => [
    uniqueIndex("idx_grs_round_status").on(table.roundId, table.status),
    index("idx_grs_round_id").on(table.roundId),
    index("idx_grs_status").on(table.status),
    index("idx_grs_status_round").on(table.status, table.roundId),
    index("idx_grs_captured_at").on(table.capturedAt),
  ]
);

// ============================================================================
// SCHEDULER TABLES
// ============================================================================

/**
 * Scheduled Jobs - Track scheduled game progression actions
 */
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: serial("id").primaryKey(),
    jobId: text("job_id").notNull(),
    roundId: integer("round_id").notNull(),
    action: text("action").notNull(), // "end_game" | "send_prize" | "create_game"
    scheduledTime: bigint("scheduled_time", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"), // "pending" | "completed" | "failed"
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    completedAt: bigint("completed_at", { mode: "number" }),
    error: text("error"),
  },
  (table) => [
    index("idx_sj_round_status").on(table.roundId, table.status),
    index("idx_sj_status").on(table.status),
  ]
);

// ============================================================================
// GAME DATA TABLES
// ============================================================================

/**
 * Characters - Available character sprites for the game
 */
export const characters = pgTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    name: text("name").notNull(),
    assetPath: text("asset_path"),
    description: text("description"),
    nftCollection: text("nft_collection"),
    nftCollectionName: text("nft_collection_name"),
    isActive: boolean("is_active").notNull().default(true),
    spriteOffsetY: real("sprite_offset_y").default(0),
    baseScale: real("base_scale").default(1.0),
    previewOffsetY: real("preview_offset_y").default(0),
    previewScale: real("preview_scale").default(1.0),
  },
  (table) => [
    uniqueIndex("idx_chars_character_id").on(table.characterId),
    index("idx_chars_active").on(table.isActive),
  ]
);

/**
 * Maps - Available game maps/arenas
 */
export const maps = pgTable(
  "maps",
  {
    id: serial("id").primaryKey(),
    mapId: integer("map_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    spawnConfiguration: json("spawn_configuration").$type<{
      centerX: number;
      centerY: number;
      radiusX: number;
      radiusY: number;
      minSpawnRadius: number;
      maxSpawnRadius: number;
      minSpacing: number;
    }>(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("idx_maps_map_id").on(table.mapId),
    index("idx_maps_active").on(table.isActive),
  ]
);

/**
 * Players - User profiles and stats
 */
export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    externalWalletAddress: text("external_wallet_address"),
    displayName: text("display_name"),
    lastActive: bigint("last_active", { mode: "number" }).notNull().default(0),
    totalGamesPlayed: integer("total_games_played").notNull().default(0),
    totalWins: integer("total_wins").notNull().default(0),
    totalPoints: integer("total_points").default(0),
    achievements: json("achievements").$type<string[]>().default([]),
    // XP System
    xp: integer("xp").default(0),
    level: integer("level").default(1),
    currentWinStreak: integer("current_win_streak").default(0),
    lastDailyLoginDate: text("last_daily_login_date"),
    lastDailyBetDate: text("last_daily_bet_date"),
  },
  (table) => [
    uniqueIndex("idx_players_wallet").on(table.walletAddress),
    index("idx_players_xp").on(table.xp),
  ]
);

// ============================================================================
// REFERRAL SYSTEM TABLES
// ============================================================================

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: text("referrer_id").notNull(),
    referredUserId: text("referred_user_id").notNull(),
    referralCode: text("referral_code").notNull(),
    signupDate: bigint("signup_date", { mode: "number" }).notNull(),
    totalBetVolume: bigint("total_bet_volume", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("active"),
  },
  (table) => [
    index("idx_ref_referrer").on(table.referrerId),
    index("idx_ref_referred_user").on(table.referredUserId),
    index("idx_ref_code").on(table.referralCode),
  ]
);

export const payoutHistory = pgTable(
  "payout_history",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    paidAt: bigint("paid_at", { mode: "number" }).notNull(),
    txHash: text("tx_hash"),
    note: text("note"),
  },
  (table) => [
    index("idx_ph_wallet").on(table.walletAddress),
    index("idx_ph_paid_at").on(table.paidAt),
  ]
);

export const referralStats = pgTable(
  "referral_stats",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    referralCode: text("referral_code").notNull(),
    totalReferred: integer("total_referred").notNull().default(0),
    totalRevenue: bigint("total_revenue", { mode: "number" }).notNull().default(0),
    accumulatedRewards: bigint("accumulated_rewards", { mode: "number" }).notNull().default(0),
    totalPaidOut: bigint("total_paid_out", { mode: "number" }).default(0),
    lastPayoutDate: bigint("last_payout_date", { mode: "number" }),
    lastPayoutAmount: bigint("last_payout_amount", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_rs_wallet").on(table.walletAddress),
    uniqueIndex("idx_rs_code").on(table.referralCode),
    index("idx_rs_revenue").on(table.totalRevenue),
  ]
);

// ============================================================================
// NFT COLLECTION HOLDER CACHE TABLES
// ============================================================================

export const nftCollectionHolders = pgTable(
  "nft_collection_holders",
  {
    id: serial("id").primaryKey(),
    collectionAddress: text("collection_address").notNull(),
    walletAddress: text("wallet_address").notNull(),
    nftCount: integer("nft_count").notNull().default(0),
    lastVerified: bigint("last_verified", { mode: "number" }).notNull(),
    addedBy: text("added_by").notNull().default("cron"),
  },
  (table) => [
    index("idx_nfth_collection").on(table.collectionAddress),
    uniqueIndex("idx_nfth_collection_wallet").on(
      table.collectionAddress,
      table.walletAddress
    ),
    index("idx_nfth_wallet").on(table.walletAddress),
  ]
);

export const nftRefreshLimits = pgTable(
  "nft_refresh_limits",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    lastRefreshAt: bigint("last_refresh_at", { mode: "number" }).notNull(),
    refreshCount: integer("refresh_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_nrl_wallet").on(table.walletAddress),
  ]
);

// ============================================================================
// 1V1 LOBBY TABLES
// ============================================================================

export const oneVOneLobbies = pgTable(
  "one_v_one_lobbies",
  {
    id: serial("id").primaryKey(),
    lobbyId: integer("lobby_id").notNull(),
    lobbyPda: text("lobby_pda"),
    shareToken: text("share_token").notNull(),

    // Players
    playerA: text("player_a").notNull(),
    playerB: text("player_b"),

    // Game state
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: integer("status").notNull().default(0), // 0=created, 1=awaiting_vrf, 2=vrf_received, 3=resolved
    winner: text("winner"),
    isPrivate: boolean("is_private").default(false),

    // Character & Map
    characterA: integer("character_a").notNull(),
    characterB: integer("character_b"),
    mapId: integer("map_id").notNull(),

    // Timestamps
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    resolvedAt: bigint("resolved_at", { mode: "number" }),

    // Settlement
    settleTxHash: text("settle_tx_hash"),
    prizeAmount: bigint("prize_amount", { mode: "number" }),
    winStreak: integer("win_streak").default(0),
  },
  (table) => [
    uniqueIndex("idx_1v1_lobby_id").on(table.lobbyId),
    uniqueIndex("idx_1v1_share_token").on(table.shareToken),
    index("idx_1v1_status").on(table.status),
    index("idx_1v1_player_a").on(table.playerA),
    index("idx_1v1_player_b").on(table.playerB),
    index("idx_1v1_status_created").on(table.status, table.createdAt),
  ]
);

// ============================================================================
// PLATFORM STATS TABLE
// ============================================================================

export const platformStats = pgTable(
  "platform_stats",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().default("global"),
    totalPotLamports: bigint("total_pot_lamports", { mode: "number" }).notNull().default(0),
    earningsLamports: bigint("earnings_lamports", { mode: "number" }).notNull().default(0),
    gamesCount: integer("games_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_ps_key").on(table.key),
  ]
);

// ============================================================================
// AUTO-BETTING BOT TABLES
// ============================================================================

export const botPurchases = pgTable(
  "bot_purchases",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    tier: text("tier").notNull(), // "rookie" | "pro" | "elite"
    purchasedAt: bigint("purchased_at", { mode: "number" }).notNull(),
    transactionSignature: text("transaction_signature").notNull(),
    purchaseAmount: bigint("purchase_amount", { mode: "number" }).notNull(),
    isActiveBot: boolean("is_active_bot").default(false),
  },
  (table) => [
    index("idx_bp_wallet").on(table.walletAddress),
    uniqueIndex("idx_bp_wallet_tier").on(table.walletAddress, table.tier),
  ]
);

export const botConfigurations = pgTable(
  "bot_configurations",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    tier: text("tier").notNull(),
    isActive: boolean("is_active").notNull().default(false),

    // Rookie settings
    fixedBetAmount: bigint("fixed_bet_amount", { mode: "number" }),
    selectedCharacter: integer("selected_character"),
    budgetLimit: bigint("budget_limit", { mode: "number" }),
    currentSpent: bigint("current_spent", { mode: "number" }).default(0),

    // Pro settings
    betMin: bigint("bet_min", { mode: "number" }),
    betMax: bigint("bet_max", { mode: "number" }),
    stopLoss: bigint("stop_loss", { mode: "number" }),
    winStreakMultiplier: real("win_streak_multiplier"),
    cooldownRounds: integer("cooldown_rounds"),
    characterRotation: json("character_rotation").$type<number[]>(),

    // Elite settings
    takeProfit: bigint("take_profit", { mode: "number" }),
    martingaleEnabled: boolean("martingale_enabled").default(false),
    antiMartingaleEnabled: boolean("anti_martingale_enabled").default(false),
    scheduleStart: integer("schedule_start"),
    scheduleEnd: integer("schedule_end"),
    smartSizing: boolean("smart_sizing").default(false),
    smartSizingThreshold: bigint("smart_sizing_threshold", { mode: "number" }),

    // State tracking
    consecutiveWins: integer("consecutive_wins").default(0),
    consecutiveLosses: integer("consecutive_losses").default(0),
    lastBetAmount: bigint("last_bet_amount", { mode: "number" }),
    roundsSkipped: integer("rounds_skipped").default(0),
    totalProfit: bigint("total_profit", { mode: "number" }).default(0),
    totalBets: integer("total_bets").default(0),
    totalWins: integer("total_wins").default(0),

    // Session signer
    sessionSignerEnabled: boolean("session_signer_enabled").default(false),
    lastUpdated: bigint("last_updated", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_bc_wallet").on(table.walletAddress),
    uniqueIndex("idx_bc_wallet_tier").on(table.walletAddress, table.tier),
    index("idx_bc_active").on(table.isActive),
  ]
);

export const botPerformanceStats = pgTable(
  "bot_performance_stats",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    roundId: integer("round_id").notNull(),
    betAmount: bigint("bet_amount", { mode: "number" }).notNull(),
    result: text("result").notNull().default("pending"), // "win" | "loss" | "refund" | "pending"
    prizeAmount: bigint("prize_amount", { mode: "number" }),
    profit: bigint("profit", { mode: "number" }).notNull().default(0),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    strategy: text("strategy"),
  },
  (table) => [
    index("idx_bps_wallet").on(table.walletAddress),
    uniqueIndex("idx_bps_wallet_round").on(table.walletAddress, table.roundId),
    index("idx_bps_timestamp").on(table.timestamp),
  ]
);

// ============================================================================
// PWA PUSH NOTIFICATION TABLES
// ============================================================================

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address"),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastUsed: bigint("last_used", { mode: "number" }),
    userAgent: text("user_agent"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("idx_push_endpoint").on(table.endpoint),
    index("idx_push_wallet").on(table.walletAddress),
    index("idx_push_active").on(table.isActive),
  ]
);

// ============================================================================
// CURRENT GAME PARTICIPANTS TABLE
// ============================================================================

export const currentGameParticipants = pgTable(
  "current_game_participants",
  {
    id: serial("id").primaryKey(),
    odid: text("odid").notNull(),
    walletAddress: text("wallet_address").notNull(),
    displayName: text("display_name").notNull(),
    gameRound: integer("game_round").notNull(),

    // Character info
    characterId: integer("character_id").notNull(),
    characterKey: text("character_key").notNull(),

    // Bet info
    betIndex: integer("bet_index").notNull(),
    betAmount: real("bet_amount").notNull(), // In SOL
    position: json("position").$type<number[]>().notNull(),

    // Flags
    isBoss: boolean("is_boss").notNull().default(false),
    spawnIndex: integer("spawn_index").notNull(),
  },
  (table) => [
    uniqueIndex("idx_cgp_odid").on(table.odid),
    index("idx_cgp_game_round").on(table.gameRound),
    index("idx_cgp_wallet").on(table.walletAddress),
  ]
);

// ============================================================================
// CHAT TABLES
// ============================================================================

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    senderWallet: text("sender_wallet"),
    senderName: text("sender_name"),
    message: text("message").notNull(),
    type: text("type").notNull().default("user"), // "user" | "system" | "winner"
    gameType: text("game_type"), // "domin8" | "1v1"
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_chat_timestamp").on(table.timestamp),
    index("idx_chat_sender_time").on(table.senderWallet, table.timestamp),
  ]
);

// ============================================================================
// PRESENCE BOT TABLE
// ============================================================================

export const presenceBotSpawns = pgTable(
  "presence_bot_spawns",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id").notNull(),
    spawnedAt: bigint("spawned_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_pbs_round").on(table.roundId),
  ]
);
