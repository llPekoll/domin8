/// Mock VRF state for localnet testing
/// This simulates the ORAO VRF randomness account structure
use anchor_lang::prelude::*;

/// Mock randomness account that mimics ORAO VRF structure
/// Seeds: [b"mock_vrf", game_round.vrf_seed]
/// This account stores randomness that gets fulfilled by the fulfill_mock_vrf instruction
#[account]
pub struct MockVrfAccount {
    /// The seed used to request randomness (matches GameRound.vrf_seed)
    pub seed: [u8; 32],
    
    /// The fulfilled randomness value (64 bytes to match ORAO)
    pub randomness: [u8; 64],
    
    /// Whether this randomness has been fulfilled
    pub fulfilled: bool,
    
    /// Timestamp when fulfilled
    pub fulfilled_at: i64,
}

impl MockVrfAccount {
    // 8 (discriminator) + 32 (seed) + 64 (randomness) + 1 (fulfilled) + 8 (timestamp)
    pub const LEN: usize = 8 + 32 + 64 + 1 + 8; // 113 bytes
    
    pub const SEED_PREFIX: &'static [u8] = b"mock_vrf";
}
