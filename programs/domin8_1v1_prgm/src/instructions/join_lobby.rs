use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::error::Domin81v1Error;
use crate::state::*;

// 1. Add MagicBlock Imports
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

// 2. Add the #[vrf] macro to the context
#[vrf]
#[derive(Accounts)]
#[instruction(amount: u64, skin_b: u8)]
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

    /// CHECK: The oracle queue for MagicBlock (replaces ORAO accounts)
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<JoinLobby>,
    amount: u64,
    skin_b: u8,
) -> Result<()> {
    require!(amount >= MIN_BET_AMOUNT, Domin81v1Error::BetBelowMinimum);

    // Collect all necessary data before taking mutable borrow
    let lobby_status = ctx.accounts.lobby.status;
    let lobby_amount = ctx.accounts.lobby.amount;
    let lobby_player_b = ctx.accounts.lobby.player_b;
    let lobby_force = ctx.accounts.lobby.force;
    let lobby_id = ctx.accounts.lobby.lobby_id;
    let player_b_key = ctx.accounts.player_b.key();
    let oracle_queue_key = ctx.accounts.oracle_queue.key();

    // Verify lobby is in CREATED status (waiting for second player)
    require_eq!(
        lobby_status,
        LOBBY_STATUS_OPEN,
        Domin81v1Error::InvalidLobbyStatus
    );

    // Verify amounts match
    require_eq!(
        amount, lobby_amount,
        Domin81v1Error::InvalidBetAmount
    );

    // Verify Player B hasn't already joined
    require!(lobby_player_b.is_none(), Domin81v1Error::AlreadyJoined);

    // Prevent self-play: Player A cannot join their own lobby
    require!(
        ctx.accounts.lobby.player_a != player_b_key,
        Domin81v1Error::SelfPlayNotAllowed
    );

    // Check Player B has sufficient balance
    require!(
        ctx.accounts.player_b.lamports() >= amount,
        Domin81v1Error::InsufficientFunds
    );

    // Transfer SOL from Player B to the lobby PDA
    let transfer_instruction = system_program::Transfer {
        from: ctx.accounts.player_b.to_account_info(),
        to: ctx.accounts.lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    system_program::transfer(cpi_context, amount)?;

    // 3. Prepare Account Metas for the Callback
    // IMPORTANT: MagicBlock VRF has MAX_ACCOUNTS = 5 limit
    // We only pass the lobby account - the vrf_callback will only store randomness
    // Settlement with fund distribution happens in a separate instruction
    let accounts_metas = vec![
        SerializableAccountMeta { pubkey: ctx.accounts.lobby.key(), is_signer: false, is_writable: true },
    ];

    // 4. Request Randomness
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: player_b_key,
        oracle_queue: oracle_queue_key,
        callback_program_id: crate::ID,
        // This discriminator must match the vrf_callback instruction
        callback_discriminator: crate::instruction::VrfCallback::DISCRIMINATOR.to_vec(), 
        caller_seed: lobby_force, // Reuse the existing unique seed mechanism
        accounts_metas: Some(accounts_metas.clone()),
        ..Default::default()
    });

    msg!("VRF Request Parameters: payer={}, oracle_queue={}, callback_program={}, caller_seed={:?}", 
         player_b_key, oracle_queue_key, crate::ID, lobby_force);
    msg!("Callback discriminator: {:?}", crate::instruction::VrfCallback::DISCRIMINATOR);
    msg!("Accounts metas count: {}", accounts_metas.len());
    
    // Send the CPI
    msg!("Invoking VRF program...");
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.player_b.to_account_info(), &ix)?;
    msg!("VRF invocation successful!");

    // Update State
    let lobby = &mut ctx.accounts.lobby;
    lobby.player_b = Some(player_b_key);
    lobby.skin_b = Some(skin_b);
    lobby.status = LOBBY_STATUS_AWAITING_VRF;

    msg!("Randomness requested for Lobby {}. Waiting for callback...", lobby_id);

    Ok(())
}
