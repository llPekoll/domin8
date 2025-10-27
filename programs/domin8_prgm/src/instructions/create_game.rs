use crate::constants::*;
use crate::errors::Domin8Error;
use crate::events::{BetPlaced, GameCreated};
use crate::state::{BetEntry, GameConfig, GameCounter, GameRound, GameStatus};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hashv;
use anchor_lang::system_program;

#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::cpi::accounts::RequestV2;
#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::cpi::request_v2;
#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::program::OraoVrf;
#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::state::NetworkState;
#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::{CONFIG_ACCOUNT_SEED, ID as ORAO_VRF_ID};

#[cfg(feature = "localnet")]
use crate::state::MockVrfAccount;

#[derive(Accounts)]
pub struct CreateGame<'info> {
    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    #[account(
        mut,
        seeds = [GAME_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, GameCounter>,

    #[account(
        init,
        payer = player,
        space = GameRound::LEN,
        seeds = [GAME_ROUND_SEED, counter.current_round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub game_round: Account<'info, GameRound>,

    /// First bet entry PDA (bet_index = 0)
    #[account(
        init,
        payer = player,
        space = BetEntry::LEN,
        seeds = [b"bet", counter.current_round_id.to_le_bytes().as_ref(), 0u32.to_le_bytes().as_ref()],
        bump
    )]
    pub bet_entry: Account<'info, BetEntry>,

    /// CHECK: This is the vault PDA that holds game funds
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    // ORAO VRF accounts (only for devnet/mainnet)
    #[cfg(not(feature = "localnet"))]
    /// ORAO VRF Program
    pub vrf_program: Program<'info, OraoVrf>,

    #[cfg(not(feature = "localnet"))]
    /// ORAO Network State (validated as PDA from ORAO VRF program)
    #[account(
        mut,
        seeds = [CONFIG_ACCOUNT_SEED],
        bump,
        seeds::program = ORAO_VRF_ID
    )]
    pub network_state: Account<'info, NetworkState>,

    #[cfg(not(feature = "localnet"))]
    /// ORAO Treasury
    /// CHECK: ORAO VRF program validates this
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    #[cfg(not(feature = "localnet"))]
    /// VRF Request Account (will be created by ORAO VRF program)
    /// CHECK: Orao randomness account - derived from force field in instruction logic
    #[account(mut)]
    pub vrf_request: AccountInfo<'info>,

    // Mock VRF account (only for localnet)
    #[cfg(feature = "localnet")]
    /// Mock VRF account that will store randomness
    #[account(
        init,
        payer = player,
        space = MockVrfAccount::LEN,
        seeds = [MockVrfAccount::SEED_PREFIX, config.force.as_ref()],
        bump
    )]
    pub mock_vrf: Account<'info, MockVrfAccount>,

    pub system_program: Program<'info, System>,
}

/// Create a new game round with the first bet
/// This instruction is called by the first player to place a bet in a new round
pub fn create_game(ctx: Context<CreateGame>, amount: u64) -> Result<()> {
    msg!("Initializing game round creation");
    let config = &mut ctx.accounts.config;
    let counter = &mut ctx.accounts.counter;
    let game_round = &mut ctx.accounts.game_round;
    let player_key = ctx.accounts.player.key();
    let clock = Clock::get()?;

    // ⭐ Check if bets are locked (prevents concurrent game creation)
    require!(!config.bets_locked, Domin8Error::BetsLocked);

    // Validate bet amount meets minimum requirement
    require!(amount >= MIN_BET_LAMPORTS, Domin8Error::BetTooSmall);

    // ⭐ Validate bet amount doesn't exceed maximum (prevent whale dominance)
    require!(amount <= MAX_BET_LAMPORTS, Domin8Error::BetTooLarge);

    // Check if user has sufficient funds (similar to Risk's validation)
    require!(
        ctx.accounts.player.lamports() >= amount,
        Domin8Error::InsufficientFunds
    );

    // Initialize new game round with current counter value
    game_round.round_id = counter.current_round_id;

    // ⭐ Note: Counter is NOT incremented here - it stays at current round
    // Counter will be incremented in select_winner_and_payout after game finishes
    // This allows place_bet to reference the game using counter.current_round_id
    msg!("Creating game for round: {}", counter.current_round_id);
    game_round.status = GameStatus::Waiting;
    game_round.start_timestamp = clock.unix_timestamp;
    // ⭐ Set betting window end time (30 seconds from now)
    game_round.end_timestamp = clock
        .unix_timestamp
        .checked_add(DEFAULT_SMALL_GAME_WAITING_DURATION as i64)
        .ok_or(Domin8Error::ArithmeticOverflow)?;

    game_round.total_pot = amount;
    game_round.winner = Pubkey::default();
    game_round.winning_bet_index = 0; // Initialize to 0
    game_round.winner_prize_unclaimed = 0; // No unclaimed prize at start
    game_round.house_fee_unclaimed = 0; // No unclaimed house fee at start
    game_round.randomness_fulfilled = false;
    msg!("Basic set");

    // ⭐ REQUEST VRF FIRST (before transferring bet) - gives ORAO 30 seconds to fulfill during waiting period
    // Use force field from config for VRF seed (like riskdotfun)
    // This ensures unique VRF request PDAs for each game
    let seed: [u8; 32] = config.force;
    game_round.vrf_seed = seed;

    #[cfg(not(feature = "localnet"))]
    {
        // PRODUCTION PATH: Use ORAO VRF
        game_round.vrf_request_pubkey = ctx.accounts.vrf_request.key();

        // Make CPI call to ORAO VRF (charges VRF fee from player)
        let cpi_program = ctx.accounts.vrf_program.to_account_info();
        let cpi_accounts = RequestV2 {
            payer: ctx.accounts.player.to_account_info(),
            network_state: ctx.accounts.network_state.to_account_info(),
            treasury: ctx.accounts.treasury.to_account_info(),
            request: ctx.accounts.vrf_request.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        msg!("mamadou");

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        request_v2(cpi_ctx, seed)?;
        msg!("VRF requested with force: {:?}", &seed[0..16]);
    }

    #[cfg(feature = "localnet")]
    {
        // LOCALNET PATH: Initialize mock VRF account
        game_round.vrf_request_pubkey = ctx.accounts.mock_vrf.key();
        
        let mock_vrf = &mut ctx.accounts.mock_vrf;
        mock_vrf.seed = seed;
        mock_vrf.randomness = [0u8; 64];
        mock_vrf.fulfilled = false;
        mock_vrf.fulfilled_at = 0;
        
        msg!("✓ Mock VRF account created (use fulfill_mock_vrf to fulfill)");
        msg!("  Seed: {:?}", &seed[0..16]);
        msg!("  Mock VRF PDA: {}", ctx.accounts.mock_vrf.key());
    }

    // ⭐ CRITICAL: Rotate force IMMEDIATELY after VRF request (prevents PDA collisions on next game)
    // This mirrors Risk.fun's pattern and prevents reusing the same VRF request PDA
    let old_force = config.force;
    let new_force_hash = hashv(&[
        &old_force,
        &game_round.round_id.to_le_bytes(),
        &clock.unix_timestamp.to_le_bytes(),
        &clock.slot.to_le_bytes(),
    ]);
    config.force.copy_from_slice(&new_force_hash.0);
    msg!("Force rotated for next game: {:?}", &config.force[0..16]);

    // Transfer SOL to vault (AFTER VRF request so player has enough for VRF fee)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!("New game round created: {}", game_round.round_id);
    msg!(
        "Game started by first bet - betting window closes at {}",
        game_round.end_timestamp
    );
    msg!("VRF requested immediately - will fulfill during waiting period");
    msg!("VRF seed (first 16 bytes): {:?}", &seed[0..16]);
    
    #[cfg(not(feature = "localnet"))]
    msg!("VRF request account: {}", ctx.accounts.vrf_request.key());
    
    #[cfg(feature = "localnet")]
    msg!("Mock VRF account: {}", ctx.accounts.mock_vrf.key());

    // TODO should he initailise here
    // Initialize the first bet entry PDA
    let bet_entry = &mut ctx.accounts.bet_entry;
    bet_entry.game_round_id = game_round.round_id;
    bet_entry.bet_index = 0; // First bet
    bet_entry.wallet = player_key;
    bet_entry.bet_amount = amount;
    bet_entry.timestamp = clock.unix_timestamp;
    bet_entry.payout_collected = false;

    // Store first bet in array for efficient winner selection
    game_round.bet_amounts[0] = amount;
    game_round.bet_count = 1;

    // Initialize remaining array slots to zero
    for i in 1..64 {
        game_round.bet_amounts[i] = 0;
    }

    msg!(
        "First bet placed: {}, amount: {}, total bets: {}",
        player_key,
        amount,
        game_round.bet_count
    );
    msg!("Total pot: {} lamports", game_round.total_pot);
    msg!("game round ->{}", game_round.get_lamports());
    msg!("game Len ->{}", game_round.to_account_info().data_len());
    msg!("Rent {}", Rent::get()?.minimum_balance(GameRound::LEN));

    // ⭐ LOCK SYSTEM (prevents concurrent games using same force)
    config.bets_locked = true;
    msg!("✓ System locked - game in progress");

    // ⭐ Emit GameCreated event (includes VRF force info for transparency)
    emit!(GameCreated {
        round_id: game_round.round_id,
        creator: player_key,
        initial_bet: amount,
        start_time: game_round.start_timestamp,
        end_time: game_round.end_timestamp,
        vrf_seed_used: seed,         // Force used for THIS game's VRF
        next_vrf_seed: config.force, // Rotated force for NEXT game
    });

    // ⭐ Emit bet placed event
    emit!(BetPlaced {
        round_id: game_round.round_id,
        player: player_key,
        amount,
        bet_count: game_round.bet_count as u8,
        total_pot: game_round.total_pot,
        end_timestamp: game_round.end_timestamp,
        is_first_bet: true,
        timestamp: clock.unix_timestamp,
        bet_index: 0, // First bet
    });

    msg!("✓ Game round {} created successfully", game_round.round_id);
    msg!("  Creator: {}", player_key);
    msg!("  Initial bet: {} lamports", amount);
    msg!(
        "  VRF seed (hex): {:02x}{:02x}{:02x}{:02x}...",
        seed[0],
        seed[1],
        seed[2],
        seed[3]
    );
    msg!(
        "  Next VRF seed (hex): {:02x}{:02x}{:02x}{:02x}...",
        config.force[0],
        config.force[1],
        config.force[2],
        config.force[3]
    );

    Ok(())
}
