Overview
switchboard-on-demand provides Rust developers with an efficient and easy-to-use client for integrating Solana-based oracles from Switchboard into their applications. This library empowers developers to leverage decentralized, trustless, and highly reliable oracle data for various applications, particularly in the DeFi and Web3 spaces.

Features
On-Demand Oracle Data: Fetch real-time, accurate, and tamper-proof data for blockchain applications.
Custom Oracle Creation: Design and deploy your own oracles tailored to your specific data needs.
High Fidelity Financial Data: Ideal for applications requiring precise and dependable financial data.
Privacy-Focused: Operates within confidential runtimes to ensure data integrity and security.
Getting Started
Prerequisites
Ensure you have the following installed:

Rust (latest stable version)
Cargo
Solana CLI tools (if interacting directly with the Solana blockchain)
Installation
Add switchboard-on-demand to your Cargo.toml:

[dependencies]
switchboard-on-demand = "0.8.0"
Using on chain
use switchboard_on_demand::PullFeedAccountData;
use rust_decimal::Decimal;
use solana_program::sysvar::clock::Clock;

pub fn solana_ix<'a>(mut ctx: Context<YourAccounts<'a>>, params: Params) -> Result<()> {
    // Parse the oracle feed account data
    let feed = PullFeedAccountData::parse(ctx.accounts.sb_feed)?;

    // Configure staleness and accuracy requirements
    let max_stale_slots = 100; // Maximum slots before data is considered stale
    let min_samples = 5; // Minimum oracle samples required for accuracy

    // Get the verified oracle price with enhanced error handling
    let price: Decimal = feed.get_value(&Clock::get()?, max_stale_slots, min_samples, true)?;

    msg!("Oracle Price: {}", price);

    Ok(())
}
Oracle Quote Verification
The library includes advanced oracle quote verification functionality through the QuoteVerifier struct. This allows for cryptographically verified data from multiple oracles:

use switchboard_on_demand::prelude::*;

// Configure the verifier with required accounts
let mut verifier = QuoteVerifier::new();
verifier
    .queue(&queue_account)
    .slothash_sysvar(&slothash_sysvar)
    .ix_sysvar(&instructions_sysvar)
    .clock_slot(clock_slot)
    .max_age(150);

// Verify the oracle quote from instruction at index 0
let quote = verifier.verify_instruction_at(0)?;

// Access verified feed data
for feed in quote.feeds() {
    let feed_id = feed.feed_id();
    let value = feed.value();

    msg!("Feed {}: {}", feed.hex_id(), value);
}
Quote Program Integration
The library now includes support for the dedicated quote program for oracle-managed updates:

use switchboard_on_demand::{QUOTE_PROGRAM_ID, QuoteVerifier};

// The quote program ID is available as a constant
let quote_program = QUOTE_PROGRAM_ID;

// Verify quotes from oracle accounts
let verified_quote = QuoteVerifier::new()
    .queue(&queue_account)
    .slothash_sysvar(&slothash_sysvar)
    .ix_sysvar(&instructions_sysvar)
    .clock_slot(clock_slot)
    .max_age(150)
    .verify_account(&oracle_account)?;