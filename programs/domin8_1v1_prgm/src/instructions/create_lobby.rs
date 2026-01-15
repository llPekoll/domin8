use crate::*;
use anchor_lang::solana_program::keccak;

/// Create a new 1v1 lobby (called by Player A)
///
/// This instruction follows the ORAO VRF pattern:
/// 1. Player A creates and funds the lobby
/// 2. A force seed is generated for the future VRF request
/// 3. When Player B joins, the VRF request will be made
pub fn handler(
    ctx: Context<CreateLobby>,
    amount: u64,
    skin_a: u8,
    map: u8,
) -> Result<()> {
    require!(amount >= MIN_BET_AMOUNT, Domin81v1Error::BetBelowMinimum);

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

    // Generate force seed for ORAO
    let force = keccak::hashv(&[
        lobby_id.to_le_bytes().as_ref(),
        player_a.key().as_ref(),
        clock.unix_timestamp.to_le_bytes().as_ref()
    ]).0;

    // Initialize the lobby
    lobby.lobby_id = lobby_id;
    lobby.player_a = player_a.key();
    lobby.player_b = None;
    lobby.amount = amount;
    lobby.force = force;
    lobby.status = LOBBY_STATUS_OPEN;
    lobby.winner = None;
    lobby.created_at = clock.unix_timestamp;
    lobby.skin_a = skin_a;
    lobby.skin_b = None;
    lobby.map = map;
    lobby.randomness = None;

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
    msg!("Skin A: {}, Map: {}", skin_a, map);
    msg!("Force Seed: {:?}", force);

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, skin_a: u8, map: u8)]
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

    pub system_program: Program<'info, System>,
}
