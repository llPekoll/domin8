use anchor_lang::prelude::*;

/// Event emitted when a new game round is initialized
#[event]
pub struct GameInitialized {
    pub round_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
}

/// Event emitted when a new game is created (first bet)
#[event]
pub struct GameCreated {
    pub round_id: u64,
    pub creator: Pubkey,
    pub initial_bet: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub vrf_seed_used: [u8; 32], // Force field used for this game's VRF
    pub next_vrf_seed: [u8; 32], // Rotated force for next game
}

/// Event emitted when a bet is placed
#[event]
pub struct BetPlaced {
    pub round_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub bet_position: [u16; 2],
    pub bet_skin: u8,
    pub timestamp: i64, // When bet was placed
    pub bet_index: u32, // Index of this bet in the game
}

/// Event emitted when game is locked (betting window closes)
#[event]
pub struct GameLocked {
    pub round_id: u64,
    pub final_bet_count: u8,
    pub total_pot: u64,
    pub vrf_request_pubkey: Pubkey,
}

/// Event emitted when winner is determined
#[event]
pub struct WinnerSelected {
    pub round_id: u64,
    pub winner: Pubkey,
    pub winning_bet_index: u32, // Index of the winning bet (for UI animations)
    pub winning_bet_amount: u64, // How much the winner bet
    pub total_pot: u64,
    pub house_fee: u64,
    pub winner_payout: u64,
    pub win_probability_bps: u64, // Winner's probability in basis points (3550 = 35.5%)
    pub total_bets: u32,          // Number of bets in the game
    pub auto_transfer_success: bool, // True if winner was paid automatically
    pub house_fee_transfer_success: bool, // True if house fee was transferred automatically
    pub vrf_randomness: u64,      // VRF value used
    pub vrf_seed_hex: String,     // VRF seed in hex for transparency
    pub timestamp: i64,           // When winner was selected
}

/// Event emitted when game is reset for next round
#[event]
pub struct GameReset {
    pub old_round_id: u64,
    pub new_round_id: u64,
}

/// Event emitted when old game is cleaned up and closed
#[event]
pub struct GameCleaned {
    pub round_id: u64,
    pub game_age_seconds: i64,     // How old the game was
    pub rent_reclaimed: u64,       // Rent returned to crank
    pub had_unclaimed_prize: bool, // Warning if prize was unclaimed
    pub unclaimed_amount: u64,     // Amount that was unclaimed (if any)
    pub crank_authority: Pubkey,   // Who initiated cleanup
    pub timestamp: i64,
}
