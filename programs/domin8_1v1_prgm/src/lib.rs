use anchor_lang::prelude::*;

mod error;
mod state;
mod instructions;
mod utils;

pub use error::*;
pub use state::*;
pub use instructions::*;
pub use utils::*;

declare_id!("Fgz78yXMJGd9w8ofKopffHZ8VqHN1Ao9YmqYnXCbA8r1");

#[program]
pub mod domin8_1v1_prgm {
    use super::*;

    /// Initialize the global configuration account
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        house_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, house_fee_bps)
    }

    /// Create a new 1v1 lobby (Player A creates, funds it, requests VRF)
    pub fn create_lobby(
        ctx: Context<CreateLobby>,
        amount: u64,
        skin_a: u8,
        map: u8,
    ) -> Result<()> {
        instructions::create_lobby::handler(ctx, amount, skin_a, map)
    }

    /// Join an existing 1v1 lobby (Player B joins, funds it, resolves game)
    pub fn join_lobby(
        ctx: Context<JoinLobby>,
        amount: u64,
        skin_b: u8,
    ) -> Result<()> {
        instructions::join_lobby::handler(ctx, amount, skin_b)
    }

    /// VRF callback - called automatically by MagicBlock VRF
    /// Stores randomness in lobby, sets status to VRF_RECEIVED
    pub fn vrf_callback(
        ctx: Context<VrfCallback>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::vrf_callback::handler(ctx, randomness)
    }

    /// Settle a 1v1 lobby after VRF has been received
    /// Can be called by anyone to distribute funds based on stored randomness
    pub fn settle_lobby(
        ctx: Context<SettleLobby>,
    ) -> Result<()> {
        instructions::settle_lobby::handler(ctx)
    }

    /// Rescue a stuck lobby (admin only)
    /// Can be called by admin to refund both players if VRF times out
    pub fn rescue_lobby(
        ctx: Context<RescueLobby>,
    ) -> Result<()> {
        instructions::rescue_lobby::handler(ctx)
    }
}
