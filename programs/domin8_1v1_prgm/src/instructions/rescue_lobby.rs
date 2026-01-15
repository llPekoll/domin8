use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

/// Rescue a stuck lobby (admin only)
///
/// This instruction allows the admin to rescue a lobby that's been stuck in AWAITING_VRF
/// status for longer than VRF_TIMEOUT_SECONDS (1 hour).
///
/// On rescue:
/// - Both players are refunded their bets
/// - Lobby PDA is closed and rent is refunded to admin
#[derive(Accounts)]
pub struct RescueLobby<'info> {
    #[account(
        seeds = [b"domin8_1v1_config"],
        bump,
    )]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        mut,
        seeds = [b"domin8_1v1_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
        close = admin,  // Close account and return rent to admin
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    /// Admin must match the config admin
    #[account(mut, address = config.admin @ Domin81v1Error::UnauthorizedAdmin)]
    pub admin: Signer<'info>,

    /// CHECK: Player A to receive refund
    #[account(mut, address = lobby.player_a)]
    pub player_a: AccountInfo<'info>,

    /// CHECK: Player B to receive refund (must exist for AWAITING_VRF status)
    #[account(mut, address = lobby.player_b.unwrap())]
    pub player_b: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RescueLobby>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    let clock = Clock::get()?;

    // Only allow rescue for lobbies stuck in AWAITING_VRF status
    require_eq!(
        lobby.status,
        LOBBY_STATUS_AWAITING_VRF,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Check that enough time has passed (VRF timeout)
    let time_elapsed = clock.unix_timestamp - lobby.created_at;
    require!(
        time_elapsed >= VRF_TIMEOUT_SECONDS,
        Domin81v1Error::LobbyNotExpired
    );

    let bet_amount = lobby.amount;

    msg!(
        "Rescuing stuck lobby {}: refunding {} lamports each to Player A {} and Player B {}",
        lobby.lobby_id,
        bet_amount,
        lobby.player_a,
        lobby.player_b.unwrap()
    );

    // Refund Player A
    **ctx.accounts.lobby.to_account_info().lamports.borrow_mut() -= bet_amount;
    **ctx.accounts.player_a.lamports.borrow_mut() += bet_amount;

    // Refund Player B
    **ctx.accounts.lobby.to_account_info().lamports.borrow_mut() -= bet_amount;
    **ctx.accounts.player_b.lamports.borrow_mut() += bet_amount;

    msg!("Lobby {} rescued successfully. Both players refunded.", lobby.lobby_id);

    Ok(())
}
