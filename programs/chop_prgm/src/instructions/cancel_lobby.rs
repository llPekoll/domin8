use anchor_lang::prelude::*;
use crate::error::ChopError;
use crate::state::*;

/// Cancel a lobby and refund the creator
///
/// Only callable by the creator and only when lobby is still open (no opponent joined)
pub fn handler(
    ctx: Context<CancelLobby>,
) -> Result<()> {
    let lobby = &ctx.accounts.lobby;

    msg!("Cancelling CHOP Lobby {}", lobby.lobby_id);

    // Verify lobby is still open
    require_eq!(
        lobby.status,
        LOBBY_STATUS_OPEN,
        ChopError::InvalidLobbyStatus
    );

    // Verify only creator can cancel
    require!(
        lobby.creator == ctx.accounts.creator.key(),
        ChopError::UnauthorizedCancel
    );

    // Verify no other players have joined
    require!(
        lobby.players.len() == 1,
        ChopError::CannotCancelWithPlayers
    );

    // Refund is automatic via close = creator constraint
    msg!(
        "CHOP Lobby {} cancelled. Refunding {} lamports to creator {}",
        lobby.lobby_id,
        lobby.bet_amount,
        lobby.creator
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CancelLobby<'info> {
    #[account(
        seeds = [b"chop_config"],
        bump,
    )]
    pub config: Account<'info, ChopConfig>,

    #[account(
        mut,
        seeds = [b"chop_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
        close = creator,  // Close account and return all lamports (including bet) to creator
    )]
    pub lobby: Account<'info, ChopLobby>,

    #[account(mut, address = lobby.creator @ ChopError::UnauthorizedCancel)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}
