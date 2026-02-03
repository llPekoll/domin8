use anchor_lang::prelude::*;

/// Errors for the CHOP program
#[error_code]
pub enum ChopError {
    #[msg("Lobby not found or invalid PDA")]
    LobbyNotFound,

    #[msg("Lobby is not in the correct status")]
    InvalidLobbyStatus,

    #[msg("Lobby is already full")]
    LobbyFull,

    #[msg("Insufficient funds for bet")]
    InsufficientFunds,

    #[msg("Bet amount is below minimum required")]
    BetBelowMinimum,

    #[msg("Fee configuration error: total fees exceed maximum")]
    InvalidFeeConfiguration,

    #[msg("Winner must be a player in the lobby")]
    InvalidWinner,

    #[msg("Fund distribution failed")]
    DistributionError,

    #[msg("Self-play not allowed: creator cannot join their own lobby")]
    SelfPlayNotAllowed,

    #[msg("Lobby has not timed out yet")]
    LobbyNotTimedOut,

    #[msg("Unauthorized: only admin can perform this action")]
    UnauthorizedAdmin,

    #[msg("Unauthorized: only creator can cancel this lobby")]
    UnauthorizedCancel,

    #[msg("Cannot cancel: lobby already has players")]
    CannotCancelWithPlayers,
}
