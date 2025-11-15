use anchor_lang::prelude::*;

/// Errors for the 1v1 Coinflip program
#[error_code]
pub enum Domin81v1Error {
    #[msg("Lobby not found or invalid PDA")]
    LobbyNotFound,

    #[msg("Lobby is not in the correct status")]
    InvalidLobbyStatus,

    #[msg("Unauthorized: only player A can cancel")]
    UnauthorizedCancellation,

    #[msg("Unauthorized: only player B can join")]
    UnauthorizedJoin,

    #[msg("Lobby is already joined by a second player")]
    AlreadyJoined,

    #[msg("Insufficient funds for bet")]
    InsufficientFunds,

    #[msg("VRF randomness not yet fulfilled")]
    RandomnessNotReady,

    #[msg("Invalid bet amount")]
    InvalidBetAmount,

    #[msg("House fee configuration error")]
    InvalidHouseFee,

    #[msg("Unable to determine winner from randomness")]
    WinnerDeterminationError,

    #[msg("Fund distribution failed")]
    DistributionError,
}
