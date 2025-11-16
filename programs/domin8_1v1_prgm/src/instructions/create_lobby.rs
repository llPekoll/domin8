use crate::*;
use anchor_lang::prelude::*;
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
    skin_a: u8,
    position_a: [u16; 2],
    map: u8,
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

    // Get the current lobby ID from config
    let lobby_id = config.lobby_count;

    // Generate unique force for this lobby by combining config force with lobby ID
    // This MUST match the computation in the accounts macro
    let mut unique_force = config.force;
    for i in 0..8 {
        unique_force[i] ^= ((lobby_id >> (i * 8)) & 0xFF) as u8;
    }

    // Request VRF randomness with the unique force
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
    orao_solana_vrf::cpi::request_v2(vrf_cpi, unique_force)?;

    // Initialize the lobby
    lobby.lobby_id = lobby_id;
    lobby.player_a = player_a.key();
    lobby.player_b = None;
    lobby.amount = amount;
    lobby.vrf_force = unique_force;  // Store the unique force
    lobby.status = LOBBY_STATUS_CREATED;
    lobby.winner = None;
    lobby.created_at = clock.unix_timestamp;
    lobby.skin_a = skin_a;
    lobby.skin_b = None;
    lobby.position_a = position_a;
    lobby.position_b = None;
    lobby.map = map;

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
    msg!("Skin A: {}, Position A: [{}, {}], Map: {}", skin_a, position_a[0], position_a[1], map);
    msg!("VRF force (hex): {}", Utils::bytes_to_hex(&unique_force));

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, skin_a: u8, position_a: [u16; 2], map: u8)]
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

    // ---- VRF accounts ----

    /// CHECK: Orao randomness account - derived with unique force per lobby
    /// We compute unique force from config.force XORed with config.lobby_count
    /// This MUST match the same computation in the handler
    #[account(
        mut,
        seeds = [RANDOMNESS_ACCOUNT_SEED, &CreateLobby::compute_unique_force_seed(&config.force, config.lobby_count)],
        bump,
        seeds::program = ORAO_VRF_ID
    )]
    pub vrf_randomness: AccountInfo<'info>,

    /// CHECK: Orao treasury (devnet/mainnet address), used by VRF CPI
    #[account(mut)]
    pub vrf_treasury: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [CONFIG_ACCOUNT_SEED],
        bump,
        seeds::program = ORAO_VRF_ID
    )]
    pub vrf_config: Account<'info, NetworkState>,

    pub vrf_program: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateLobby<'info> {
    /// Compute unique force by XORing base force with lobby ID
    /// Returns the unique force as a byte array suitable for use as a seed
    fn compute_unique_force_seed(base_force: &[u8; 32], lobby_id: u64) -> [u8; 32] {
        let mut unique_force = *base_force;
        for i in 0..8 {
            unique_force[i] ^= ((lobby_id >> (i * 8)) & 0xFF) as u8;
        }
        unique_force
    }
}
