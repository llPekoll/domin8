use anchor_lang::prelude::*;

/// Game status enumeration
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum GameStatus {
    Waiting,                  // Accepting bets (starts from first bet)
    AwaitingWinnerRandomness, // Waiting for ORAO VRF for winner selection
    Finished,                 // Game concluded, winner selected
}

impl GameStatus {
    pub const LEN: usize = 1; // Enum is 1 byte
}

/// Current game round state stored as PDA per round
/// Seeds: [b"game_round", round_id.to_le_bytes()]
/// Bets are stored both as separate PDAs AND in arrays for efficient winner selection
#[account]
pub struct GameRound {
    pub round_id: u64,
    pub status: GameStatus,
    pub start_timestamp: i64,
    pub end_timestamp: i64, // When betting window closes

    // Bet tracking
    pub bet_count: u32, // Number of bets placed
    pub total_pot: u64, // Sum of all bet amounts

    // Bet amounts array for efficient winner selection (max 64 bets)
    pub bet_amounts: [u64; 64], // Amount for each bet
    // Wallet details stored in separate BetEntry PDAs
    pub bet_skin: [u8; 64],           //
    pub bet_position: [[u16; 2]; 64], // Amount for each bet

    // Winner
    pub winner: Pubkey,
    pub winning_bet_index: u32, // Index of the winning bet (for UI display)
    pub winner_prize_unclaimed: u64, // Prize amount if automatic transfer failed
    pub house_fee_unclaimed: u64, // House fee if automatic transfer failed

    // ORAO VRF integration
    pub vrf_request_pubkey: Pubkey, // ORAO VRF request account
    pub vrf_seed: [u8; 32],         // Seed used for VRF request
    pub randomness_fulfilled: bool, // Track if randomness is ready
}

impl GameRound {
    // 8 (discriminator) + 8 (round_id) + 1 (status) + 8 (start) + 8 (end)
    // + 4 (bet_count) + 8 (total_pot)
    // + (8 * 64) (bet_amounts) + (1 * 64) (bet_skin) + (2 * 2 * 64) (bet_position)
    // + 32 (winner) + 4 (winning_bet_index) + 8 (winner_prize_unclaimed) + 8 (house_fee_unclaimed)
    // + 32 (vrf_request_pubkey) + 32 (vrf_seed) + 1 (randomness_fulfilled)
    pub const LEN: usize =
        8 + 8 + 1 + 8 + 8 + 4 + 8 + (8 * 64) + (1 * 64) + (2 * 2 * 64) + 32 + 4 + 8 + 8 + 32 + 32 + 1; // 994 bytes

    /// Check if the game is in a state where bets can be placed
    pub fn can_accept_bets(&self) -> bool {
        matches!(self.status, GameStatus::Waiting)
    }

    /// Check if the game is a small game (2+ bets) - all games are small games in MVP
    pub fn is_small_game(&self) -> bool {
        self.bet_count >= 2
    }

    /// Calculate total pot value
    pub fn get_total_pot(&self) -> u64 {
        self.total_pot
    }
}
