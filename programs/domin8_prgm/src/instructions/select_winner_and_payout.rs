use crate::constants::{GAME_CONFIG_SEED, GAME_COUNTER_SEED, GAME_ROUND_SEED, VAULT_SEED};
use crate::errors::Domin8Error;
use crate::events::WinnerSelected;
use crate::state::{GameConfig, GameCounter, GameRound, GameStatus};
use crate::utils::GameUtils;
use anchor_lang::prelude::*;

#[cfg(not(feature = "localnet"))]
use orao_solana_vrf::state::RandomnessAccountData;

#[cfg(feature = "localnet")]
use crate::state::MockVrfAccount;

#[derive(Accounts)]
pub struct SelectWinnerAndPayout<'info> {
    #[account(
        mut,
        seeds = [GAME_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, GameCounter>,

    #[account(
        mut,
        seeds = [GAME_ROUND_SEED, counter.current_round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub game_round: Account<'info, GameRound>,

    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GameConfig>,

    /// The vault PDA that holds game funds
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// The crank authority
    #[account(
        constraint = crank.key() == config.authority @ Domin8Error::Unauthorized
    )]
    pub crank: Signer<'info>,

    #[cfg(not(feature = "localnet"))]
    /// VRF Request Account containing fulfilled randomness (ORAO)
    /// CHECK: This account was created by ORAO VRF program
    pub vrf_request: AccountInfo<'info>,

    #[cfg(feature = "localnet")]
    /// Mock VRF Account containing fulfilled randomness (localnet)
    #[account(
        seeds = [MockVrfAccount::SEED_PREFIX, game_round.vrf_seed.as_ref()],
        bump
    )]
    pub mock_vrf: Account<'info, MockVrfAccount>,

    /// Treasury account for receiving house fees
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ Domin8Error::InvalidTreasury
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Select winner using VRF randomness and distribute payouts
pub fn select_winner_and_payout<'info>(
    ctx: Context<'_, '_, '_, 'info, SelectWinnerAndPayout<'info>>,
) -> Result<()> {
    let game_round = &mut ctx.accounts.game_round;

    require!(
        game_round.status == GameStatus::AwaitingWinnerRandomness,
        Domin8Error::InvalidGameStatus
    );

    #[cfg(not(feature = "localnet"))]
    require!(
        ctx.accounts.vrf_request.key() == game_round.vrf_request_pubkey,
        Domin8Error::InvalidVrfAccount
    );

    #[cfg(feature = "localnet")]
    require!(
        ctx.accounts.mock_vrf.key() == game_round.vrf_request_pubkey,
        Domin8Error::InvalidVrfAccount
    );

    // 1. READ RANDOMNESS FROM VRF
    #[cfg(not(feature = "localnet"))]
    let randomness = read_orao_randomness(&ctx.accounts.vrf_request)?;
    
    #[cfg(feature = "localnet")]
    let randomness = read_mock_randomness(&ctx.accounts.mock_vrf)?;
    
    msg!("Retrieved VRF randomness: {}", randomness);

    // Mark randomness as fulfilled
    game_round.randomness_fulfilled = true;

    // 2. SELECT WINNER USING VERIFIED RANDOMNESS
    require!(game_round.bet_count >= 2, Domin8Error::InvalidGameStatus);

    // Select winning bet index using utility function
    let winning_bet_index = GameUtils::select_weighted_winner(
        &game_round.bet_amounts,
        game_round.bet_count as usize,
        randomness,
    )?;

    game_round.winning_bet_index = winning_bet_index as u32;

    // Get winner wallet from remaining_accounts (player wallet accounts passed from backend)
    require!(
        ctx.remaining_accounts.len() >= game_round.bet_count as usize,
        Domin8Error::InvalidBetEntry
    );

    let winner_wallet_account = &ctx.remaining_accounts[winning_bet_index];
    let winner_wallet = winner_wallet_account.key();
    game_round.winner = winner_wallet;

    let winning_bet_amount = game_round.bet_amounts[winning_bet_index];
    msg!(
        "Winner selected: Bet #{} - Wallet: {} - Amount: {}",
        winning_bet_index,
        winner_wallet,
        winning_bet_amount
    );

    // 3. CALCULATE WINNINGS USING UTILITY FUNCTIONS
    let total_pot = game_round.total_pot;
    let house_fee =
        GameUtils::calculate_house_fee(total_pot, ctx.accounts.config.house_fee_basis_points)?;
    let winner_payout = total_pot.saturating_sub(house_fee);

    // Calculate win probability for logging
    let win_probability_bps =
        GameUtils::calculate_win_probability_bps(winning_bet_amount, total_pot)?;
    let win_probability = GameUtils::bps_to_percentage(win_probability_bps);

    msg!(
        "Distributing: {} to winner, {} to house",
        winner_payout,
        house_fee
    );
    msg!("Winner's probability: {:.2}%", win_probability);

    // 4. DISTRIBUTE WINNINGS
    // Use system program transfer with PDA signing
    let vault_bump = ctx.bumps.vault;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &[vault_bump]]];

    // 4A. ATTEMPT AUTOMATIC WINNER PAYOUT (with graceful failure handling)
    let mut auto_transfer_success = false;

    if winner_payout > 0 {
        let vault_lamports = ctx.accounts.vault.lamports();
        require!(
            vault_lamports >= winner_payout,
            Domin8Error::InsufficientFunds
        );

        // Use invoke_signed for PDA signing
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.vault.key(),
            &winner_wallet,
            winner_payout,
        );

        // Attempt transfer - don't fail entire tx if this fails!
        let transfer_result = anchor_lang::solana_program::program::invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.vault.to_account_info(),
                winner_wallet_account.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        );

        match transfer_result {
            Ok(_) => {
                auto_transfer_success = true;
                game_round.winner_prize_unclaimed = 0;
                msg!(
                    "✓ Automatic transfer succeeded: {} lamports to {}",
                    winner_payout,
                    winner_wallet
                );
            }
            Err(e) => {
                // Transfer failed - store prize for manual claim
                game_round.winner_prize_unclaimed = winner_payout;
                msg!("⚠️ Automatic transfer failed (error: {:?})", e);
                msg!(
                    "   Winner can claim {} lamports manually via claim_winner_prize",
                    winner_payout
                );
                msg!("   Game will continue - house fee still distributed");
            }
        }
    } else {
        game_round.winner_prize_unclaimed = 0;
    }

    // 4B. ATTEMPT House Fee Transfer (with graceful failure handling)
    let mut house_fee_success = false;

    if house_fee > 0 {
        let house_fee_result = anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
                signer_seeds,
            ),
            house_fee,
        );

        match house_fee_result {
            Ok(_) => {
                house_fee_success = true;
                game_round.house_fee_unclaimed = 0;
                msg!(
                    "✓ House fee transferred: {} lamports to treasury",
                    house_fee
                );
            }
            Err(e) => {
                // Transfer failed - store fee for manual claim
                game_round.house_fee_unclaimed = house_fee;
                msg!("⚠️ House fee transfer failed (error: {:?})", e);
                msg!(
                    "   Treasury can claim {} lamports manually via claim_house_fee",
                    house_fee
                );
                msg!("   Game will continue - winner payout already processed");
            }
        }
    } else {
        game_round.house_fee_unclaimed = 0;
        house_fee_success = true;
    }

    // 5. MARK GAME AS FINISHED
    game_round.status = GameStatus::Finished;
    msg!("Game status updated to Finished");

    // 6. EMIT ENHANCED WINNER SELECTED EVENT
    let clock = Clock::get()?;
    let vrf_seed_hex = GameUtils::bytes_to_hex(&game_round.vrf_seed);

    emit!(WinnerSelected {
        round_id: game_round.round_id,
        winner: winner_wallet,
        winning_bet_index: winning_bet_index as u32,
        winning_bet_amount,
        total_pot,
        house_fee,
        winner_payout,
        win_probability_bps,
        total_bets: game_round.bet_count,
        auto_transfer_success,
        house_fee_transfer_success: house_fee_success,
        vrf_randomness: randomness,
        vrf_seed_hex,
        timestamp: clock.unix_timestamp,
    });

    // 7. INCREMENT COUNTER FOR NEXT GAME
    let counter = &mut ctx.accounts.counter;
    let new_round_id = counter
        .current_round_id
        .checked_add(1)
        .ok_or(Domin8Error::ArithmeticOverflow)?;
    counter.current_round_id = new_round_id;

    // 8. ROTATE FORCE FIELD FOR NEXT GAME (prevents VRF account collisions)
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;
    let mut new_force = [0u8; 32];
    let seed_data = [
        &randomness.to_le_bytes()[..],
        &clock.slot.to_le_bytes()[..],
        &clock.unix_timestamp.to_le_bytes()[..],
    ]
    .concat();

    // Hash to get new force
    use anchor_lang::solana_program::keccak::hashv;
    let hash = hashv(&[&seed_data]);
    new_force.copy_from_slice(&hash.0);
    config.force = new_force;

    msg!("New VRF force for next game: {:?}", &new_force[0..16]);

    // 9. UNLOCK BETS FOR NEXT GAME
    config.bets_locked = false;

    msg!("✓ Game {} completed successfully", game_round.round_id);
    msg!(
        "✓ Winner: {} - Prize: {} lamports",
        winner_wallet,
        winner_payout
    );
    msg!("✓ House fee: {} lamports", house_fee);
    msg!("✓ Counter incremented to {}", new_round_id);
    msg!("✓ Bets unlocked for next round");

    // GameRound account remains for historical record
    // Use cleanup_old_game instruction to close it after 1 week

    Ok(())
}

#[cfg(not(feature = "localnet"))]
fn read_orao_randomness(vrf_account: &AccountInfo) -> Result<u64> {
    // Use ORAO SDK to properly deserialize the VRF account
    let mut data = &vrf_account.try_borrow_data()?[..];
    let vrf_state = RandomnessAccountData::try_deserialize(&mut data)
        .map_err(|_| Domin8Error::InvalidVrfAccount)?;

    // Get fulfilled randomness (returns [u8; 64])
    let rnd64 = vrf_state
        .fulfilled_randomness()
        .ok_or(Domin8Error::RandomnessNotFulfilled)?;

    // Use first 8 bytes as u64
    let randomness = u64::from_le_bytes(rnd64[0..8].try_into().unwrap());

    Ok(randomness)
}

#[cfg(feature = "localnet")]
fn read_mock_randomness(mock_vrf: &Account<MockVrfAccount>) -> Result<u64> {
    require!(mock_vrf.fulfilled, Domin8Error::RandomnessNotFulfilled);
    
    // Use first 8 bytes as u64 (same as ORAO)
    let randomness = u64::from_le_bytes(mock_vrf.randomness[0..8].try_into().unwrap());
    
    Ok(randomness)
}
