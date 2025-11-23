I apologize for the inconvenience. Here is the complete content of the migration guide directly in the chat so you can copy it easily.

-----

# Migration Guide: ORAO VRF to MagicBlock Ephemeral VRF

This document outlines the step-by-step process to migrate the `domin8_1v1_prgm` Anchor program from ORAO VRF to MagicBlock Ephemeral VRF.

## Overview of Changes

The primary architectural shift is moving from a **Poll/Verify** model to a **Callback** model.

  * **Old Flow (ORAO):**

    1.  `join_lobby`: Requests randomness.
    2.  `settle_lobby`: Manually called by a user/bot. It checks if ORAO has fulfilled the request in a separate account, then settles the game.

  * **New Flow (MagicBlock):**

    1.  `join_lobby`: Requests randomness and specifies `settle_lobby` as the callback.
    2.  `settle_lobby`: **Automatically called** by the MagicBlock VRF program once randomness is generated. It receives the randomness directly as an argument.

-----

## Step 1: Update Dependencies

Remove the ORAO dependency and add the MagicBlock Ephemeral VRF SDK in your `Cargo.toml`.

**File:** `domin8_1v1_prgm/Cargo.toml`

```toml
[dependencies]
anchor-lang = "0.31.1"
# Remove this:
# orao-solana-vrf = { version = "0.6.1", default-features = false, features = ["cpi"] } 
# Add this:
ephemeral-vrf-sdk = { version = "0.1.2", features = ["anchor"] }
rust_decimal = "1.33"
```

-----

## Step 2: Update State Management

In the MagicBlock flow, the `settle_lobby` instruction is called *by the VRF network*, not by a user. Therefore, the lobby account must be writable during this callback.

**File:** `domin8_1v1_prgm/src/state.rs`

You can clean up the `Domin81v1Lobby` struct. You technically no longer need to store the `force` seed for verification purposes, but you can keep it if you use it as the `caller_seed` for the VRF request.

The status constants can remain the same.

```rust
// src/state.rs

// ... imports

// Status constants can remain
pub const LOBBY_STATUS_CREATED: u8 = 0;
pub const LOBBY_STATUS_AWAITING_VRF: u8 = 1;
pub const LOBBY_STATUS_RESOLVED: u8 = 2;

// ... Domin81v1Config ...

#[account]
pub struct Domin81v1Lobby {
    // ... existing fields ...
    pub force: [u8; 32], // Keep this to use as the unique caller_seed
    // ... existing fields ...
}
```

-----

## Step 3: Requesting Randomness (`join_lobby`)

This instruction needs the most significant changes. You will replace the ORAO CPI call with the MagicBlock `request_randomness` instruction.

**File:** `domin8_1v1_prgm/src/instructions/join_lobby.rs`

1.  **Imports**: Add `ephemeral_vrf_sdk` imports.
2.  **Context**: Add the `#[vrf]` macro and the `oracle_queue` account.
3.  **Logic**: Construct the callback metadata and send the request.

<!-- end list -->

```rust
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
    
    // ... [Keep existing validation logic: status checks, amounts, etc.] ...

    // ... [Keep existing transfer logic: Player B -> Lobby] ...

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
```

-----

## Step 4: Consuming Randomness (`settle_lobby`)

This instruction transforms from a user-called instruction into a **program-called callback**.

**File:** `domin8_1v1_prgm/src/instructions/settle_lobby.rs`

1.  **Signature**: Add `randomness: [u8; 32]` to the handler arguments.
2.  **Security**: Ensure `vrf_program_identity` is a signer.
3.  **Logic**: Use the randomness directly (no account deserialization needed).

<!-- end list -->

```rust
use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;
use crate::state::*;

// MagicBlock ID used for security check
use ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY;

// 1. Update Accounts Struct
#[derive(Accounts)]
pub struct SettleLobby<'info> {
    /// CHECK: This ensures the instruction is called by the MagicBlock VRF program
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, Domin81v1Config>,

    #[account(
        mut,
        seeds = [b"domin8_1v1_lobby", lobby.lobby_id.to_le_bytes().as_ref()],
        bump,
        // Optional: Close the account to refund rent to the creator (Player A)
        // close = player_a 
    )]
    pub lobby: Account<'info, Domin81v1Lobby>,

    /// CHECK: Player A (Winner or Loser) - Must match lobby state
    #[account(mut, address = lobby.player_a)]
    pub player_a: AccountInfo<'info>,

    /// CHECK: Player B (Winner or Loser) - Must match lobby state
    #[account(mut, address = lobby.player_b.unwrap())]
    pub player_b: AccountInfo<'info>,

    /// CHECK: Treasury to receive house fee
    #[account(mut, address = config.treasury)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// 2. Update Handler Signature
pub fn handler(ctx: Context<SettleLobby>, randomness: [u8; 32]) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    let config = &ctx.accounts.config;

    msg!("VRF Callback triggered for Lobby {}", lobby.lobby_id);

    // Safety check: Ensure lobby is actually waiting for VRF
    require_eq!(
        lobby.status,
        LOBBY_STATUS_AWAITING_VRF,
        Domin81v1Error::InvalidLobbyStatus
    );

    // 3. Use Randomness directly
    // Example: Even number = Player A wins, Odd = Player B wins
    let random_val = randomness[0]; 
    let winner_is_player_a = random_val % 2 == 0;

    let winner = if winner_is_player_a {
        lobby.player_a
    } else {
        // Unwrapping is safe here because we checked logic above/in accounts
        lobby.player_b.unwrap()
    };

    // 4. Calculate Payouts
    let total_pot = lobby.amount.checked_mul(2).ok_or(Domin81v1Error::DistributionError)?;
    
    let house_fee = (total_pot as u128)
        .checked_mul(config.house_fee_bps as u128)
        .ok_or(Domin81v1Error::DistributionError)?
        .checked_div(10000)
        .ok_or(Domin81v1Error::DistributionError)? as u64;

    let prize = total_pot.checked_sub(house_fee).ok_or(Domin81v1Error::DistributionError)?;

    // 5. Distribute Funds
    // Note: The Lobby PDA is writable and owned by the program, so we can deduct lamports directly.
    
    // Pay House Fee
    if house_fee > 0 {
        **lobby.to_account_info().lamports.borrow_mut() -= house_fee;
        **ctx.accounts.treasury.lamports.borrow_mut() += house_fee;
    }

    // Pay Winner
    if prize > 0 {
        let winner_account = if winner == lobby.player_a {
            &ctx.accounts.player_a
        } else {
            &ctx.accounts.player_b
        };
        **lobby.to_account_info().lamports.borrow_mut() -= prize;
        **winner_account.lamports.borrow_mut() += prize;
    }

    // 6. Update State
    lobby.winner = Some(winner);
    lobby.status = LOBBY_STATUS_RESOLVED;

    msg!("Winner determined: {}. Prize: {}", winner, prize);

    Ok(())
}
```

-----

## Step 5: Update Entrypoint (`lib.rs`)

You must update the `settle_lobby` instruction definition in the main module to accept the `randomness` argument.

**File:** `domin8_1v1_prgm/src/lib.rs`

```rust
use anchor_lang::prelude::*;

mod error;
mod state;
mod instructions;
mod utils;

pub use error::*;
pub use state::*;
pub use instructions::*;
pub use utils::*;

declare_id!("BfxF6nhu5hgerSHmyedJegPqexK2M7VVykiSGgoT2T7v");

#[program]
pub mod domin8_1v1_prgm {
    use super::*;

    // ... [initialize_config, create_lobby, cancel_lobby remain unchanged] ...

    pub fn join_lobby(
        ctx: Context<JoinLobby>,
        amount: u64,
        skin_b: u8,
        position_b: [u16; 2],
    ) -> Result<()> {
        instructions::join_lobby::handler(ctx, amount, skin_b, position_b)
    }

    // UPDATE THIS:
    pub fn settle_lobby(
        ctx: Context<SettleLobby>,
        randomness: [u8; 32], // Add this argument
    ) -> Result<()> {
        instructions::settle_lobby::handler(ctx, randomness)
    }
}
```

-----

## Step 6: Cleanup (`error.rs`)

You can remove the ORAO specific errors to keep your code clean.

**File:** `domin8_1v1_prgm/src/error.rs`

```rust
#[error_code]
pub enum Domin81v1Error {
    // ... keep generic errors ...

    // REMOVE these:
    // RandomnessNotResolved,
    // RandomnessAlreadyRevealed,
    // InvalidRandomnessAccountOwner,
    // RandomnessAccountParseError,
    // InvalidRandomnessSeed,
}
```

## Summary of Client-Side Changes

On your frontend (TypeScript) or convex backend (lobbies.ts), the flow will change slightly:

1.  **Call `join_lobby`**: This transaction will now initiate the randomness request.
2.  **Do NOT call `settle_lobby`**: Your convex should no longer attempt to send the `settle_lobby` transaction.
3.  **Listen for Result**: Instead of polling for ORAO fulfillment, subscribe to the `Domin81v1Lobby` account. When `status` changes to `2` (RESOLVED) or `winner` is set, the MagicBlock network has successfully called your `settle_lobby` instruction.