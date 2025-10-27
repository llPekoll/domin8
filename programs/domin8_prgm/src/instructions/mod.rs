// Instructions module - contains all instruction handlers

// Core instructions
pub mod initialize;
pub mod create_game;
pub mod place_bet;

// Resolution instructions (ORAO VRF)
pub mod close_betting_window;
pub mod select_winner_and_payout;
pub mod claim_winner_prize;
pub mod claim_house_fee;

// Maintenance instructions
pub mod cleanup_old_game;
pub mod emergency_unlock;
pub mod emergency_refund_vrf_timeout;
pub mod set_counter;
pub mod rotate_force;

// Mock VRF for localnet testing
#[cfg(feature = "localnet")]
pub mod fulfill_mock_vrf;

// Re-exports
pub use initialize::*;
pub use create_game::*;
pub use place_bet::*;
pub use close_betting_window::*;
pub use select_winner_and_payout::*;
pub use claim_winner_prize::*;
pub use claim_house_fee::*;
pub use cleanup_old_game::*;
pub use emergency_unlock::*;
pub use emergency_refund_vrf_timeout::*;
pub use set_counter::*;
pub use rotate_force::*;

#[cfg(feature = "localnet")]
pub use fulfill_mock_vrf::*;
