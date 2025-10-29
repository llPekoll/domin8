use crate::constants::{GAME_CONFIG_SEED, GAME_COUNTER_SEED, GAME_ROUND_SEED, VAULT_SEED};
use crate::errors::Domin8Error;
use crate::state::{GameConfig, GameCounter, GameRound, GameStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct EmergencyRefundVrfTimeout<'info> {
    #[account(
        mut,
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
        seeds = [GAME_ROUND_SEED, counter.current_round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub game_round: Account<'info, GameRound>,

    /// The vault PDA that holds bet funds to refund
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// The authority (backend crank or admin)
    #[account(
        constraint = authority.key() == config.authority @ Domin8Error::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Emergency refund if VRF randomness never fulfills (timeout)
///
/// This is a safety mechanism for the rare case where ORAO VRF fails to
/// fulfill randomness within a reasonable timeframe (10+ minutes).
///
/// # Safety Checks
/// - Game must be stuck in AwaitingWinnerRandomness status
/// - At least 10 minutes must have passed since betting closed
/// - Only authority (backend) can call
///
/// # Actions
/// - Refunds are NOT processed here (players keep their bets in vault)
/// - Backend must use remaining_accounts to refund each player individually
/// - Unlocks the system for next game
/// - Resets game to Idle state
pub fn emergency_refund_vrf_timeout<'info>(
    ctx: Context<'_, '_, '_, 'info, EmergencyRefundVrfTimeout<'info>>,
) -> Result<()> {
    let game_round = &mut ctx.accounts.game_round;
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Safety check 1: Game must be stuck waiting for VRF
    require!(
        game_round.status == GameStatus::AwaitingWinnerRandomness,
        Domin8Error::InvalidGameStatus
    );

    // Safety check 2: At least 10 minutes must have passed since betting closed
    const VRF_TIMEOUT_SECONDS: i64 = 10 * 60; // 10 minutes

    let time_waiting = current_time
        .checked_sub(game_round.end_timestamp)
        .ok_or(Domin8Error::ArithmeticOverflow)?;

    require!(
        time_waiting >= VRF_TIMEOUT_SECONDS,
        Domin8Error::InvalidGameStatus
    );

    msg!("🚨 EMERGENCY VRF TIMEOUT REFUND");
    msg!("  Round ID: {}", game_round.round_id);
    msg!("  Bet count: {}", game_round.bet_count);
    msg!("  Total pot: {} lamports", game_round.total_pot);
    msg!(
        "  Time waiting for VRF: {} seconds ({} minutes)",
        time_waiting,
        time_waiting / 60
    );
    msg!("  VRF request: {}", game_round.vrf_request_pubkey);

    // Refund each player from remaining_accounts
    require!(
        ctx.remaining_accounts.len() >= game_round.bet_count as usize,
        Domin8Error::InvalidBetEntry
    );

    let vault_bump = ctx.bumps.vault;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &[vault_bump]]];

    let mut total_refunded = 0u64;

    for (index, player_account) in ctx.remaining_accounts[..game_round.bet_count as usize]
        .iter()
        .enumerate()
    {
        let refund_amount = game_round.bet_amounts[index];

        if refund_amount > 0 {
            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.vault.key(),
                player_account.key,
                refund_amount,
            );

            anchor_lang::solana_program::program::invoke_signed(
                &transfer_ix,
                &[
                    ctx.accounts.vault.to_account_info(),
                    player_account.clone(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;

            total_refunded = total_refunded
                .checked_add(refund_amount)
                .ok_or(Domin8Error::ArithmeticOverflow)?;

            msg!(
                "  ✓ Refunded {} lamports to player {}",
                refund_amount,
                player_account.key
            );
        }
    }

    msg!("✓ Total refunded: {} lamports", total_refunded);

    // Reset game state
    game_round.status = GameStatus::Finished;
    game_round.winner = Pubkey::default();
    game_round.winning_bet_index = 0;
    game_round.winner_prize_unclaimed = 0;
    game_round.house_fee_unclaimed = 0;

    // Unlock system for next game
    config.bets_locked = false;

    msg!("✓ System unlocked - ready for next game");
    msg!("⚠️ This game was cancelled due to VRF timeout");

    Ok(())
}
