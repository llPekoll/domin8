import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IDL = JSON.parse(readFileSync(join(__dirname, "../target/idl/domin8_prgm.json"), "utf-8"));

/**
 * Script to initialize the Domin8 game program (risk-based architecture)
 *
 * This will:
 * 1. Derive the necessary PDAs (config, active_game)
 * 2. Call the initialize_config instruction
 * 3. Set up the game configuration with treasury and fees
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=path/to/wallet.json bun run scripts/initialize.ts
 */

const PROGRAM_ID = new PublicKey(IDL.address);

// Configuration parameters
const HOUSE_FEE_BPS = 500; // 5%
const MIN_DEPOSIT_LAMPORTS = 1_000_000; // 0.001 SOL
const MAX_DEPOSIT_LAMPORTS = 10_000_000_000; // 10 SOL
const ROUND_TIME_SECONDS = 60; // 60 seconds per game

async function main() {
  // Configure the client to use the configured cluster (devnet/localnet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(IDL as any, provider);

  console.log("🎮 Initializing Domin8 Game Program (Risk Architecture)");
  console.log("==========================================");
  console.log(`Program ID: ${program.programId.toString()}`);
  console.log(`Authority: ${provider.wallet.publicKey.toString()}`);
  console.log(`RPC Endpoint: ${provider.connection.rpcEndpoint}`);
  console.log("");

  // Derive PDAs (new architecture)
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("domin8_config")],
    program.programId
  );

  const [activeGamePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("active_game")],
    program.programId
  );

  console.log("📍 PDAs:");
  console.log(`  Config PDA: ${configPDA.toString()}`);
  console.log(`  Active Game PDA: ${activeGamePDA.toString()}`);
  console.log("");
  console.log("ℹ️  Game round PDAs will be derived dynamically: [domin8_game, round_id]");
  console.log("");

  // Check if already initialized
  try {
    const existingConfig = await program.account.domin8Config.fetch(configPDA);
    console.log("⚠️  Program is already initialized!");
    console.log(`  Admin: ${existingConfig.admin.toString()}`);
    console.log(`  Treasury: ${existingConfig.treasury.toString()}`);
    console.log(`  House Fee: ${existingConfig.houseFee} basis points (${existingConfig.houseFee / 100}%)`);
    console.log(`  Game Round: ${existingConfig.gameRound.toString()}`);
    console.log(`  Locked: ${existingConfig.lock}`);
    console.log("");
    console.log("If you want to reinitialize, you need to:");
    console.log("  1. Close the existing accounts");
    console.log("  2. Or deploy a new program with a different ID");
    return;
  } catch (error) {
    // Not initialized yet, which is good
    console.log("✅ Program not yet initialized - proceeding...");
    console.log("");
  }

  // Use the wallet's public key as treasury
  const treasuryWallet = provider.wallet.publicKey;

  console.log("💰 Configuration:");
  console.log(`  Treasury: ${treasuryWallet.toString()}`);
  console.log(`  House Fee: ${HOUSE_FEE_BPS} basis points (${HOUSE_FEE_BPS / 100}%)`);
  console.log(`  Min Bet: ${MIN_DEPOSIT_LAMPORTS / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  console.log(`  Max Bet: ${MAX_DEPOSIT_LAMPORTS / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  console.log(`  Round Time: ${ROUND_TIME_SECONDS} seconds`);
  console.log("");

  // Initialize the program
  console.log("🚀 Sending initialize_config transaction...");

  try {
    const txSignature = await program.methods
      .initializeConfig(
        treasuryWallet,
        new BN(HOUSE_FEE_BPS),
        new BN(MIN_DEPOSIT_LAMPORTS),
        new BN(MAX_DEPOSIT_LAMPORTS),
        new BN(ROUND_TIME_SECONDS)
      )
      .accounts({
        config: configPDA,
        activeGame: activeGamePDA,
        admin: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Program initialized successfully!");
    console.log(`  Transaction: ${txSignature}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
    console.log("");

    // Fetch and display the configuration
    const gameConfig = await program.account.domin8Config.fetch(configPDA);
    const activeGame = await program.account.domin8Game.fetch(activeGamePDA);

    console.log("📋 Game Configuration:");
    console.log(`  Admin: ${gameConfig.admin.toString()}`);
    console.log(`  Treasury: ${gameConfig.treasury.toString()}`);
    console.log(`  House Fee: ${gameConfig.houseFee.toString()} basis points (${gameConfig.houseFee / 100}%)`);
    console.log(`  Min Bet: ${gameConfig.minDepositAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Max Bet: ${gameConfig.maxDepositAmount.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`  Round Time: ${gameConfig.roundTime.toString()} seconds`);
    console.log(`  Current Game Round: ${gameConfig.gameRound.toString()}`);
    console.log(`  System Locked: ${gameConfig.lock}`);
    console.log("");

    console.log("📋 Active Game State:");
    console.log(`  Game Round: ${activeGame.gameRound.toString()} (0 = no active game)`);
    console.log(`  Status: ${activeGame.status} (1 = closed, waiting for first bet)`);
    console.log("");

    console.log("🎉 Initialization complete! Your game is ready to accept bets.");
    console.log("");
    console.log("Next steps:");
    console.log("  1. First player calls create_game_round(round_id: 1, bet_amount, skin, position)");
    console.log("  2. Subsequent players call bet(round_id: 1, bet_amount, skin, position)");
    console.log("  3. Admin calls end_game(round_id: 1) after round_time expires");
    console.log("  4. Winner calls send_prize_winner(round_id: 1) to claim prize");
  } catch (error: any) {
    console.error("❌ Initialization failed:");
    console.error(error);

    if (error.error) {
      console.error("Error code:", error.error.errorCode?.code);
      console.error("Error message:", error.error.errorMessage);
    }

    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
