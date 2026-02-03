use anchor_lang::prelude::*;
use crate::error::ChopError;
use crate::state::*;

/// Initialize the global configuration account
///
/// Only callable by the admin (you'll pass this as a signer)
pub fn handler(
    ctx: Context<InitializeConfig>,
    platform_fee_bps: u16,
    creator_fee_bps: u16,
) -> Result<()> {
    // Validate fees don't exceed maximum (5% total)
    require!(
        platform_fee_bps + creator_fee_bps <= MAX_TOTAL_FEE_BPS,
        ChopError::InvalidFeeConfiguration
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = ctx.accounts.treasury.key();
    config.platform_fee_bps = platform_fee_bps;
    config.creator_fee_bps = creator_fee_bps;
    config.lobby_count = 0;

    msg!(
        "CHOP initialized: admin={}, treasury={}, platform_fee_bps={}, creator_fee_bps={}",
        config.admin,
        config.treasury,
        platform_fee_bps,
        creator_fee_bps
    );

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        space = ChopConfig::SPACE,
        payer = admin,
        seeds = [b"chop_config"],
        bump,
    )]
    pub config: Account<'info, ChopConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Treasury wallet, no need to verify ownership here
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
