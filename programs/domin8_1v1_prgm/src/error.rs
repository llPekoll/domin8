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

    #[msg("Switchboard randomness not yet resolved")]
    RandomnessNotResolved,

    #[msg("Switchboard randomness already revealed for this slot")]
    RandomnessAlreadyRevealed,

    #[msg("Invalid bet amount")]
    InvalidBetAmount,

    #[msg("House fee configuration error")]
    InvalidHouseFee,

    #[msg("Unable to determine winner from randomness")]
    WinnerDeterminationError,

    #[msg("Fund distribution failed")]
    DistributionError,

    #[msg("Randomness account is not owned by Switchboard program")]
    InvalidRandomnessAccountOwner,

    #[msg("Failed to parse Switchboard randomness account data")]
    RandomnessAccountParseError,

    #[msg("Randomness value conversion to winner failed")]
    RandomnessConversionError,

    #[msg("Randomness seed does not match lobby force seed")]
    InvalidRandomnessSeed,
}
