use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

/// Settle a lobby after VRF randomness has been received
/// This instruction can be called by anyone once VRF callback has executed
#[derive(Accounts)]
pub struct SettleLobby<'info> {
    #[account(mut)]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        mut,
        seeds = [b"domin8_1v1_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    /// CHECK: Player A (Winner or Loser) - Must match lobby state
    #[account(mut, address = lobby.player_a)]
    pub player_a: AccountInfo<'info>,

    /// CHECK: Player B (Winner or Loser) - Must match lobby state
    #[account(mut, address = lobby.player_b.unwrap())]
    pub player_b: AccountInfo<'info>,

    /// CHECK: Treasury to receive house fee
    #[account(mut, address = config.treasury)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Settle lobby handler - distributes funds based on stored randomness
pub fn handler(ctx: Context<SettleLobby>) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    let config = &ctx.accounts.config;

    msg!("Settling Lobby {}", lobby.lobby_id);

    // Safety check: Ensure lobby has received VRF randomness
    require_eq!(
        lobby.status,
        LOBBY_STATUS_VRF_RECEIVED,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Get the stored randomness
    let randomness = lobby.randomness.ok_or(Domin81v1Error::RandomnessNotAvailable)?;

    // Determine winner using randomness
    // Even number = Player A wins, Odd = Player B wins
    let random_val = randomness[0]; 
    let winner_is_player_a = random_val % 2 == 0;

    let winner = if winner_is_player_a {
        lobby.player_a
    } else {
        lobby.player_b.unwrap()
    };

    // Calculate Payouts
    let total_pot = lobby.amount.checked_mul(2).ok_or(Domin81v1Error::DistributionError)?;
    
    let house_fee = (total_pot as u128)
        .checked_mul(config.house_fee_bps as u128)
        .ok_or(Domin81v1Error::DistributionError)?
        .checked_div(10000)
        .ok_or(Domin81v1Error::DistributionError)? as u64;

    let prize = total_pot.checked_sub(house_fee).ok_or(Domin81v1Error::DistributionError)?;

    // Distribute Funds
    // Note: The Lobby PDA is writable and owned by the program, so we can deduct lamports directly.
    
    // Pay House Fee
    if house_fee > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= house_fee;
        **ctx.accounts.treasury.lamports.borrow_mut() += house_fee;
    }

    // Pay Winner
    if prize > 0 {
        let winner_account = if winner == lobby.player_a {
            &ctx.accounts.player_a
        } else {
            &ctx.accounts.player_b
        };
        **lobby.to_account_info().lamports.borrow_mut() -= prize;
        **winner_account.lamports.borrow_mut() += prize;
    }

    // Update State
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_RESOLVED;

    msg!("Winner determined: {}. Prize: {}", winner, prize);

    Ok(())
}
