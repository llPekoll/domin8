use anchor_lang::prelude::*;

// Import modules
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

// Import everything we need for the program
use instructions::*;

// Re-export public types for external use
pub use constants::*;
pub use errors::*;
pub use events::*;
pub use state::*;
pub use utils::*;

declare_id!("93swWR5KYURGFWhDbgat9HxRdJAS5pQKssPffnj9bfXK");

#[program]
pub mod domin8_prgm {
    use super::*;

    /// Initialize the game with configuration
    pub fn initialize(ctx: Context<Initialize>, treasury: Pubkey) -> Result<()> {
        instructions::initialize(ctx, treasury)
    }

    /// Create a new game round with the first bet (called by first player)
    pub fn create_game(ctx: Context<CreateGame>, amount: u64) -> Result<()> {
        instructions::create_game(ctx, amount)
    }

    /// Place an additional bet in the current game round (called by subsequent players)
    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64) -> Result<()> {
        instructions::place_bet(ctx, amount)
    }

    /// Close betting window and lock game for winner selection
    pub fn close_betting_window<'info>(
        ctx: Context<'_, '_, '_, 'info, CloseBettingWindow<'info>>,
    ) -> Result<()> {
        instructions::close_betting_window(ctx)
    }

    /// Select winner using VRF and distribute payouts
    pub fn select_winner_and_payout<'info>(
        ctx: Context<'_, '_, '_, 'info, SelectWinnerAndPayout<'info>>,
    ) -> Result<()> {
        instructions::select_winner_and_payout(ctx)
    }

    /// Claim winner prize manually (if automatic transfer failed)
    pub fn claim_winner_prize(ctx: Context<ClaimWinnerPrize>, round_id: u64) -> Result<()> {
        instructions::claim_winner_prize(ctx, round_id)
    }

    /// Claim house fee manually (if automatic transfer failed)
    pub fn claim_house_fee(ctx: Context<ClaimHouseFee>, round_id: u64) -> Result<()> {
        instructions::claim_house_fee(ctx, round_id)
    }

    /// Cleanup old game round (backend-triggered after 1 week)
    pub fn cleanup_old_game(ctx: Context<CleanupOldGame>, round_id: u64) -> Result<()> {
        instructions::cleanup_old_game(ctx, round_id)
    }

    /// Emergency unlock bets (admin only, for stuck states)
    pub fn emergency_unlock(ctx: Context<EmergencyUnlock>) -> Result<()> {
        instructions::emergency_unlock(ctx)
    }

    /// Emergency refund if VRF timeout (10+ minutes with no randomness)
    pub fn emergency_refund_vrf_timeout<'info>(
        ctx: Context<'_, '_, '_, 'info, EmergencyRefundVrfTimeout<'info>>,
    ) -> Result<()> {
        instructions::emergency_refund_vrf_timeout(ctx)
    }

    /// Set counter value (admin only, for fixing stuck states)
    pub fn set_counter(ctx: Context<SetCounter>, new_value: u64) -> Result<()> {
        instructions::set_counter(ctx, new_value)
    }

    /// Rotate force field (admin only, for fixing stuck VRF states)
    pub fn rotate_force(ctx: Context<RotateForce>) -> Result<()> {
        instructions::rotate_force(ctx)
    }

    /// Fulfill mock VRF randomness (LOCALNET ONLY - for testing)
    #[cfg(feature = "localnet")]
    pub fn fulfill_mock_vrf(ctx: Context<FulfillMockVrf>, randomness: u64) -> Result<()> {
        instructions::fulfill_mock_vrf(ctx, randomness)
    }
}
