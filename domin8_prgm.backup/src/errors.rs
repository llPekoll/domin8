use anchor_lang::prelude::*;

#[error_code]
pub enum Domin8Error {
    #[msg("Invalid game status for this action")]
    InvalidGameStatus,
    
    #[msg("Unauthorized: only authority can perform this action")]
    Unauthorized,
    
    #[msg("Betting phase is closed")]
    BettingPhaseClosed,
    
    #[msg("Bet amount is below minimum required")]
    BetTooSmall,

    #[msg("Bet amount exceeds maximum allowed")]
    BetTooLarge,
    
    #[msg("Maximum number of players reached")]
    MaxPlayersReached,
    
    #[msg("Player not found in current game")]
    PlayerNotFound,
    
    #[msg("Switchboard randomness value is not yet available for the committed slot")]
    RandomnessNotResolved,
    
    #[msg("The provided Switchboard randomness account is not valid for the current game round")]
    InvalidRandomnessAccount,
    
    #[msg("The committed slot has not elapsed yet")]
    CommitSlotNotElapsed,
    
    #[msg("A finalist cannot place a spectator bet")]
    NotASpectator,
    
    #[msg("Target finalist not found")]
    FinalistNotFound,
    
    #[msg("Insufficient funds for bet")]
    InsufficientFunds,
    
    #[msg("Mathematical overflow occurred")]
    MathOverflow,
    
    #[msg("No winner has been determined yet")]
    NoWinnerDetermined,
    
    // Phase 6 payout errors
    #[msg("Invalid game type for this operation")]
    InvalidGameType,
    
    #[msg("No winner has been set")]
    NoWinnerSet,
    
    #[msg("No finalists have been set")]
    NoFinalistsSet,
    
    #[msg("Payout amount exceeds available funds")]
    PayoutExceedsAvailableFunds,
    
    #[msg("Winnings have already been claimed")]
    AlreadyClaimed,
    
    #[msg("No winnings found for this wallet")]
    NoWinningsFound,
    
    #[msg("House fee has already been collected")]
    HouseFeeAlreadyCollected,
    
    #[msg("Game has already been reset")]
    GameAlreadyReset,
    
    // ORAO VRF errors
    #[msg("VRF account is invalid")]
    InvalidVrfAccount,
    
    #[msg("Randomness not yet fulfilled")]
    RandomnessNotFulfilled,
    
    #[msg("VRF request failed")]
    VrfRequestFailed,
    
    #[msg("Invalid VRF seed")]
    InvalidVrfSeed,
    
    #[msg("Invalid winner account")]
    InvalidWinnerAccount,
    
    #[msg("Invalid treasury account")]
    InvalidTreasury,
    
    #[msg("No players in game")]
    NoPlayers,
    
    #[msg("Invalid bet amount")]
    InvalidBetAmount,

    #[msg("Arithmetic overflow occurred")]
    ArithmeticOverflow,

    #[msg("Emergency time threshold not yet elapsed")]
    EmergencyTimeNotElapsed,

    #[msg("No funds available to refund")]
    NoFundsToRefund,

    #[msg("Betting window has closed")]
    BettingWindowClosed,

    #[msg("Betting window is still open")]
    BettingWindowStillOpen,

    #[msg("Bets are locked during resolution")]
    BetsLocked,

    #[msg("Cannot cleanup active or current game")]
    CannotCleanupActiveGame,

    #[msg("Game is too recent to cleanup (must be older than 1 week)")]
    GameTooRecentToCleanup,

    #[msg("Maximum number of bets reached (64 max)")]
    MaxBetsReached,

    #[msg("Invalid bet entry account")]
    InvalidBetEntry,

    #[msg("Randomness has already been fulfilled")]
    RandomnessAlreadyFulfilled,
}