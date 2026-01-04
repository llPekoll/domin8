use anchor_lang::prelude::*;

/// Lobby status constants
pub const LOBBY_STATUS_OPEN: u8 = 0;          // Waiting for Player B to join
pub const LOBBY_STATUS_AWAITING_VRF: u8 = 1;  // Both players in, waiting for VRF callback
pub const LOBBY_STATUS_READY: u8 = 2;         // VRF received, ready to settle (then PDA closes)

/// Minimum bet amount in lamports (0.003 SOL)
pub const MIN_BET_AMOUNT: u64 = 3_000_000;

/// VRF timeout in seconds (1 hour) - after this, admin can rescue stuck lobbies
pub const VRF_TIMEOUT_SECONDS: i64 = 3600;

/// Maximum house fee in basis points (5% = 500 bps)
pub const MAX_HOUSE_FEE_BPS: u16 = 500;


/// Global configuration account for the 1v1 program
#[account]
pub struct Domin81v1Config {
    pub admin: Pubkey,              // Admin authority
    pub treasury: Pubkey,           // Treasury to receive house fees
    pub house_fee_bps: u16,         // House fee in basis points (100 = 1%)
    pub lobby_count: u64,           // Counter for next lobby ID
}

impl Domin81v1Config {
    pub const SPACE: usize = 8 + 32 + 32 + 2 + 8; // discriminator + fields
}

/// A single 1v1 lobby (coinflip game)
#[account]
pub struct Domin81v1Lobby {
    pub lobby_id: u64,              // Unique lobby identifier
    pub player_a: Pubkey,           // Player A's wallet
    pub player_b: Option<Pubkey>,   // Player B's wallet (None until joined)
    pub amount: u64,                // Bet amount per player (in lamports)
    pub force: [u8; 32],            // Seed used for MagicBlock VRF request
    pub status: u8,                 // 0 = created, 1 = awaiting vrf, 2 = resolved
    pub winner: Option<Pubkey>,     // Winner's wallet (None until resolved)
    pub created_at: i64,            // Creation timestamp
    pub skin_a: u8,                 // Player A's character skin ID (0-255)
    pub skin_b: Option<u8>,         // Player B's character skin ID (None until joined)
    pub map: u8,                    // Map/background ID (0-255)
    pub randomness: Option<[u8; 32]>, // VRF randomness (None until callback)
}

impl Domin81v1Lobby {
    // discriminator(8) + lobby_id(8) + player_a(32) + player_b(33) + amount(8) + force(32)
    // + status(1) + winner(33) + created_at(8) + skin_a(1) + skin_b(2) + map(1) + randomness(33)
    pub const SPACE: usize = 8 + 8 + 32 + 33 + 8 + 32 + 1 + 33 + 8 + 1 + 2 + 1 + 33;
}
