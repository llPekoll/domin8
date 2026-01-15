use anchor_lang::prelude::*;

/// Errors for the 1v1 Coinflip program
#[error_code]
pub enum Domin81v1Error {
    #[msg("Lobby not found or invalid PDA")]
    LobbyNotFound,

    #[msg("Lobby is not in the correct status")]
    InvalidLobbyStatus,

    #[msg("Unauthorized: only player B can join")]
    UnauthorizedJoin,

    #[msg("Lobby is already joined by a second player")]
    AlreadyJoined,

    #[msg("Insufficient funds for bet")]
    InsufficientFunds,

    #[msg("Invalid bet amount")]
    InvalidBetAmount,

    #[msg("House fee configuration error")]
    InvalidHouseFee,

    #[msg("Unable to determine winner from randomness")]
    WinnerDeterminationError,

    #[msg("Fund distribution failed")]
    DistributionError,

    #[msg("Randomness value conversion to winner failed")]
    RandomnessConversionError,

    #[msg("Randomness not yet available - VRF callback has not been executed")]
    RandomnessNotAvailable,

    #[msg("Self-play not allowed: Player A cannot join their own lobby")]
    SelfPlayNotAllowed,

    #[msg("Bet amount is below minimum required")]
    BetBelowMinimum,

    #[msg("Lobby has expired and can be rescued")]
    LobbyExpired,

    #[msg("Lobby has not expired yet")]
    LobbyNotExpired,

    #[msg("Unauthorized: only admin can perform this action")]
    UnauthorizedAdmin,
}
