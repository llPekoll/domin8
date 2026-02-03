use anchor_lang::prelude::*;
use crate::error::ChopError;
use crate::state::*;

/// Join an existing CHOP lobby
///
/// The player deposits the matching bet amount, game becomes locked
pub fn handler(
    ctx: Context<JoinLobby>,
) -> Result<()> {
    let clock = Clock::get()?;
    let player_key = ctx.accounts.player.key();

    // Collect data before mutable borrow
    let lobby_status = ctx.accounts.lobby.status;
    let lobby_creator = ctx.accounts.lobby.creator;
    let bet_amount = ctx.accounts.lobby.bet_amount;
    let lobby_id = ctx.accounts.lobby.lobby_id;

    // Verify lobby is open
    require_eq!(
        lobby_status,
        LOBBY_STATUS_OPEN,
        ChopError::InvalidLobbyStatus
    );

    // Prevent self-play
    require!(
        lobby_creator != player_key,
        ChopError::SelfPlayNotAllowed
    );

    // Check player has sufficient balance
    require!(
        ctx.accounts.player.lamports() >= bet_amount,
        ChopError::InsufficientFunds
    );

    // Transfer SOL from player to the lobby PDA
    let transfer_instruction = anchor_lang::system_program::Transfer {
        from: ctx.accounts.player.to_account_info(),
        to: ctx.accounts.lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    anchor_lang::system_program::transfer(cpi_context, bet_amount)?;

    // Update lobby state (mutable borrow after transfer)
    let lobby = &mut ctx.accounts.lobby;
    lobby.players.push(player_key);
    lobby.total_pot += bet_amount;
    lobby.status = LOBBY_STATUS_LOCKED;
    lobby.locked_at = clock.unix_timestamp;

    msg!(
        "Player {} joined CHOP Lobby {}. Total pot: {} lamports. Game locked!",
        player_key,
        lobby_id,
        lobby.total_pot
    );

    Ok(())
}

#[derive(Accounts)]
pub struct JoinLobby<'info> {
    #[account(
        seeds = [b"chop_config"],
        bump,
    )]
    pub config: Account<'info, ChopConfig>,

    #[account(
        mut,
        seeds = [
            b"chop_lobby",
            lobby.lobby_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub lobby: Account<'info, ChopLobby>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}
