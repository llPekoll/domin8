use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::error::Domin81v1Error;
use crate::state::*;

/// Join an existing 1v1 lobby (called by Player B)
/// 
/// This instruction:
/// 1. Accepts Player B's bet
/// 2. Reads ORAO VRF randomness from the vrf_randomness account
/// 3. Determines winner based on randomness (randomness % 2 == 0 → Player A wins, else Player B wins)
/// 4. Deducts house fee and distributes prize to winner
/// 5. Closes the lobby PDA and refunds rent to the payer
/// 6. Sets lobby status to RESOLVED
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
    let _clock = Clock::get()?; // unused currently

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

    // Read VRF randomness directly from account data
    // ORAO Randomness account structure: first bool (1 byte) is fulfilled flag, then 64 bytes of randomness
    let vrf_randomness_info = &ctx.accounts.vrf_randomness;
    let account_data = vrf_randomness_info.try_borrow_data()?;
    
    // Check if account is large enough (at least 65 bytes: 1 byte fulfilled + 64 bytes randomness)
    require!(account_data.len() >= 65, Domin81v1Error::RandomnessNotReady);
    
    // Read fulfilled flag (first byte)
    let fulfilled = account_data[0] != 0;
    require!(fulfilled, Domin81v1Error::RandomnessNotReady);
    
    // Read randomness (64 bytes starting at offset 1)
    let mut randomness = [0u8; 64];
    randomness.copy_from_slice(&account_data[1..65]);

    // Determine winner based on randomness
    // Use the first 8 bytes of randomness for winner determination
    let randomness_u64 = u64::from_le_bytes([
        randomness[0],
        randomness[1],
        randomness[2],
        randomness[3],
        randomness[4],
        randomness[5],
        randomness[6],
        randomness[7],
    ]);

    let winner = if randomness_u64 % 2 == 0 {
        lobby.player_a
    } else {
        player_b.key()
    };

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

    // Re-borrow lobby mutably now that the transfer and VRF read are done
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

    // ---- VRF Accounts ----
    /// CHECK: ORAO VRF randomness account
    pub vrf_randomness: AccountInfo<'info>,

    /// CHECK: Treasury account
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
