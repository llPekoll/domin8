use crate::*;
use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

#[vrf]
#[derive(Accounts)]
#[instruction(
    round_id: u64,
)]
pub struct EndGame<'info> {
    #[account(
        mut,
        seeds = [b"domin8_config"],
        bump,
    )]
    pub config: Account<'info, Domin8Config>,

    #[account(
        mut,
        seeds = [
            b"domin8_game",
            round_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub game: Box<Account<'info, Domin8Game>>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    /// CHECK: Treasury wallet
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: The oracle queue for Magic Block VRF
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// End game, draw winner, and distribute prizes (admin only)
/// Uses randomness already provided by Magic Block VRF callback
///
/// Accounts:
/// 0. `[writable]` config: [Domin8Config] Configuration
/// 1. `[writable]` game: [Domin8Game] Game round to end
/// 2. `[writable, signer]` admin: [AccountInfo] Administrator account
/// 3. `[writable]` treasury: [AccountInfo] Treasury wallet for fees
/// 4. `[]` system_program: [AccountInfo] System program
///
/// Data:
/// - round_id: [u64] Round ID for the game
pub fn handler(
    ctx: Context<EndGame>,
    round_id: u64,
) -> Result<()> {
    let admin = &ctx.accounts.admin;
    let treasury = &ctx.accounts.treasury;
    let clock = Clock::get()?;

    // First, do all validations without mutable borrows
    let game_data = &ctx.accounts.game;
    let config_data = &ctx.accounts.config;

    // Verify admin authorization
    require!(admin.key() == config_data.admin, Domin8Error::Unauthorized);

    // Check if game exists and is the correct round
    require!(game_data.game_round == round_id, Domin8Error::GameNotOpen);

    // Check if game is still open (status = 0)
    require!(game_data.status == GAME_STATUS_OPEN, Domin8Error::InvalidGameStatus);

    // Check if game has ended (current time > end_date)
    require!(clock.unix_timestamp >= game_data.end_date, Domin8Error::GameNotEnded);

    // Verify treasury address matches config
    require!(treasury.key() == config_data.treasury, Domin8Error::Unauthorized);

    // Ensure there are bets to process
    require!(!game_data.bets.is_empty(), Domin8Error::NoBets);

    // For multi-player games, request VRF if not done yet
    if game_data.user_count > 1 && !game_data.vrf_requested {
        msg!("Multi-player game detected. Requesting VRF randomness...");

        // Mark VRF as requested
        let game = &mut ctx.accounts.game;
        game.vrf_requested = true;

        // Encode round_id in caller_seed so callback can derive game PDA
        let mut caller_seed = [0u8; 32];
        caller_seed[0..8].copy_from_slice(&round_id.to_le_bytes());

        // Specify accounts to pass to callback (convert to SerializableAccountMeta)
        use ephemeral_vrf_sdk::types::SerializableAccountMeta;
        let callback_accounts = Some(vec![
            SerializableAccountMeta {
                pubkey: ctx.accounts.game.key(),
                is_signer: false,
                is_writable: true,
            },
        ]);

        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: admin.key(), // Admin (crank) pays for VRF
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::VrfCallback::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: callback_accounts,
            ..Default::default()
        });

        // Admin signs the VRF request
        ctx.accounts.invoke_signed_vrf(&admin.to_account_info(), &ix)?;

        msg!("VRF request submitted. Call end_game again in 3 seconds.");
        return Ok(()); // Return early, crank will retry after VRF callback
    }

    // Use randomness from Magic Block VRF callback (already stored in game)
    // For single player games, randomness might not be set (no VRF request)
    let randomness = if game_data.user_count == 1 {
        // Single player - use deterministic value based on game data
        let mut seed = round_id;
        seed = seed.wrapping_mul(game_data.total_deposit);
        seed = seed.wrapping_add(game_data.start_date as u64);
        msg!("Single player - using deterministic seed: {}", seed);
        seed
    } else {
        // Multi-player - use VRF randomness from callback
        require!(game_data.rand != 0, Domin8Error::RandomnessNotReady);
        msg!("Magic Block VRF randomness: {}", game_data.rand);
        game_data.rand
    };

    // Select winner using weighted random selection based on bet amounts
    let (selected_winner, winning_bet_index) = Utils::select_winner_by_weight(
        randomness,
        &game_data.bets,
        &game_data.wallets,
        game_data.total_deposit
    )?;

    // Calculate prize distribution from the FULL POT
    let total_pot = game_data.total_deposit;
    require!(total_pot > 0, Domin8Error::ArithmeticError);

    // Minimal logging to save CU
    msg!("Game {} ended: winner={}, pot={}", round_id, selected_winner, total_pot);

    // Check if single player (refund scenario - no fees)
    let is_single_player = game_data.user_count == 1;

    // Calculate house fee (zero for single player)
    let house_fee_amount = if is_single_player {
        0
    } else {
        Utils::calculate_fee(total_pot, config_data.house_fee)?
    };

    // Winner gets the remaining amount after fees are deducted
    let winner_prize = total_pot
        .checked_sub(house_fee_amount)
        .ok_or(Domin8Error::ArithmeticError)?;

    // Validate that we have enough funds to cover all distributions
    require!(house_fee_amount <= total_pot, Domin8Error::ArithmeticError);

    // Minimal fee logging
    msg!("Single player: {}, House fee: {}, Winner prize: {}", is_single_player, house_fee_amount, winner_prize);

    // Calculate rent-exempt minimum for the game account
    let rent = Rent::get()?;
    let game_account_size = ctx.accounts.game.to_account_info().data_len();
    let rent_exempt_minimum = rent.minimum_balance(game_account_size);
    let current_balance = ctx.accounts.game.to_account_info().lamports();

    // Transfer house fee
    if house_fee_amount > 0 {
        let max_transferable = current_balance.saturating_sub(rent_exempt_minimum);
        let actual_house_fee = house_fee_amount.min(max_transferable);

        if actual_house_fee > 0 {
            **ctx.accounts.game.to_account_info().try_borrow_mut_lamports()? -= actual_house_fee;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += actual_house_fee;
        }
    }

    // Now do all mutable updates after transfers are complete
    let game = &mut ctx.accounts.game;
    let config = &mut ctx.accounts.config;

    // Store winner prize amount in game state for later claiming
    game.winner_prize = winner_prize;
    game.rand = randomness;
    game.winner = Some(selected_winner);
    game.winning_bet_index = Some(winning_bet_index as u64);

    // Close the game
    game.status = GAME_STATUS_CLOSED;

    // Generate new VRF force seed for next game (using current randomness + game data)
    let mut new_force = [0u8; 32];
    let randomness_bytes = randomness.to_le_bytes();
    let round_id_bytes = round_id.to_le_bytes();
    let total_pot_bytes = total_pot.to_le_bytes();

    // Combine randomness, round_id, and total_pot to create new force seed
    for i in 0..32 {
        new_force[i] = randomness_bytes[i % 8]
            ^ round_id_bytes[i % 8]
            ^ total_pot_bytes[i % 8]
            ^ (i as u8);
    }

    // Update config with new force for next game
    config.force = new_force;

    // Minimal completion logging
    msg!("Game {} completed", round_id);

    // Unlock the system to allow new game creation
    config.lock = false;

    Ok(())
}
