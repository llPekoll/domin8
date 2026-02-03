use anchor_lang::prelude::*;
use crate::error::ChopError;
use crate::state::*;

/// End game and distribute funds
///
/// Called by Convex backend (admin) after skill-based game determines winner.
/// No VRF needed - winner is determined by game logic in Convex.
///
/// Fee split:
/// - 95% to winner
/// - 2.5% to platform treasury
/// - 2.5% to lobby creator
pub fn handler(
    ctx: Context<EndGame>,
    winner: Pubkey,
) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    let config = &ctx.accounts.config;

    msg!("Ending CHOP Lobby {}", lobby.lobby_id);

    // Verify lobby is locked (game in progress)
    require_eq!(
        lobby.status,
        LOBBY_STATUS_LOCKED,
        ChopError::InvalidLobbyStatus
    );

    // Verify winner is a player in the lobby
    require!(
        lobby.players.contains(&winner),
        ChopError::InvalidWinner
    );

    // Calculate fee distribution
    let total_pot = lobby.total_pot;

    let platform_fee = (total_pot as u128)
        .checked_mul(config.platform_fee_bps as u128)
        .ok_or(ChopError::DistributionError)?
        .checked_div(10000)
        .ok_or(ChopError::DistributionError)? as u64;

    let creator_fee = (total_pot as u128)
        .checked_mul(config.creator_fee_bps as u128)
        .ok_or(ChopError::DistributionError)?
        .checked_div(10000)
        .ok_or(ChopError::DistributionError)? as u64;

    let winner_prize = total_pot
        .checked_sub(platform_fee)
        .ok_or(ChopError::DistributionError)?
        .checked_sub(creator_fee)
        .ok_or(ChopError::DistributionError)?;

    // Pay platform fee to treasury
    if platform_fee > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= platform_fee;
        **ctx.accounts.treasury.lamports.borrow_mut() += platform_fee;
    }

    // Pay creator fee
    if creator_fee > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= creator_fee;
        **ctx.accounts.creator.lamports.borrow_mut() += creator_fee;
    }

    // Pay winner
    if winner_prize > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= winner_prize;
        **ctx.accounts.winner_account.lamports.borrow_mut() += winner_prize;
    }

    // Update lobby state
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_FINISHED;

    msg!(
        "CHOP Lobby {} ended. Winner: {}. Prize: {} lamports (platform: {}, creator: {})",
        lobby.lobby_id,
        winner,
        winner_prize,
        platform_fee,
        creator_fee
    );

    Ok(())
}

#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(
        seeds = [b"chop_config"],
        bump,
    )]
    pub config: Account<'info, ChopConfig>,

    #[account(
        mut,
        seeds = [b"chop_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
        close = creator,  // Close account and return rent to creator
    )]
    pub lobby: Account<'info, ChopLobby>,

    /// Admin must match the config admin (Convex backend wallet)
    #[account(address = config.admin @ ChopError::UnauthorizedAdmin)]
    pub admin: Signer<'info>,

    /// CHECK: Treasury to receive platform fee
    #[account(mut, address = config.treasury)]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Creator to receive creator fee
    #[account(mut, address = lobby.creator)]
    pub creator: AccountInfo<'info>,

    /// CHECK: Winner to receive prize (validated in handler)
    #[account(mut)]
    pub winner_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
