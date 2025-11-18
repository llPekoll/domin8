use crate::*;
use anchor_lang::prelude::*;
use switchboard_on_demand::accounts::RandomnessAccountData;

/// Create a new 1v1 lobby (called by Player A)
/// 
/// This instruction follows the Switchboard Randomness pattern:
/// 1. Player A creates and funds the lobby
/// 2. A randomness account is passed in (caller must prepare this separately)
/// 3. The randomness_account is stored in the lobby state
/// 4. When Player B joins, the randomness will be revealed and used to determine winner
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

    // Initialize the lobby
    lobby.lobby_id = lobby_id;
    lobby.player_a = player_a.key();
    lobby.player_b = None;
    lobby.amount = amount;
    lobby.randomness_account = ctx.accounts.randomness_account.key();
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
    msg!("Randomness Account: {}", ctx.accounts.randomness_account.key());

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

    /// CHECK: Switchboard randomness account for this game
    /// The caller (frontend) is responsible for creating this account
    /// and passing the correct randomness account here
    pub randomness_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
