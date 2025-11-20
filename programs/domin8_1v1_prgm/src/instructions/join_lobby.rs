use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::error::Domin81v1Error;
use crate::state::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::cpi::accounts::RequestV2;
use orao_solana_vrf::state::NetworkState;

/// Join an existing 1v1 lobby (called by Player B)
/// 
/// This instruction follows the ORAO VRF pattern:
/// 1. Validates lobby status
/// 2. Accepts Player B's bet
/// 3. Requests randomness from ORAO VRF using the pre-generated force seed
/// 4. Sets lobby status to AWAITING_VRF
pub fn handler(
    ctx: Context<JoinLobby>,
    amount: u64,
    skin_b: u8,
    position_b: [u16; 2],
) -> Result<()> {
    require!(amount > 0, Domin81v1Error::InvalidBetAmount);

    let lobby = &mut ctx.accounts.lobby;
    let player_b = &ctx.accounts.player_b;

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

    // Request Randomness from ORAO
    let cpi_program = ctx.accounts.vrf.to_account_info();
    let cpi_accounts = RequestV2 {
        payer: ctx.accounts.player_b.to_account_info(),
        network_state: ctx.accounts.config_account.to_account_info(),
        treasury: ctx.accounts.treasury.to_account_info(),
        request: ctx.accounts.randomness_account.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    orao_solana_vrf::cpi::request_v2(cpi_ctx, lobby.force)?;

    // Update Lobby State
    lobby.player_b = Some(player_b.key());
    lobby.skin_b = Some(skin_b);
    lobby.position_b = Some(position_b);
    lobby.status = LOBBY_STATUS_AWAITING_VRF;

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

    msg!(
        "Lobby {} joined by Player B: {}",
        lobby.lobby_id,
        player_b.key()
    );
    msg!("Status updated to AWAITING_VRF (2)");
    msg!("Randomness requested with force seed: {:?}", lobby.force);

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, skin_b: u8, position_b: [u16; 2])]
pub struct JoinLobby<'info> {
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
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    #[account(mut)]
    pub player_b: Signer<'info>,

    /// CHECK: ORAO VRF Program
    pub vrf: Program<'info, OraoVrf>,

    /// CHECK: ORAO Network State
    #[account(mut)]
    pub config_account: Account<'info, NetworkState>,

    /// CHECK: ORAO Treasury
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Randomness account to be created (PDA derived from seed)
    #[account(mut)]
    pub randomness_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
