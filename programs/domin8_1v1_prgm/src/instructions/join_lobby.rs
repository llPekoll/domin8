use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::error::Domin81v1Error;
use crate::state::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

/// Join an existing 1v1 lobby (called by Player B)
/// 
/// This instruction follows the Switchboard Randomness pattern:
/// 1. Validates the randomness_account has been revealed (seed_slot is not the current slot)
/// 2. Accepts Player B's bet
/// 3. Calls Switchboard's get_value() to retrieve the revealed random value
/// 4. Determines winner based on randomness (randomness % 2 == 0 → Player A wins, else Player B wins)
/// 5. Deducts house fee and distributes prize to winner
/// 6. Closes the lobby PDA and refunds rent to the payer
/// 7. Sets lobby status to RESOLVED
pub fn handler(
    ctx: Context<JoinLobby>,
    amount: u64,
    skin_b: u8,
    position_b: [u16; 2],
) -> Result<()> {
    require!(amount > 0, Domin81v1Error::InvalidBetAmount);

    let config = &ctx.accounts.config;
    let player_b = &ctx.accounts.player_b;
    let lobby = &ctx.accounts.lobby;
    let clock = Clock::get()?;

    // Verify lobby is in CREATED status (waiting for second player)
    require_eq!(
        lobby.status,
        LOBBY_STATUS_CREATED,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Verify amounts match
    require_eq!(
        amount, lobby.amount,
        Domin81v1Error::InvalidBetAmount
    );

    // Verify Player B hasn't already joined
    require!(lobby.player_b.is_none(), Domin81v1Error::AlreadyJoined);

    // Check Player B has sufficient balance
    require!(
        player_b.lamports() >= amount,
        Domin81v1Error::InsufficientFunds
    );

    // Parse the Switchboard randomness account data
    let randomness_data = RandomnessAccountData::parse(
        ctx.accounts.randomness_account_data.data.borrow()
    ).map_err(|_| Domin81v1Error::RandomnessNotResolved)?;

    // IMPORTANT: Switchboard Randomness pattern requires checking that the seed_slot
    // is not the current slot - this ensures the randomness has been revealed
    if randomness_data.seed_slot == clock.slot {
        return Err(Domin81v1Error::RandomnessAlreadyRevealed.into());
    }

    // Get the revealed random value using Switchboard's get_value() function
    let revealed_random_value = randomness_data.get_value(clock.slot)
        .map_err(|_| Domin81v1Error::RandomnessNotResolved)?;

    // Determine winner based on randomness
    // Use the first byte of randomness for winner determination
    let randomness_u8 = revealed_random_value[0];
    let winner = if randomness_u8 % 2 == 0 {
        lobby.player_a
    } else {
        player_b.key()
    };

    // Transfer SOL from Player B to the lobby PDA
    let transfer_instruction = system_program::Transfer {
        from: player_b.to_account_info(),
        to: lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    system_program::transfer(cpi_context, amount)?;

    // Calculate total pot
    let total_pot = amount.checked_add(lobby.amount)
        .ok_or(Domin81v1Error::DistributionError)?;

    // Calculate house fee
    let house_fee = (total_pot as u128)
        .checked_mul(config.house_fee_bps as u128)
        .ok_or(Domin81v1Error::DistributionError)?
        .checked_div(10000)
        .ok_or(Domin81v1Error::DistributionError)? as u64;

    let prize = total_pot.checked_sub(house_fee)
        .ok_or(Domin81v1Error::DistributionError)?;

    msg!(
        "Lobby {} resolution: Player B={}, Winner={}, Total Pot={}, House Fee={}, Prize={}",
        lobby.lobby_id,
        player_b.key(),
        winner,
        total_pot,
        house_fee,
        prize
    );
    msg!("Player B Skin: {}, Position B: [{}, {}]", skin_b, position_b[0], position_b[1]);
    msg!("Randomness value (first byte): {}", revealed_random_value[0]);

    // Re-borrow lobby mutably now that the transfer and randomness read are done
    let lobby = &mut ctx.accounts.lobby;

    // Update lobby before closing
    lobby.player_b = Some(player_b.key());
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_RESOLVED;
    lobby.skin_b = Some(skin_b);
    lobby.position_b = Some(position_b);
    if house_fee > 0 {
        let treasury_info = &ctx.accounts.treasury;
        **lobby.to_account_info().lamports.borrow_mut() -= house_fee;
        **treasury_info.lamports.borrow_mut() += house_fee;
        msg!("Transferred {} lamports to treasury", house_fee);
    }

    // Transfer prize to winner
    if prize > 0 {
        let winner_info = if winner == lobby.player_a {
            ctx.accounts.player_a.to_account_info()
        } else {
            player_b.to_account_info()
        };

        **lobby.to_account_info().lamports.borrow_mut() -= prize;
        **winner_info.lamports.borrow_mut() += prize;
        msg!("Transferred {} lamports to winner {}", prize, winner);
    }

    msg!("Lobby {} closed, account will be closed by Anchor", lobby.lobby_id);

    Ok(())
}

#[derive(Accounts)]
pub struct JoinLobby<'info> {
    #[account(
        mut,
        seeds = [b"domin8_1v1_config"],
        bump,
    )]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        mut,
        close = payer,
        owner = crate::ID,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    /// CHECK: Player A account, used only for receiving winnings
    #[account(mut)]
    pub player_a: UncheckedAccount<'info>,

    #[account(mut)]
    pub player_b: Signer<'info>,

    // Payer for refunds/rent
    #[account(mut)]
    pub payer: Signer<'info>,

    // ---- Switchboard Randomness Accounts ----
    /// CHECK: Switchboard randomness account - must match the one stored in the lobby
    pub randomness_account_data: AccountInfo<'info>,

    /// CHECK: Treasury account
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
