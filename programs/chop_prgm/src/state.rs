use anchor_lang::prelude::*;

/// Lobby status constants
pub const LOBBY_STATUS_OPEN: u8 = 0; // Waiting for opponent to join
pub const LOBBY_STATUS_LOCKED: u8 = 1; // Both players in, game in progress
pub const LOBBY_STATUS_FINISHED: u8 = 2; // Game ended, funds distributed

/// Minimum bet amount in lamports (0.001 SOL)
pub const MIN_BET_AMOUNT: u64 = 1_000_000;

/// Maximum combined fees in basis points (5% = 500 bps)
pub const MAX_TOTAL_FEE_BPS: u16 = 500;

/// Game timeout in seconds (1 minutes) - after this, admin can rescue stuck lobbies
pub const GAME_TIMEOUT_SECONDS: i64 = 60;

/// Global configuration account for the CHOP program
#[account]
pub struct ChopConfig {
    pub admin: Pubkey,         // Admin authority (can end games, rescue stuck lobbies)
    pub treasury: Pubkey,      // Platform treasury to receive platform fees
    pub platform_fee_bps: u16, // Platform fee in basis points (250 = 2.5%)
    pub creator_fee_bps: u16,  // Creator fee in basis points (250 = 2.5%)
    pub lobby_count: u64,      // Counter for next lobby ID
}

impl ChopConfig {
    // discriminator(8) + admin(32) + treasury(32) + platform_fee_bps(2) + creator_fee_bps(2) + lobby_count(8)
    pub const SPACE: usize = 8 + 32 + 32 + 2 + 2 + 8;
}

/// A single CHOP lobby (skill-based game)
#[account]
pub struct ChopLobby {
    pub lobby_id: u64,          // Unique lobby identifier
    pub creator: Pubkey,        // Creator's wallet (Player A)
    pub bet_amount: u64,        // Bet amount per player (in lamports)
    pub status: u8,             // 0 = open, 1 = locked, 2 = finished
    pub created_at: i64,        // Creation timestamp
    pub locked_at: i64,         // When Player B joined (0 if not locked)
    pub players: Vec<Pubkey>,   // All players in lobby (for validation)
    pub total_pot: u64,         // Total SOL in pot (both players' bets)
    pub winner: Option<Pubkey>, // Winner's wallet (None until game ends)
}

impl ChopLobby {
    // discriminator(8) + lobby_id(8) + creator(32) + bet_amount(8) + status(1)
    // + created_at(8) + locked_at(8) + players_len(4) + 2*player(64) + total_pot(8) + winner(33)
    pub const SPACE: usize = 8 + 8 + 32 + 8 + 1 + 8 + 8 + 4 + 64 + 8 + 33;
}
