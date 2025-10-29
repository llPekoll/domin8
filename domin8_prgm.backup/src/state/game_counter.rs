use anchor_lang::prelude::*;

/// Global counter tracking current game round
/// Seeds: [b"game_counter"]
#[account]
pub struct GameCounter {
    pub current_round_id: u64,
}

impl GameCounter {
    pub const LEN: usize = 8 + 8; // discriminator + u64
}
