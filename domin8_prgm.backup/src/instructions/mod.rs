// Instructions module - contains all instruction handlers

// Core instructions
pub mod create_game;
pub mod initialize;
pub mod place_bet;

// Resolution instructions (ORAO VRF)
pub mod claim_house_fee;
pub mod claim_winner_prize;
pub mod close_betting_window;
pub mod select_winner_and_payout;

// Maintenance instructions
pub mod cleanup_old_game;
pub mod emergency_refund_vrf_timeout;
pub mod emergency_unlock;

// Mock VRF for localnet testing
#[cfg(feature = "localnet")]
pub mod fulfill_mock_vrf;

// Re-exports
pub use claim_house_fee::*;
pub use claim_winner_prize::*;
pub use cleanup_old_game::*;
pub use close_betting_window::*;
pub use create_game::*;
pub use emergency_refund_vrf_timeout::*;
pub use emergency_unlock::*;
pub use initialize::*;
pub use place_bet::*;
pub use rotate_force::*;
pub use select_winner_and_payout::*;

#[cfg(feature = "localnet")]
pub use fulfill_mock_vrf::*;
