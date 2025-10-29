use anchor_lang::prelude::*;
use crate::state::{GameRound, GameConfig, GameCounter};
use crate::errors::Domin8Error;
use crate::constants::{GAME_ROUND_SEED, GAME_CONFIG_SEED, GAME_COUNTER_SEED};
use crate::events::GameCleaned;

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CleanupOldGame<'info> {
    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    #[account(
        seeds = [GAME_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, GameCounter>,

    #[account(
        mut,
        seeds = [GAME_ROUND_SEED, round_id.to_le_bytes().as_ref()],
        bump,
        close = crank
    )]
    pub game_round: Account<'info, GameRound>,

    /// The crank authority (backend wallet)
    #[account(
        mut,
        constraint = crank.key() == config.authority @ Domin8Error::Unauthorized
    )]
    pub crank: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Backend-triggered cleanup for old game rounds
/// This instruction closes the game_round PDA and reclaims rent to the crank authority
///
/// Safety checks:
/// - Game must be finished (not active)
/// - Game must be from a previous round (not current round)
/// - Game must be old enough (flexible timing based on state)
/// - ⭐ CRITICAL: Cannot cleanup if winner has unclaimed prize
///
/// Timing rules:
/// - Fully settled games (no unclaimed prize): 24 hours minimum
/// - Games with unclaimed prize: 30 days minimum (gives winner time to claim)
pub fn cleanup_old_game(
    ctx: Context<CleanupOldGame>,
    round_id: u64,
) -> Result<()> {
    let game_round = &ctx.accounts.game_round;
    let current_round_id = ctx.accounts.counter.current_round_id;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Safety check 1: Game must not be the current active round
    require!(
        round_id < current_round_id,
        Domin8Error::CannotCleanupActiveGame
    );

    // Safety check 2: Game must be in finished state
    require!(
        game_round.status == crate::state::GameStatus::Finished,
        Domin8Error::CannotCleanupActiveGame
    );

    let game_age = current_time
        .checked_sub(game_round.start_timestamp)
        .ok_or(Domin8Error::ArithmeticOverflow)?;

    // Safety check 3: CRITICAL - Check for unclaimed prizes
    let has_unclaimed_prize = game_round.winner_prize_unclaimed > 0;

    if has_unclaimed_prize {
        // If there's an unclaimed prize, require 30 days minimum
        // This gives winner ample time to claim
        const THIRTY_DAYS_SECONDS: i64 = 30 * 24 * 60 * 60; // 2,592,000 seconds

        require!(
            game_age >= THIRTY_DAYS_SECONDS,
            Domin8Error::GameTooRecentToCleanup
        );

        msg!("⚠️ WARNING: Cleaning up game with UNCLAIMED PRIZE!");
        msg!("   Unclaimed amount: {} lamports", game_round.winner_prize_unclaimed);
        msg!("   Winner: {}", game_round.winner);
        msg!("   Game age: {} days (30+ day grace period expired)", game_age / 86400);
    } else {
        // Fully settled game - can cleanup after 24 hours
        const ONE_DAY_SECONDS: i64 = 24 * 60 * 60; // 86,400 seconds

        require!(
            game_age >= ONE_DAY_SECONDS,
            Domin8Error::GameTooRecentToCleanup
        );

        msg!("✓ Cleaning up fully settled game (no unclaimed prizes)");
    }

    // Calculate rent being reclaimed
    let rent_reclaimed = ctx.accounts.game_round.to_account_info().lamports();

    msg!("Cleaning up old game round {}", round_id);
    msg!("Game age: {} seconds ({} days)", game_age, game_age / 86400);
    msg!("Rent reclaimed: {} lamports to {}", rent_reclaimed, ctx.accounts.crank.key());

    // Emit comprehensive cleanup event
    emit!(GameCleaned {
        round_id,
        game_age_seconds: game_age,
        rent_reclaimed,
        had_unclaimed_prize: has_unclaimed_prize,
        unclaimed_amount: game_round.winner_prize_unclaimed,
        crank_authority: ctx.accounts.crank.key(),
        timestamp: current_time,
    });

    // The game_round account is automatically closed via the close constraint
    // Rent is returned to the crank authority

    Ok(())
}
