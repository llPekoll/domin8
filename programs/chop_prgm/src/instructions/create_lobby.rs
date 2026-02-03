use anchor_lang::prelude::*;
use crate::error::ChopError;
use crate::state::*;

/// Create a new CHOP lobby
///
/// The creator deposits their bet amount and waits for an opponent
pub fn handler(
    ctx: Context<CreateLobby>,
    bet_amount: u64,
) -> Result<()> {
    require!(bet_amount >= MIN_BET_AMOUNT, ChopError::BetBelowMinimum);

    let config = &mut ctx.accounts.config;
    let lobby = &mut ctx.accounts.lobby;
    let creator = &ctx.accounts.creator;
    let clock = Clock::get()?;

    // Check creator has sufficient balance
    require!(
        creator.lamports() >= bet_amount,
        ChopError::InsufficientFunds
    );

    // Get the current lobby ID from config
    let lobby_id = config.lobby_count;

    // Initialize the lobby
    lobby.lobby_id = lobby_id;
    lobby.creator = creator.key();
    lobby.bet_amount = bet_amount;
    lobby.status = LOBBY_STATUS_OPEN;
    lobby.created_at = clock.unix_timestamp;
    lobby.locked_at = 0;
    lobby.players = vec![creator.key()];
    lobby.total_pot = bet_amount;
    lobby.winner = None;

    // Transfer SOL from creator to the lobby PDA
    let transfer_instruction = anchor_lang::system_program::Transfer {
        from: creator.to_account_info(),
        to: ctx.accounts.lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    anchor_lang::system_program::transfer(cpi_context, bet_amount)?;

    // Increment lobby counter
    config.lobby_count += 1;

    msg!(
        "CHOP Lobby {} created by {}: bet_amount={} lamports",
        lobby_id,
        creator.key(),
        bet_amount
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(bet_amount: u64)]
pub struct CreateLobby<'info> {
    #[account(
        mut,
        seeds = [b"chop_config"],
        bump,
    )]
    pub config: Account<'info, ChopConfig>,

    #[account(
        init,
        space = ChopLobby::SPACE,
        payer = creator,
        seeds = [
            b"chop_lobby",
            config.lobby_count.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub lobby: Account<'info, ChopLobby>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}
