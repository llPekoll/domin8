use crate::constants::{GAME_ROUND_SEED, VAULT_SEED};
use crate::errors::Domin8Error;
use crate::state::{GameRound, GameStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct ClaimWinnerPrize<'info> {
    /// The game round where winner needs to claim
    #[account(
        mut,
        seeds = [GAME_ROUND_SEED, round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub game_round: Account<'info, GameRound>,

    /// The vault PDA that holds unclaimed funds
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// The winner claiming their prize
    #[account(
        mut,
        constraint = winner.key() == game_round.winner @ Domin8Error::Unauthorized
    )]
    pub winner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Claim winner prize manually (fallback if automatic transfer failed)
///
/// This instruction allows winners to manually claim their prize if the
/// automatic transfer during select_winner_and_payout failed.
///
/// # Security
/// - Only the winner (game_round.winner) can call this
/// - Can only claim if winner_prize_unclaimed > 0
/// - Prize is cleared after successful transfer
pub fn claim_winner_prize(ctx: Context<ClaimWinnerPrize>, round_id: u64) -> Result<()> {
    let game_round = &mut ctx.accounts.game_round;

    // Verify game is finished
    require!(
        game_round.status == GameStatus::Finished,
        Domin8Error::InvalidGameStatus
    );

    // Verify there's an unclaimed prize
    let unclaimed_prize = game_round.winner_prize_unclaimed;
    require!(unclaimed_prize > 0, Domin8Error::AlreadyClaimed);

    msg!("Processing manual prize claim for round {}", round_id);
    msg!("Winner: {}", ctx.accounts.winner.key());
    msg!("Prize amount: {} lamports", unclaimed_prize);

    // Verify vault has sufficient funds
    let vault_lamports = ctx.accounts.vault.lamports();
    require!(
        vault_lamports >= unclaimed_prize,
        Domin8Error::InsufficientFunds
    );

    // Transfer prize to winner
    let vault_bump = ctx.bumps.vault;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &[vault_bump]]];

    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.winner.key(),
        unclaimed_prize,
    );

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.winner.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Clear unclaimed prize
    game_round.winner_prize_unclaimed = 0;

    msg!("✓ Prize claimed successfully!");
    msg!(
        "✓ Transferred {} lamports to winner {}",
        unclaimed_prize,
        ctx.accounts.winner.key()
    );

    Ok(())
}
