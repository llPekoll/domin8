import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IDL = JSON.parse(readFileSync(join(__dirname, "../target/idl/domin8_1v1_prgm.json"), "utf-8"));

/**
 * Script to initialize the Domin8 1v1 program
 *
 * This will:
 * 1. Derive the configuration PDA
 * 2. Call the initialize_config instruction
 * 3. Set up the 1v1 lobby configuration with treasury and fees
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=path/to/wallet.json bun run scripts/initialize-1v1.ts
 */

// Configuration parameters
const HOUSE_FEE_BPS = 500; // 5%

async function main() {
  // Configure the client to use the configured cluster (devnet/localnet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(IDL as any, provider);

  console.log("🎮 Initializing Domin8 1v1 Program");
  console.log("==========================================");
  console.log(`Program ID: ${program.programId.toString()}`);
  console.log(`Authority: ${provider.wallet.publicKey.toString()}`);
  console.log(`RPC Endpoint: ${provider.connection.rpcEndpoint}`);
  console.log("");

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("domin8_1v1_config")],
    program.programId
  );

  console.log("📍 PDAs:");
  console.log(`  Config PDA: ${configPDA.toString()}`);
  console.log("");
  console.log("ℹ️  Lobby PDAs will be derived dynamically: [domin8_1v1_lobby, lobby_id]");
  console.log("");

  // Check if already initialized
  try {
    const existingConfig = await (program.account as any).domin81v1Config.fetch(configPDA);
    console.log("⚠️  Program is already initialized!");
    console.log(`  Admin: ${existingConfig.admin.toString()}`);
    console.log(`  Treasury: ${existingConfig.treasury.toString()}`);
    console.log(
      `  House Fee: ${existingConfig.houseFeeBps} basis points (${existingConfig.houseFeeBps / 100}%)`
    );
    console.log(`  Lobby Count: ${existingConfig.lobbyCount.toString()}`);
    console.log("");
    console.log("If you want to reinitialize, you need to:");
    console.log("  1. Close the existing config account");
    console.log("  2. Or deploy a new program with a different ID");
    return;
  } catch (error) {
    // Not initialized yet, which is good
    console.log("✅ Program not yet initialized - proceeding...");
    console.log("");
  }

  // Use the wallet's public key as treasury
  const treasuryWallet = new PublicKey("53Xu7YeFmAZ7yYrq1ZknvSrXDbEqVBAeXSbpu5vrgbaT");

  console.log("💰 Configuration:");
  console.log(`  Treasury: ${treasuryWallet.toString()}`);
  console.log(`  House Fee: ${HOUSE_FEE_BPS} basis points (${HOUSE_FEE_BPS / 100}%)`);
  console.log("");

  // Initialize the program
  console.log("🚀 Sending initialize_config transaction...");

  try {
    const txSignature = await program.methods
      .initializeConfig(
        new BN(HOUSE_FEE_BPS)
      )
      .accounts({
        config: configPDA,
        admin: provider.wallet.publicKey,
        treasury: treasuryWallet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Program initialized successfully!");
    console.log(`  Transaction: ${txSignature}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
    console.log("");

    // Fetch and display the configuration (normal errors here)
    const gameConfig = await program.account.domin81v1Config.fetch(configPDA);

    console.log("📋 1v1 Game Configuration:");
    console.log(`  Admin: ${gameConfig.admin.toString()}`);
    console.log(`  Treasury: ${gameConfig.treasury.toString()}`);
    console.log(
      `  House Fee: ${gameConfig.houseFeeBps.toString()} basis points (${gameConfig.houseFeeBps / 100}%)`
    );
    console.log(`  Lobby Count: ${gameConfig.lobbyCount.toString()}`);
    console.log("");

    console.log("🎉 Initialization complete! Your 1v1 game is ready.");
    console.log("");
    console.log("Next steps:");
    console.log(
      "  1. Player A calls create_lobby(amount, skin_a, position_a, map)"
    );
    console.log(
      "  2. Player B calls join_lobby(amount, skin_b, position_b) on the same lobby"
    );
    console.log("  3. Winner is determined and funds are distributed");
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
