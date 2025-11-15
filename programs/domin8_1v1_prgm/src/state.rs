use anchor_lang::prelude::*;

/// Lobby status constants
pub const LOBBY_STATUS_CREATED: u8 = 0;    // Waiting for second player
pub const LOBBY_STATUS_RESOLVED: u8 = 1;   // Both players joined, winner determined, funds distributed

/// Global configuration account for the 1v1 program
#[account]
pub struct Domin81v1Config {
    pub admin: Pubkey,              // Admin authority
    pub treasury: Pubkey,           // Treasury to receive house fees
    pub house_fee_bps: u16,         // House fee in basis points (100 = 1%)
    pub lobby_count: u64,           // Counter for next lobby ID
    pub bump: u8,                   // PDA bump
}

impl Domin81v1Config {
    pub const SPACE: usize = 8 + 32 + 32 + 2 + 8 + 1; // discriminator + fields
}

/// A single 1v1 lobby (coinflip game)
#[account]
pub struct Domin81v1Lobby {
    pub lobby_id: u64,              // Unique lobby identifier
    pub player_a: Pubkey,           // Player A's wallet
    pub player_b: Option<Pubkey>,   // Player B's wallet (None until joined)
    pub amount: u64,                // Bet amount per player (in lamports)
    pub vrf_force: [u8; 32],        // VRF force bytes (derived from lobby_id)
    pub status: u8,                 // 0 = created, 1 = resolved
    pub winner: Option<Pubkey>,     // Winner's wallet (None until resolved)
    pub bump: u8,                   // PDA bump for this lobby
    pub created_at: i64,            // Creation timestamp
}

impl Domin81v1Lobby {
    pub const SPACE: usize = 8 + 8 + 32 + 33 + 8 + 32 + 1 + 33 + 1 + 8; // discriminator + fields
}
