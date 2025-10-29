use anchor_lang::prelude::*;
use crate::state::{GameConfig, GameCounter, GameDurationConfig, GameRound, GameStatus};
use crate::constants::*;
use crate::events::GameInitialized;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = GameConfig::LEN,
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    #[account(
        init,
        payer = authority,
        space = GameCounter::LEN,
        seeds = [GAME_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, GameCounter>,

    #[account(
        init,
        payer = authority,
        space = GameRound::LEN,
        seeds = [b"active_game"],
        bump
    )]
    pub active_game: Box<Account<'info, GameRound>>,

    /// CHECK: This is the vault PDA that will hold game funds
    #[account(
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    treasury: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let counter = &mut ctx.accounts.counter;
    let active_game = &mut ctx.accounts.active_game;

    // Initialize game configuration
    config.authority = ctx.accounts.authority.key();
    config.treasury = treasury;
    config.house_fee_basis_points = HOUSE_FEE_BASIS_POINTS;
    config.min_bet_lamports = MIN_BET_LAMPORTS;
    config.max_bet_lamports = MAX_BET_LAMPORTS;  // 3 SOL max

    // Set default durations for small games
    config.small_game_duration_config = GameDurationConfig {
        waiting_phase_duration: DEFAULT_SMALL_GAME_WAITING_DURATION,
    };

    // Initialize game control flags
    config.bets_locked = false;  // Start unlocked

    // Generate initial random force for VRF
    // Use clock + authority for initial randomness
    let clock = Clock::get()?;
    let mut force = [0u8; 32];
    let seed_data = [
        &clock.unix_timestamp.to_le_bytes()[..],
        &clock.slot.to_le_bytes()[..],
        ctx.accounts.authority.key().as_ref(),
    ].concat();

    // Hash the seed data to get random force
    use anchor_lang::solana_program::keccak::hashv;
    let hash = hashv(&[&seed_data]);
    force.copy_from_slice(&hash.0);
    config.force = force;

    // Initialize counter at 0
    counter.current_round_id = 0;

    // Initialize active_game account with default values (like riskdotfun pattern)
    active_game.round_id = 0; // No active game yet
    active_game.status = GameStatus::Finished; // Start in finished state
    active_game.start_timestamp = 0;
    active_game.end_timestamp = 0;
    active_game.bet_count = 0;
    active_game.total_pot = 0;
    active_game.bet_amounts = [0u64; 64];
    active_game.bet_skin = [0u8; 64];
    active_game.bet_position = [[0u16; 2]; 64];
    active_game.winner = Pubkey::default();
    active_game.winning_bet_index = 0;
    active_game.winner_prize_unclaimed = 0;
    active_game.house_fee_unclaimed = 0;
    active_game.vrf_request_pubkey = Pubkey::default();
    active_game.vrf_seed = force;
    active_game.randomness_fulfilled = false;

    msg!("Initial VRF force generated: {:?}", &force[0..16]);

    msg!("Domin8 game initialized with authority: {}", ctx.accounts.authority.key());
    msg!("Game counter initialized at round 0");
    msg!("Active game account initialized");

    // Emit initialization event
    emit!(GameInitialized {
        round_id: 0,
        start_timestamp: 0,
        end_timestamp: 0,
    });

    Ok(())
}