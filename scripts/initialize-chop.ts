import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IDL = JSON.parse(
  readFileSync(join(__dirname, "../target/idl/chop_prgm.json"), "utf-8")
);

/**
 * Script to initialize the CHOP program
 *
 * This will:
 * 1. Derive the configuration PDA
 * 2. Call the initialize_config instruction
 * 3. Set up the CHOP game configuration with treasury and fees
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=path/to/wallet.json bun run scripts/initialize-chop.ts
 */

// Configuration parameters
const PLATFORM_FEE_BPS = 250; // 2.5% platform fee
const CREATOR_FEE_BPS = 250;  // 2.5% creator fee
// Total: 5% fees, 95% to winner

async function main() {
  // Configure the client to use the configured cluster (devnet/localnet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(IDL as any, provider);

  console.log("🪓 Initializing CHOP Program");
  console.log("==========================================");
  console.log(`Program ID: ${program.programId.toString()}`);
  console.log(`Authority: ${provider.wallet.publicKey.toString()}`);
  console.log(`RPC Endpoint: ${provider.connection.rpcEndpoint}`);
  console.log("");

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("chop_config")],
    program.programId
  );

  console.log("📍 PDAs:");
  console.log(`  Config PDA: ${configPDA.toString()}`);
  console.log("");
  console.log("ℹ️  Lobby PDAs will be derived dynamically: [chop_lobby, lobby_id]");
  console.log("");

  // Check if already initialized
  try {
    const existingConfig = await (program.account as any).chopConfig.fetch(configPDA);
    console.log("⚠️  Program is already initialized!");
    console.log(`  Admin: ${existingConfig.admin.toString()}`);
    console.log(`  Treasury: ${existingConfig.treasury.toString()}`);
    console.log(
      `  Platform Fee: ${existingConfig.platformFeeBps} basis points (${existingConfig.platformFeeBps / 100}%)`
    );
    console.log(
      `  Creator Fee: ${existingConfig.creatorFeeBps} basis points (${existingConfig.creatorFeeBps / 100}%)`
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

  // Use same treasury as 1v1 program
  const treasuryWallet = new PublicKey("FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB");

  console.log("💰 Configuration:");
  console.log(`  Treasury: ${treasuryWallet.toString()}`);
  console.log(`  Platform Fee: ${PLATFORM_FEE_BPS} basis points (${PLATFORM_FEE_BPS / 100}%)`);
  console.log(`  Creator Fee: ${CREATOR_FEE_BPS} basis points (${CREATOR_FEE_BPS / 100}%)`);
  console.log(`  Total Fees: ${PLATFORM_FEE_BPS + CREATOR_FEE_BPS} basis points (${(PLATFORM_FEE_BPS + CREATOR_FEE_BPS) / 100}%)`);
  console.log(`  Winner Payout: ${100 - (PLATFORM_FEE_BPS + CREATOR_FEE_BPS) / 100}%`);
  console.log("");

  // Initialize the program
  console.log("🚀 Sending initialize_config transaction...");

  try {
    const txSignature = await program.methods
      .initializeConfig(PLATFORM_FEE_BPS, CREATOR_FEE_BPS)
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

    // Fetch and display the configuration
    try {
      const gameConfig = await (program.account as any).chopConfig.fetch(configPDA);

      console.log("📋 CHOP Game Configuration:");
      console.log(`  Admin: ${gameConfig.admin.toString()}`);
      console.log(`  Treasury: ${gameConfig.treasury.toString()}`);
      console.log(
        `  Platform Fee: ${gameConfig.platformFeeBps} basis points (${gameConfig.platformFeeBps / 100}%)`
      );
      console.log(
        `  Creator Fee: ${gameConfig.creatorFeeBps} basis points (${gameConfig.creatorFeeBps / 100}%)`
      );
      console.log(`  Lobby Count: ${gameConfig.lobbyCount.toString()}`);
      console.log("");
    } catch (e) {
      console.log("📋 Config created (fetch skipped due to IDL mismatch)");
      console.log("");
    }

    console.log("🎉 Initialization complete! CHOP game is ready.");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Player A calls create_lobby(bet_amount) - deposits SOL");
    console.log("  2. Player B calls join_lobby() - deposits matching SOL");
    console.log("  3. Both players play the Timberman game");
    console.log("  4. Convex determines winner and calls end_game(winner)");
    console.log("  5. Winner receives 95%, platform 2.5%, creator 2.5%");
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
