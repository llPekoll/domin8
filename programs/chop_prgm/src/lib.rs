use anchor_lang::prelude::*;

mod error;
mod instructions;
mod state;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("4gNQgradientMwQ7vxABctopEkyrxK9VkAqa8FBPtgHV7o1xnZqq");

#[program]
pub mod chop_prgm {
    use super::*;

    /// Initialize the global configuration account
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        platform_fee_bps: u16,
        creator_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, platform_fee_bps, creator_fee_bps)
    }

    /// Create a new CHOP lobby (creator deposits SOL, waits for opponent)
    pub fn create_lobby(ctx: Context<CreateLobby>, bet_amount: u64) -> Result<()> {
        instructions::create_lobby::handler(ctx, bet_amount)
    }

    /// Join an existing lobby (player deposits matching SOL)
    pub fn join_lobby(ctx: Context<JoinLobby>) -> Result<()> {
        instructions::join_lobby::handler(ctx)
    }

    /// End game and distribute funds (called by Convex backend with winner)
    /// Winner is determined by skill-based game logic in Convex, not VRF
    pub fn end_game(ctx: Context<EndGame>, winner: Pubkey) -> Result<()> {
        instructions::end_game::handler(ctx, winner)
    }

    /// Cancel a lobby (refund creator if no one has joined)
    pub fn cancel_lobby(ctx: Context<CancelLobby>) -> Result<()> {
        instructions::cancel_lobby::handler(ctx)
    }
}
