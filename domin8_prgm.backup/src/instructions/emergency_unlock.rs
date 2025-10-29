use anchor_lang::prelude::*;
use crate::state::GameConfig;
use crate::errors::Domin8Error;
use crate::constants::GAME_CONFIG_SEED;

#[derive(Accounts)]
pub struct EmergencyUnlock<'info> {
    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    #[account(
        constraint = authority.key() == config.authority @ Domin8Error::Unauthorized
    )]
    pub authority: Signer<'info>,
}

/// Emergency instruction to unlock bets (admin only)
/// Use this if bets get stuck in locked state
pub fn emergency_unlock(ctx: Context<EmergencyUnlock>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    msg!("⚠️ EMERGENCY UNLOCK: Unlocking bets");
    config.bets_locked = false;
    msg!("✓ Bets unlocked - ready for next round");
    
    Ok(())
}
