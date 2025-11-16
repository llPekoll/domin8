use anchor_lang::prelude::*;

mod error;
mod state;
mod instructions;
mod utils;

pub use error::*;
pub use state::*;
pub use instructions::*;
pub use utils::*;

declare_id!("2A7t8oJqXpSPNZxz92Ed9WaymzLg1yeUfiPymVFha9oh"); // TODO: Generate actual program ID

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
        position_a: [u16; 2],
        map: u8,
    ) -> Result<()> {
        instructions::create_lobby::handler(ctx, amount, skin_a, position_a, map)
    }

    /// Join an existing 1v1 lobby (Player B joins, funds it, resolves game)
    pub fn join_lobby(
        ctx: Context<JoinLobby>,
        amount: u64,
        skin_b: u8,
        position_b: [u16; 2],
    ) -> Result<()> {
        instructions::join_lobby::handler(ctx, amount, skin_b, position_b)
    }

    /// Cancel a 1v1 lobby (Player A refunds if status = created)
    pub fn cancel_lobby(
        ctx: Context<CancelLobby>,
    ) -> Result<()> {
        instructions::cancel_lobby::handler(ctx)
    }
}
