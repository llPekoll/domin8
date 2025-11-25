use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct VrfCallback<'info> {
    /// This check ensures that the vrf_program_identity (which is a PDA) is a signer
    /// enforcing the callback is executed by the VRF program through CPI
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    /// Game account passed via accounts_metas in VRF request
    #[account(mut)]
    pub game: Box<Account<'info, Domin8Game>>,
}

/// VRF callback - called automatically by Magic Block VRF with randomness
///
/// Accounts:
/// 0. `[signer]` vrf_program_identity: [Signer] VRF program PDA
/// 1. `[writable]` game: [Domin8Game] Game round account
///
/// Data:
/// - randomness: [[u8; 32]] 32 bytes of verifiable randomness from Magic Block VRF
pub fn handler(
    ctx: Context<VrfCallback>,
    randomness: [u8; 32],
) -> Result<()> {
    let game = &mut ctx.accounts.game;

    // Convert first 8 bytes of randomness to u64
    let random_u64 = u64::from_le_bytes(randomness[0..8].try_into().unwrap());

    // Store randomness in game
    game.rand = random_u64;

    msg!("VRF callback executed! Random value: {}", random_u64);
    msg!("Randomness (hex): {}", Utils::bytes_to_hex(&randomness));

    Ok(())
}
