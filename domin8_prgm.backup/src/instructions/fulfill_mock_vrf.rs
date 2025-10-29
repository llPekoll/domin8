/// Localnet-only instruction to fulfill mock VRF randomness
/// This replaces the ORAO VRF fulfillment for testing purposes
#[cfg(feature = "localnet")]
use crate::constants::*;
#[cfg(feature = "localnet")]
use crate::errors::Domin8Error;
#[cfg(feature = "localnet")]
use crate::state::{GameConfig, GameCounter, GameRound, MockVrfAccount};
#[cfg(feature = "localnet")]
use anchor_lang::prelude::*;

#[cfg(feature = "localnet")]
#[derive(Accounts)]
pub struct FulfillMockVrf<'info> {
    #[account(
        seeds = [GAME_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, GameCounter>,

    #[account(
        seeds = [GAME_ROUND_SEED, counter.current_round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub game_round: Account<'info, GameRound>,

    #[account(
        mut,
        seeds = [MockVrfAccount::SEED_PREFIX, game_round.vrf_seed.as_ref()],
        bump
    )]
    pub mock_vrf: Account<'info, MockVrfAccount>,

    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    /// Any signer can fulfill for testing (in production, only ORAO can fulfill)
    pub fulfiller: Signer<'info>,
}

#[cfg(feature = "localnet")]
pub fn fulfill_mock_vrf(ctx: Context<FulfillMockVrf>, randomness: u64) -> Result<()> {
    let mock_vrf = &mut ctx.accounts.mock_vrf;
    
    require!(!mock_vrf.fulfilled, Domin8Error::RandomnessAlreadyFulfilled);
    
    // Fill the randomness array (use provided u64 for first 8 bytes, then hash for rest)
    let mut randomness_bytes = [0u8; 64];
    randomness_bytes[0..8].copy_from_slice(&randomness.to_le_bytes());
    
    // Fill remaining bytes with hash of input (to simulate realistic randomness)
    use anchor_lang::solana_program::keccak::hashv;
    let clock = Clock::get()?;
    let hash = hashv(&[
        &randomness.to_le_bytes(),
        &clock.slot.to_le_bytes(),
        &clock.unix_timestamp.to_le_bytes(),
    ]);
    randomness_bytes[8..40].copy_from_slice(&hash.0);
    
    // Another hash for remaining bytes
    let hash2 = hashv(&[&hash.0, &randomness.to_le_bytes()]);
    randomness_bytes[40..64].copy_from_slice(&hash2.0[0..24]);
    
    mock_vrf.randomness = randomness_bytes;
    mock_vrf.fulfilled = true;
    mock_vrf.fulfilled_at = clock.unix_timestamp;
    
    msg!("✓ Mock VRF fulfilled with randomness: {}", randomness);
    msg!("  First 8 bytes (u64): {:?}", &randomness_bytes[0..8]);
    msg!("  Game can now proceed to select_winner_and_payout");
    
    Ok(())
}
