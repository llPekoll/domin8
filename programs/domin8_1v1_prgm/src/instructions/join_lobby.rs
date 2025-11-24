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

    /// CHECK: Player A account is needed here to add to the callback metas
    /// because the callback (settle_lobby) needs to pay them if they win.
    #[account(mut, address = lobby.player_a)]
    pub player_a: SystemAccount<'info>,

    /// CHECK: The oracle queue for MagicBlock (replaces ORAO accounts)
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<JoinLobby>,
    amount: u64,
    skin_b: u8,
    position_b: [u16; 2],
) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    
    require!(amount > 0, Domin81v1Error::InvalidBetAmount);

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
        ctx.accounts.player_b.lamports() >= amount,
        Domin81v1Error::InsufficientFunds
    );

    // Transfer SOL from Player B to the lobby PDA
    let transfer_instruction = system_program::Transfer {
        from: ctx.accounts.player_b.to_account_info(),
        to: lobby.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    system_program::transfer(cpi_context, amount)?;

    // 3. Prepare Account Metas for the Callback
    // The settle_lobby instruction will need these accounts to execute.
    // Order is important! It must match the accounts expected by SettleLobby (excluding the VRF signer).
    let accounts_metas = vec![
        SerializableAccountMeta { pubkey: ctx.accounts.config.key(), is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: ctx.accounts.lobby.key(), is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: ctx.accounts.player_a.key(), is_signer: false, is_writable: true }, // Player A
        SerializableAccountMeta { pubkey: ctx.accounts.player_b.key(), is_signer: false, is_writable: true }, // Player B
        SerializableAccountMeta { pubkey: ctx.accounts.config.treasury, is_signer: false, is_writable: true }, // Treasury (read from config)
        SerializableAccountMeta { pubkey: ctx.accounts.system_program.key(), is_signer: false, is_writable: false },
    ];

    // 4. Request Randomness
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.player_b.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        // This discriminator must match the settle_lobby instruction
        callback_discriminator: crate::instruction::SettleLobby::DISCRIMINATOR.to_vec(), 
        caller_seed: lobby.force, // Reuse the existing unique seed mechanism
        accounts_metas: Some(accounts_metas),
        ..Default::default()
    });

    // Send the CPI
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.player_b.to_account_info(), &ix)?;

    // Update State
    lobby.player_b = Some(ctx.accounts.player_b.key());
    lobby.skin_b = Some(skin_b);
    lobby.position_b = Some(position_b);
    lobby.status = LOBBY_STATUS_AWAITING_VRF;

    msg!("Randomness requested for Lobby {}. Waiting for callback...", lobby.lobby_id);

    Ok(())
}
