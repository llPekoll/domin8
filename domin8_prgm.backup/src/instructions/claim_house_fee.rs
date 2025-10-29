use crate::constants::{GAME_CONFIG_SEED, GAME_ROUND_SEED, VAULT_SEED};
use crate::errors::Domin8Error;
use crate::state::{GameConfig, GameRound, GameStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct ClaimHouseFee<'info> {
    #[account(
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    /// The game round where house fee needs to be claimed
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

    /// The treasury claiming the house fee
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ Domin8Error::InvalidTreasury
    )]
    pub treasury: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Claim house fee manually (fallback if automatic transfer failed)
///
/// This instruction allows the treasury to manually claim the house fee if the
/// automatic transfer during select_winner_and_payout failed.
///
/// # Security
/// - Only the treasury (config.treasury) can call this
/// - Can only claim if house_fee_unclaimed > 0
/// - Fee is cleared after successful transfer
pub fn claim_house_fee(ctx: Context<ClaimHouseFee>, round_id: u64) -> Result<()> {
    let game_round = &mut ctx.accounts.game_round;

    // Verify game is finished
    require!(
        game_round.status == GameStatus::Finished,
        Domin8Error::InvalidGameStatus
    );

    // Verify there's an unclaimed house fee
    let unclaimed_fee = game_round.house_fee_unclaimed;
    require!(unclaimed_fee > 0, Domin8Error::AlreadyClaimed);

    msg!("Processing manual house fee claim for round {}", round_id);
    msg!("Treasury: {}", ctx.accounts.treasury.key());
    msg!("Fee amount: {} lamports", unclaimed_fee);

    // Verify vault has sufficient funds
    let vault_lamports = ctx.accounts.vault.lamports();
    require!(
        vault_lamports >= unclaimed_fee,
        Domin8Error::InsufficientFunds
    );

    // Transfer fee to treasury
    let vault_bump = ctx.bumps.vault;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &[vault_bump]]];

    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.treasury.key(),
        unclaimed_fee,
    );

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Clear unclaimed fee
    game_round.house_fee_unclaimed = 0;

    msg!("✓ House fee claimed successfully!");
    msg!(
        "✓ Transferred {} lamports to treasury {}",
        unclaimed_fee,
        ctx.accounts.treasury.key()
    );

    Ok(())
}
