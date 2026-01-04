use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

// MagicBlock ID used for security check
use ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY;

/// VRF Callback - called automatically by MagicBlock VRF with randomness
/// This instruction only stores the randomness in the lobby account.
/// Fund distribution happens in a separate settle_lobby instruction.
#[derive(Accounts)]
pub struct VrfCallback<'info> {
    /// CHECK: This ensures the instruction is called by the MagicBlock VRF program
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    /// Lobby account passed via accounts_metas in VRF request
    #[account(
        mut,
        seeds = [b"domin8_1v1_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,
}

/// VRF callback handler - stores randomness in lobby
///
/// Accounts:
/// 0. `[signer]` vrf_program_identity: VRF program PDA
/// 1. `[writable]` lobby: Domin81v1Lobby account
///
/// Data:
/// - randomness: [u8; 32] - 32 bytes of verifiable randomness from MagicBlock VRF
pub fn handler(ctx: Context<VrfCallback>, randomness: [u8; 32]) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;

    msg!("VRF Callback triggered for Lobby {}", lobby.lobby_id);

    // Safety check: Ensure lobby is actually waiting for VRF
    require_eq!(
        lobby.status,
        LOBBY_STATUS_AWAITING_VRF,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Store randomness in the lobby
    lobby.randomness = Some(randomness);
    
    // Update status to indicate VRF is received and ready for settlement
    lobby.status = LOBBY_STATUS_READY;

    msg!("VRF callback executed! Randomness stored for Lobby {}", lobby.lobby_id);
    msg!("Randomness (first 8 bytes): {:?}", &randomness[0..8]);

    Ok(())
}
