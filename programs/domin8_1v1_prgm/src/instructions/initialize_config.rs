use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

/// Initialize the global configuration account
/// 
/// Only callable by the admin (you'll pass this as a signer)
pub fn handler(
    ctx: Context<InitializeConfig>,
    house_fee_bps: u16,
) -> Result<()> {
    require!(house_fee_bps <= 10000, Domin81v1Error::InvalidHouseFee); // Max 100%

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = ctx.accounts.treasury.key();
    config.house_fee_bps = house_fee_bps;
    config.lobby_count = 0;
    config.force = [0u8; 32]; // Initialize with zero force, can be updated later

    msg!(
        "Domin8 1v1 initialized: admin={}, treasury={}, house_fee_bps={}",
        config.admin,
        config.treasury,
        house_fee_bps
    );

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        space = Domin81v1Config::SPACE,
        payer = admin,
        seeds = [b"domin8_1v1_config"],
        bump,
    )]
    pub config: Account<'info, Domin81v1Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Treasury wallet, no need to verify ownership here
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
