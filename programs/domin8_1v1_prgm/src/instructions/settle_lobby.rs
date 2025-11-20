use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;
use orao_solana_vrf::state::Randomness;

/// Settle a 1v1 lobby (called by anyone after VRF fulfillment)
/// 
/// This instruction:
/// 1. Verifies ORAO has fulfilled the randomness request
/// 2. Determines the winner
/// 3. Distributes funds
/// 4. Closes the lobby account
pub fn handler(ctx: Context<SettleLobby>) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    let config = &ctx.accounts.config;
    
    // Manually deserialize randomness account to avoid discriminator mismatch
    let randomness_account_info = &ctx.accounts.randomness_account;
    let data = randomness_account_info.try_borrow_data()?;
    
    if data.len() < 8 {
        return Err(Domin81v1Error::RandomnessAccountParseError.into());
    }

    // Skip 8-byte discriminator and deserialize
    let mut randomness_data = &data[8..];
    let randomness: Randomness = AnchorDeserialize::deserialize(&mut randomness_data)
        .map_err(|_| Domin81v1Error::RandomnessAccountParseError)?;

    // Verify lobby is in AWAITING_VRF status
    require_eq!(
        lobby.status,
        LOBBY_STATUS_AWAITING_VRF,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Verify randomness seed matches lobby force
    require!(
        randomness.seed == lobby.force,
        Domin81v1Error::InvalidRandomnessSeed
    );

    // Check randomness fulfillment
    // fulfilled() returns Option<[u8; 64]>
    let randomness_value = randomness.fulfilled().ok_or(Domin81v1Error::RandomnessNotResolved)?;

    // Determine winner
    // We use the first byte of the randomness. Even = Player A, Odd = Player B
    let winner_is_player_a = randomness_value[0] % 2 == 0;
    
    let winner = if winner_is_player_a {
        lobby.player_a
    } else {
        lobby.player_b.unwrap()
    };

    // Calculate payouts
    // Total pot is 2 * amount
    let total_pot = lobby.amount.checked_mul(2).ok_or(Domin81v1Error::DistributionError)?;
    
    // Calculate house fee
    let house_fee = (total_pot as u128)
        .checked_mul(config.house_fee_bps as u128)
        .ok_or(Domin81v1Error::DistributionError)?
        .checked_div(10000)
        .ok_or(Domin81v1Error::DistributionError)? as u64;

    let prize = total_pot.checked_sub(house_fee).ok_or(Domin81v1Error::DistributionError)?;

    // Distribute funds
    // Transfer house fee to treasury
    if house_fee > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= house_fee;
        **ctx.accounts.treasury.lamports.borrow_mut() += house_fee;
    }

    // Transfer prize to winner
    if prize > 0 {
        let winner_account = if winner == lobby.player_a {
            &ctx.accounts.player_a
        } else {
            &ctx.accounts.player_b
        };
        **lobby.to_account_info().lamports.borrow_mut() -= prize;
        **winner_account.lamports.borrow_mut() += prize;
    }

    // Update state (even though we close it, it's good practice or if we decide not to close)
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_RESOLVED;

    msg!("Lobby {} settled. Winner: {}", lobby.lobby_id, winner);
    msg!("Randomness: {:?}", &randomness_value[0..8]); // Log first 8 bytes

    Ok(())
}

#[derive(Accounts)]
pub struct SettleLobby<'info> {
    #[account(
        mut,
        seeds = [b"domin8_1v1_config"],
        bump,
    )]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        mut,
        seeds = [
            b"domin8_1v1_lobby",
            lobby.lobby_id.to_le_bytes().as_ref(),
        ],
        bump,
        close = player_a // Refund rent to Player A (creator)
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    /// CHECK: ORAO Randomness account
    /// We verify the seed matches the lobby's force seed manually in handler
    pub randomness_account: UncheckedAccount<'info>,

    /// CHECK: Player A (Winner or Loser)
    #[account(mut, address = lobby.player_a)]
    pub player_a: UncheckedAccount<'info>,

    /// CHECK: Player B (Winner or Loser)
    #[account(mut, address = lobby.player_b.unwrap())]
    pub player_b: UncheckedAccount<'info>,

    /// CHECK: Treasury
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
}
