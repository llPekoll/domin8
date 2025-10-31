use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(
    round_id: u64,
)]
pub struct CloseGameNoFee<'info> {
    #[account(
        mut,
        seeds = [b"domin8_config"],
        bump,
    )]
    pub config: Account<'info, Domin8Config>,

    #[account(
        mut,
        seeds = [
            b"domin8_game",
            round_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub game: Box<Account<'info, Domin8Game>>,

    #[account(
        mut,
        seeds = [b"active_game"],
        bump,
    )]
    pub active_game: Box<Account<'info, Domin8Game>>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Close game without fees for refund scenarios (admin only)
///
/// Used when game needs to be closed and refunded without taking house fee:
/// - Single player games (refund scenario)
/// - Cancelled games
///
/// Sets winner to first (and only) player, with full pot as prize.
/// After calling this, use send_prize_winner to complete the refund.
///
/// Accounts:
/// 0. `[writable]` config: [Domin8Config] Configuration
/// 1. `[writable]` game: [Domin8Game] Game round to close
/// 2. `[writable]` active_game: [Domin8Game] Active game singleton
/// 3. `[writable, signer]` admin: [AccountInfo] Administrator account
/// 4. `[]` system_program: [AccountInfo] System program
///
/// Data:
/// - round_id: [u64] Round ID for the game
pub fn handler(
    ctx: Context<CloseGameNoFee>,
    round_id: u64,
) -> Result<()> {
    let admin = &ctx.accounts.admin;
    let clock = Clock::get()?;

    // First, do all validations without mutable borrows
    let game_data = &ctx.accounts.game;
    let active_game_data = &ctx.accounts.active_game;
    let config_data = &ctx.accounts.config;

    // Verify admin authorization
    require!(admin.key() == config_data.admin, Domin8Error::Unauthorized);

    // Check if game exists and is the correct round
    require!(game_data.game_round == round_id, Domin8Error::GameNotOpen);

    // Check if game is still open (status = 0)
    require!(game_data.status == GAME_STATUS_OPEN, Domin8Error::InvalidGameStatus);

    // Check if game has ended (current time > end_date)
    require!(clock.unix_timestamp >= game_data.end_date, Domin8Error::GameNotEnded);

    // Ensure there are bets to process
    require!(!active_game_data.bets.is_empty(), Domin8Error::NoBets);

    // Get the total pot (this will be the full refund amount)
    let total_pot = game_data.total_deposit;
    require!(total_pot > 0, Domin8Error::ArithmeticError);

    // Get the single player wallet (for single player refund scenario)
    // Note: This assumes single player. For multiple players, caller would need to
    // call this multiple times or use a different instruction.
    // COPY the value to avoid borrow checker issues
    let refund_recipient = *active_game_data.wallets.get(0)
        .ok_or(Domin8Error::InvalidWallet)?;

    msg!("Closing game {} without fees for refund", round_id);
    msg!("Total pot: {} lamports", total_pot);
    msg!("Refund recipient: {}", refund_recipient);

    // Now do all mutable updates
    let game = &mut ctx.accounts.game;
    let active_game = &mut ctx.accounts.active_game;
    let config = &mut ctx.accounts.config;

    // Transfer data from active_game to game
    game.wallets = std::mem::take(&mut active_game.wallets);
    game.bets = std::mem::take(&mut active_game.bets);
    game.total_deposit = active_game.total_deposit;
    game.user_count = active_game.user_count;

    // Set winner to the refund recipient with FULL pot (no fee deduction)
    game.winner = Some(refund_recipient);
    game.winner_prize = total_pot; // Full amount!
    game.winning_bet_index = Some(0); // First bet

    // Close the game
    game.status = GAME_STATUS_CLOSED;

    // Update active_game to match
    active_game.winner = Some(refund_recipient);
    active_game.winner_prize = total_pot;
    active_game.status = GAME_STATUS_CLOSED;

    // Unlock the system to allow new game creation
    config.lock = false;

    msg!("Game {} closed for refund - no fees taken", round_id);
    msg!("Use send_prize_winner to complete the refund");

    Ok(())
}
