use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;
use orao_solana_vrf::{
    cpi::accounts::RequestV2,
    program::OraoVrf,
    state::NetworkState,
    CONFIG_ACCOUNT_SEED,
    RANDOMNESS_ACCOUNT_SEED,
    ID as ORAO_VRF_ID,
};

/// Create a new 1v1 lobby (called by Player A)
pub fn handler(
    ctx: Context<CreateLobby>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, Domin81v1Error::InvalidBetAmount);

    let config = &mut ctx.accounts.config;
    let lobby = &mut ctx.accounts.lobby;
    let player_a = &ctx.accounts.player_a;
    let clock = Clock::get()?;

    // Check user has sufficient balance
    require!(
        player_a.lamports() >= amount,
        Domin81v1Error::InsufficientFunds
    );

    // Generate VRF force from lobby_id using hash
    // vrf_force = hash(b"1v1_lobby_vrf" || lobby_id.to_le_bytes())
    let lobby_id = config.lobby_count;
    let mut hasher = anchor_lang::solana_program::hash::Hasher::default();
    hasher.hash(b"1v1_lobby_vrf");
    hasher.hash(&lobby_id.to_le_bytes());
    let vrf_force = hasher.result().to_bytes();

    // Request VRF randomness
    let vrf_cpi = CpiContext::new(
        ctx.accounts.vrf_program.to_account_info(),
        RequestV2 {
            payer: player_a.to_account_info(),
            network_state: ctx.accounts.vrf_config.to_account_info(),
            treasury: ctx.accounts.vrf_treasury.to_account_info(),
            request: ctx.accounts.vrf_randomness.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    );
    orao_solana_vrf::cpi::request_v2(vrf_cpi, vrf_force)?;

    // Initialize the lobby
    lobby.lobby_id = lobby_id;
    lobby.player_a = player_a.key();
    lobby.player_b = None;
    lobby.amount = amount;
    lobby.vrf_force = vrf_force;
    lobby.status = LOBBY_STATUS_CREATED;
    lobby.winner = None;
    lobby.bump = ctx.bumps.lobby;
    lobby.created_at = clock.unix_timestamp;

    // Transfer SOL from Player A to the lobby PDA
    let transfer_instruction = anchor_lang::system_program::Transfer {
        from: player_a.to_account_info(),
        to: ctx.accounts.lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    anchor_lang::system_program::transfer(cpi_context, amount)?;

    // Increment lobby counter
    config.lobby_count += 1;

    msg!(
        "Lobby {} created by Player A: {}",
        lobby_id,
        player_a.key()
    );
    msg!("Bet amount: {} lamports", amount);
    msg!("VRF force (hex): {}", format_vrf_force(&vrf_force));

    Ok(())
}

fn format_vrf_force(force: &[u8; 32]) -> String {
    force
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join("")
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct CreateLobby<'info> {
    #[account(
        mut,
        seeds = [b"domin8_1v1_config"],
        bump,
    )]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        init,
        space = Domin81v1Lobby::SPACE,
        payer = player_a,
        seeds = [
            b"domin8_1v1_lobby",
            config.lobby_count.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    #[account(mut)]
    pub player_a: Signer<'info>,

    // ---- VRF Accounts ----
    /// CHECK: ORAO VRF randomness account
    #[account(mut)]
    pub vrf_randomness: AccountInfo<'info>,

    /// CHECK: ORAO treasury
    #[account(mut)]
    pub vrf_treasury: AccountInfo<'info>,

    #[account(
        seeds = [CONFIG_ACCOUNT_SEED],
        bump,
        seeds::program = ORAO_VRF_ID
    )]
    pub vrf_config: Account<'info, NetworkState>,

    pub vrf_program: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}
