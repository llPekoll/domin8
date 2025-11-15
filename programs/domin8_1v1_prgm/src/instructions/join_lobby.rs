use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::error::Domin81v1Error;
use crate::state::*;
use orao_solana_vrf::state::Randomness;

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
) -> Result<()> {
    require!(amount > 0, Domin81v1Error::InvalidBetAmount);

    let config = &ctx.accounts.config;
    let lobby = &mut ctx.accounts.lobby;
    let player_b = &ctx.accounts.player_b;
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

    // Transfer SOL from Player B to the lobby PDA
    let transfer_instruction = system_program::Transfer {
        from: player_b.to_account_info(),
        to: ctx.accounts.lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    system_program::transfer(cpi_context, amount)?;

    // Read VRF randomness
    let vrf_randomness: Account<Randomness> = ctx.accounts.vrf_randomness.try_into()?;

    // Verify randomness is fulfilled
    require!(
        vrf_randomness.fulfilled,
        Domin81v1Error::RandomnessNotReady
    );

    // Determine winner based on randomness
    // Use the first 8 bytes of randomness for winner determination
    let randomness_bytes = &vrf_randomness.randomness;
    let randomness_u64 = u64::from_le_bytes([
        randomness_bytes[0],
        randomness_bytes[1],
        randomness_bytes[2],
        randomness_bytes[3],
        randomness_bytes[4],
        randomness_bytes[5],
        randomness_bytes[6],
        randomness_bytes[7],
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

    // Update lobby before closing
    lobby.player_b = Some(player_b.key());
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_RESOLVED;

    // Transfer house fee to treasury
    if house_fee > 0 {
        let treasury_info = &ctx.accounts.treasury;
        **lobby.to_account_info_mut().lamports.borrow_mut() -= house_fee;
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

        **lobby.to_account_info_mut().lamports.borrow_mut() -= prize;
        **winner_info.lamports.borrow_mut() += prize;
        msg!("Transferred {} lamports to winner {}", prize, winner);
    }

    // Close the lobby PDA by transferring remaining lamports (rent) to payer
    let remaining_lamports = lobby.to_account_info().lamports();
    if remaining_lamports > 0 {
        **lobby.to_account_info_mut().lamports.borrow_mut() = 0;
        **ctx.accounts.payer.lamports.borrow_mut() += remaining_lamports;
        msg!("Refunded {} lamports (rent) to payer", remaining_lamports);
    }

    // Mark lobby as closed (already done by setting status above)
    // The PDA will be closed automatically by the runtime due to zero lamports

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
        owner = crate::ID,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

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
