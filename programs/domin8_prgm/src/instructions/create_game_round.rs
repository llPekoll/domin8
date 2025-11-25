use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(
    round_id: u64,
    map: u8,
)]
pub struct CreateGameRound<'info> {
    #[account(
        mut,
        seeds = [b"domin8_config"],
        bump,
    )]
    pub config: Account<'info, Domin8Config>,

    #[account(
        init,
        space = BASE_GAME_ACCOUNT_SIZE,
        payer = user,
        seeds = [
            b"domin8_game",
            round_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub game: Box<Account<'info, Domin8Game>>,

    #[account(
        mut,
        seeds = [b"active_game"],
        bump,
    )]
    pub active_game: Box<Account<'info, Domin8Game>>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Create new game round (admin only, no bets yet)
///
/// Accounts:
/// 0. `[writable]` config: [Domin8Config] Configuration
/// 1. `[writable]` game: [Domin8Game] Game round account (initialized empty)
/// 2. `[writable, signer]` user: [AccountInfo] Admin creating the game
/// 3. `[]` system_program: [AccountInfo] System program
///
/// Data:
/// - round_id: [u64] Round ID for the game
/// - map: [u8] Map/background ID (0-255)
pub fn handler(ctx: Context<CreateGameRound>, round_id: u64, map: u8) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let game = &mut ctx.accounts.game;
    let user = &ctx.accounts.user;

    // Verify admin authorization
    require!(user.key() == config.admin, Domin8Error::Unauthorized);

    // Check if system is locked
    require!(!config.lock, Domin8Error::GameLocked);

    // Validate round_id matches the expected next round
    require!(
        round_id == config.game_round,
        Domin8Error::GameAlreadyExists
    );

    // Get force from config (will be used when VRF is requested on 2nd bet)
    let force = config.force;

    // Initialize the game (empty, waiting for first bet)
    game.game_round = round_id;
    game.start_date = 0; // Will be set when first bet is placed
    game.end_date = 0; // Will be set when first bet is placed
    game.total_deposit = 0;
    game.rand = 0; // Will be filled when VRF callback executes
    game.map = map; // Set the map/background ID
    game.winner = None;
    game.winner_prize = 0; // Will be set when game ends
    game.winning_bet_index = None; // Will be set when game ends
    game.user_count = 0;
    game.force = force; // Store as [u8; 32]
    game.status = GAME_STATUS_WAITING;
    game.vrf_requested = false; // VRF will be requested on 2nd player join (optimization)
    game.wallets = Vec::new();
    game.bets = Vec::new();

    // Increment the game round counter for next game
    config.game_round += 1;

    // Lock the system to prevent multiple concurrent games
    config.lock = true;

    // Update active_game with full game data
    let active_game = &mut ctx.accounts.active_game;
    active_game.game_round = game.game_round;
    active_game.start_date = game.start_date;
    active_game.end_date = game.end_date;
    active_game.total_deposit = game.total_deposit;
    active_game.rand = game.rand;
    active_game.map = game.map;
    active_game.winner = game.winner;
    active_game.winner_prize = game.winner_prize;
    active_game.winning_bet_index = game.winning_bet_index;
    active_game.user_count = game.user_count;
    active_game.force = game.force;
    active_game.status = game.status;
    active_game.vrf_requested = game.vrf_requested;
    active_game.wallets = game.wallets.clone();
    active_game.bets = game.bets.clone();

    msg!("Game round {} created by admin: {}", round_id, user.key());
    msg!("Map ID: {}", map);
    msg!("VRF force (hex): {}", Utils::bytes_to_hex(&force));
    msg!("Active game updated to point to round {}", round_id);
    msg!("Game empty, waiting for first bet");

    emit!(GameCreated {
        round_id,
        creator: user.key(),
        initial_bet: 0, // No initial bet - separate instruction
        start_time: 0,  // Will be set on first bet
        end_time: 0,    // Will be set on first bet
        vrf_force: Utils::bytes_to_hex(&force),
        vrf_force_bytes: force,
    });

    Ok(())
}
#[event]
pub struct GameCreated {
    pub round_id: u64,
    pub creator: Pubkey,
    pub initial_bet: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub vrf_force: String,         // Hex string for readability
    pub vrf_force_bytes: [u8; 32], // Actual bytes used
}
