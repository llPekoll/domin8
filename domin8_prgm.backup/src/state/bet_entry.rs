use anchor_lang::prelude::*;

/// Individual bet stored as separate PDA
/// Seeds: [b"bet", game_round_id.to_le_bytes(), bet_index.to_le_bytes()]
#[account]
pub struct BetEntry {
    pub game_round_id: u64,  // Which game round this bet belongs to
    pub bet_index: u32,      // Index of this bet (0, 1, 2, ...)
    pub wallet: Pubkey,      // Player who placed the bet
    pub bet_amount: u64,     // Amount in lamports
    pub timestamp: i64,      // When bet was placed
    pub payout_collected: bool, // Track if winnings have been collected
}

impl BetEntry {
    // 8 (discriminator) + 8 (game_round_id) + 4 (bet_index) + 32 (wallet) + 8 (bet_amount) + 8 (timestamp) + 1 (payout_collected)
    pub const LEN: usize = 8 + 8 + 4 + 32 + 8 + 8 + 1; // 69 bytes

    /// Check if this bet is the winner
    pub fn is_winner(&self, game_round: &crate::state::GameRound) -> bool {
        game_round.winning_bet_index == self.bet_index
    }
}
