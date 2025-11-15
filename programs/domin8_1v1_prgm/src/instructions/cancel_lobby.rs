use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

/// Cancel a 1v1 lobby (called by Player A)
/// 
/// This instruction allows Player A to cancel their lobby if:
/// - Lobby status is CREATED (no one has joined yet)
/// - The caller is Player A
/// 
/// On cancellation:
/// - All funds (Player A's bet) are refunded to Player A
/// - Lobby PDA is closed and rent is refunded to payer
pub fn handler(
    ctx: Context<CancelLobby>,
) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    let player_a = &ctx.accounts.player_a;

    // Verify lobby is in CREATED status (no one has joined)
    require_eq!(
        lobby.status,
        LOBBY_STATUS_CREATED,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Verify caller is Player A
    require_eq!(
        lobby.player_a,
        player_a.key(),
        Domin81v1Error::UnauthorizedCancellation
    );

    // Verify no one else has joined
    require!(lobby.player_b.is_none(), Domin81v1Error::AlreadyJoined);

    msg!(
        "Cancelling lobby {}: refunding {} lamports to Player A {}",
        lobby.lobby_id,
        lobby.amount,
        player_a.key()
    );

    // Close the lobby PDA by transferring all lamports to Player A
    let lobby_lamports = ctx.accounts.lobby.to_account_info().lamports();
    if lobby_lamports > 0 {
        **ctx.accounts.lobby.to_account_info().lamports.borrow_mut() -= lobby_lamports;
        **player_a.lamports.borrow_mut() += lobby_lamports;
        msg!("Refunded {} lamports to Player A", lobby_lamports);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CancelLobby<'info> {
    #[account(
        mut,
        owner = crate::ID,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    #[account(mut)]
    pub player_a: Signer<'info>,

    pub system_program: Program<'info, System>,
}
