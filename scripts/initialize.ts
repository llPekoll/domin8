import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IDL = JSON.parse(readFileSync(join(__dirname, "../target/idl/domin8_prgm.json"), "utf-8"));

/**
 * Script to initialize the Domin8 game program
 *
 * This will:
 * 1. Derive the necessary PDAs (config, counter, vault)
 * 2. Call the initialize instruction
 * 3. Set up the game configuration with a treasury wallet
 * 4. Initialize the GameCounter at round 0
 *
 * Note: Individual game rounds will be created automatically on first bet
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=path/to/wallet.json ts-node scripts/initialize.ts
 */

const PROGRAM_ID = new PublicKey(IDL.address);

async function main() {
  // Configure the client to use the configured cluster (devnet/localnet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(IDL as any, provider);

  console.log("🎮 Initializing Domin8 Game Program");
  console.log("==========================================");
  console.log(`Program ID: ${program.programId.toString()}`);
  console.log(`Authority: ${provider.wallet.publicKey.toString()}`);
  console.log(`RPC Endpoint: ${provider.connection.rpcEndpoint}`);
  console.log("");

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    program.programId
  );

  const [counterPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_counter")],
    program.programId
  );

  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault")], program.programId);

  console.log("📍 PDAs:");
  console.log(`  Config PDA: ${configPDA.toString()}`);
  console.log(`  Counter PDA: ${counterPDA.toString()}`);
  console.log(`  Vault PDA: ${vaultPDA.toString()}`);
  console.log("");
  console.log("ℹ️  Game round PDAs will be derived dynamically: [game_round, round_id]");
  console.log("");

  // Check if already initialized
  try {
    const existingConfig = await program.account.gameConfig.fetch(configPDA);
    console.log("⚠️  Program is already initialized!");
    console.log(`  Treasury: ${existingConfig.treasury.toString()}`);
    console.log(`  Authority: ${existingConfig.authority.toString()}`);
    console.log(`  House Fee: ${existingConfig.houseFeeBasisPoints} basis points`);
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

  // Option 1: Use the wallet's public key as treasury
  const treasuryWallet = provider.wallet.publicKey;

  // Option 2: Generate a new treasury wallet (uncomment if preferred)
  // const treasuryKeypair = Keypair.generate();
  // const treasuryWallet = treasuryKeypair.publicKey;
  // console.log("⚠️  Save this treasury keypair:");
  // console.log(`  Public Key: ${treasuryWallet.toString()}`);
  // console.log(`  Secret Key: [${Array.from(treasuryKeypair.secretKey)}]`);
  // console.log("");

  console.log("💰 Treasury Configuration:");
  console.log(`  Treasury: ${treasuryWallet.toString()}`);
  console.log("");

  // Initialize the program
  console.log("🚀 Sending initialize transaction...");

  try {
    const txSignature = await program.methods.initialize(treasuryWallet).rpc();

    console.log("✅ Program initialized successfully!");
    console.log(`  Transaction: ${txSignature}`);
    console.log("");

    // Fetch and display the configuration
    const gameConfig = await program.account.gameConfig.fetch(configPDA);
    const gameCounter = await program.account.gameCounter.fetch(counterPDA);

    console.log("📋 Game Configuration:");
    console.log(`  Authority: ${gameConfig.authority.toString()}`);
    console.log(`  Treasury: ${gameConfig.treasury.toString()}`);
    console.log(
      `  House Fee: ${gameConfig.houseFeeBasisPoints} basis points (${gameConfig.houseFeeBasisPoints / 100}%)`
    );
    console.log(
      `  Min Bet: ${gameConfig.minBetLamports.toNumber() / anchor.web3.LAMPORTS_PER_SOL} SOL`
    );
    console.log(
      `  Waiting Phase Duration: ${gameConfig.smallGameDurationConfig.waitingPhaseDuration} seconds`
    );
    console.log(`  Game Locked: ${gameConfig.gameLocked}`);
    console.log("");

    console.log("📋 Game Counter State:");
    console.log(`  Current Round ID: ${gameCounter.currentRoundId.toString()}`);
    console.log("");
    console.log("ℹ️  No game round exists yet - will be created on first bet");
    console.log("");

    console.log("🎉 Initialization complete! Your game is ready to accept bets.");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Run the tests: anchor test");
    console.log("  2. Start your frontend: bun run dev");
    console.log("  3. First player calls create_game instruction");
    console.log("  4. Subsequent players call place_bet instruction");
  } catch (error: any) {
    console.error("❌ Initialization failed:");
    console.error(error);

    if (error.error) {
      console.error("Error code:", error.error.errorCode?.code);
      console.error("Error message:", error.error.errorMessage);
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
