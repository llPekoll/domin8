use crate::constants::{GAME_CONFIG_SEED, GAME_COUNTER_SEED, GAME_ROUND_SEED};
use crate::errors::Domin8Error;
use crate::events::GameLocked;
use crate::state::{GameConfig, GameCounter, GameRound, GameStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CloseBettingWindow<'info> {
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
        seeds = [b"vault"],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// The crank authority
    #[account(
        constraint = crank.key() == config.authority @ Domin8Error::Unauthorized
    )]
    pub crank: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Close betting window and transition game to winner selection phase
///
/// Requires remaining_accounts: 
/// - First: All BetEntry PDAs for the game (to count unique players)
/// - Then: Unique player wallet accounts (for automatic refund transfer in single-player games)
pub fn close_betting_window<'info>(ctx: Context<'_, '_, '_, 'info, CloseBettingWindow<'info>>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let game_round = &mut ctx.accounts.game_round;
    let clock = Clock::get()?;

    // Validate game state
    require!(
        game_round.status == GameStatus::Waiting,
        Domin8Error::InvalidGameStatus
    );

    // ⭐ Validate betting window has closed (prevents early progression)
    require!(
        clock.unix_timestamp >= game_round.end_timestamp,
        Domin8Error::BettingWindowStillOpen
    );

    // ⭐ Lock bets to prevent new bets during resolution
    config.bets_locked = true;

    let bet_count = game_round.bet_count as usize;
    msg!(
        "Closing betting window: game {} with {} bets",
        game_round.round_id,
        bet_count
    );
    msg!("Bets locked - no new bets allowed during resolution");

    // ⭐ CRITICAL: Count unique players (not just bet count!)
    // A single player could place multiple bets - we need at least 2 different wallets
    require!(
        ctx.remaining_accounts.len() >= bet_count,
        Domin8Error::InvalidBetEntry
    );

    // Extract unique player wallets from BetEntry accounts
    use crate::state::BetEntry;
    let mut unique_wallets: Vec<Pubkey> = Vec::new();

    for account_info in ctx.remaining_accounts[..bet_count].iter() {
        let bet_entry_data = account_info.try_borrow_data()?;
        let bet_entry = BetEntry::try_deserialize(&mut &bet_entry_data[..])?;

        if !unique_wallets.contains(&bet_entry.wallet) {
            unique_wallets.push(bet_entry.wallet);
        }
    }

    let unique_player_count = unique_wallets.len();
    msg!("Unique players: {} (from {} total bets)", unique_player_count, bet_count);

    // ⭐ Handle single player game (refund scenario)
    // This happens when only ONE unique wallet placed all the bets
    if unique_player_count == 1 {
        // Single player - immediate finish (no competition)
        // Player marked as "winner" so they can claim their full pot back via claim_winner_prize
        game_round.status = GameStatus::Finished;
        game_round.winning_bet_index = 0;
        game_round.winner = unique_wallets[0]; // Set to the actual player wallet for claim

        let total_refund = game_round.total_pot;
        let winner_wallet = unique_wallets[0];
        msg!(
            "Single player game - attempting automatic refund: {} lamports (from {} bets)",
            total_refund,
            bet_count
        );

        // ⭐ NEW: Attempt automatic refund transfer (similar to select_winner_and_payout)
        // The winner wallet account is passed after all BetEntry PDAs in remaining_accounts
        let mut auto_transfer_success = false;

        if total_refund > 0 {
            // Verify we have the winner wallet account
            require!(
                ctx.remaining_accounts.len() > bet_count,
                Domin8Error::InvalidBetEntry
            );

            let winner_wallet_account = &ctx.remaining_accounts[bet_count];
            require!(
                winner_wallet_account.key() == winner_wallet,
                Domin8Error::Unauthorized
            );

            let vault_lamports = ctx.accounts.vault.lamports();
            require!(
                vault_lamports >= total_refund,
                Domin8Error::InsufficientFunds
            );

            // Use invoke_signed for PDA signing
            let vault_bump = ctx.bumps.vault;
            let signer_seeds: &[&[&[u8]]] = &[&[b"vault", &[vault_bump]]];

            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.vault.key(),
                &winner_wallet,
                total_refund,
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
                        "✓ Automatic refund succeeded: {} lamports to {}",
                        total_refund,
                        winner_wallet
                    );
                }
                Err(e) => {
                    // Transfer failed - store refund for manual claim
                    game_round.winner_prize_unclaimed = total_refund;
                    msg!("⚠️ Automatic refund failed (error: {:?})", e);
                    msg!(
                        "   Player can claim {} lamports manually via claim_winner_prize",
                        total_refund
                    );
                }
            }
        } else {
            game_round.winner_prize_unclaimed = 0;
            auto_transfer_success = true;
        }

        // ⭐ Rotate force field for next game (same logic as select_winner_and_payout)
        let clock = Clock::get()?;
        let mut new_force = [0u8; 32];

        // Use hashv directly with multiple slices (no concat needed)
        use anchor_lang::solana_program::keccak::hashv;
        let hash = hashv(&[
            &game_round.round_id.to_le_bytes(),
            &clock.unix_timestamp.to_le_bytes(),
            &clock.slot.to_le_bytes(),
            &config.force,
        ]);
        new_force.copy_from_slice(&hash.0);
        config.force = new_force;

        msg!("New VRF force for next game: {:?}", &new_force[0..16]);

        // ⭐ IMPORTANT: Unlock bets immediately for single-bet refunds (no winner selection needed)
        config.bets_locked = false;

        // ⭐ INCREMENT COUNTER FOR NEXT GAME (was missing!)
        let counter = &mut ctx.accounts.counter;
        let new_round_id = counter
            .current_round_id
            .checked_add(1)
            .ok_or(Domin8Error::ArithmeticOverflow)?;
        counter.current_round_id = new_round_id;

        msg!("Single player game - immediate finish{}", if auto_transfer_success { ", refund processed automatically" } else { ", ready for manual refund claim" });
        msg!("Bets unlocked - ready for next round");
        msg!("✓ Counter incremented to {}", new_round_id);
        return Ok(());
    }

    // Validate minimum unique players for competitive games (need at least 2 different wallets)
    require!(unique_player_count >= 2, Domin8Error::InvalidGameStatus);

    // Multi-player game (2+ unique players) - VRF was already requested at game creation
    // Just transition to AwaitingWinnerRandomness status
    // Multiple bets per player allowed - winner selected based on total bet amounts

    // Verify VRF was requested during game creation
    require!(
        game_round.vrf_request_pubkey != Pubkey::default(),
        Domin8Error::InvalidVrfAccount
    );

    // Update game state to AwaitingWinnerRandomness
    game_round.status = GameStatus::AwaitingWinnerRandomness;

    msg!(
        "Game {} now awaiting winner randomness - VRF already requested at game creation",
        game_round.round_id
    );
    msg!("VRF Request: {}", game_round.vrf_request_pubkey);

    // ⭐ Emit game locked event
    emit!(GameLocked {
        round_id: game_round.round_id,
        final_bet_count: game_round.bet_count as u8,
        total_pot: game_round.total_pot,
        vrf_request_pubkey: game_round.vrf_request_pubkey,
    });

    Ok(())
}
