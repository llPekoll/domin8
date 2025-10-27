import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Domin8Prgm } from "../target/types/domin8_prgm";

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Domin8Prgm as Program<Domin8Prgm>;

  console.log("Program ID:", program.programId.toString());
  console.log("Authority:", provider.wallet.publicKey.toString());

  // Derive PDAs
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    program.programId
  );

  const [gameCounterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_counter")],
    program.programId
  );

  console.log("Config PDA:", gameConfigPda.toString());
  console.log("Counter PDA:", gameCounterPda.toString());

  // Fetch current counter value
  const counter = await program.account.gameCounter.fetch(gameCounterPda);
  console.log("\nBefore update:");
  console.log("  current_round_id:", counter.currentRoundId.toString());

  const newValue = 1;
  console.log(`\n⚠️  Setting counter to ${newValue}...`);

  // Call set_counter instruction
  const tx = await program.methods
    .setCounter(new anchor.BN(newValue))
    .accounts({
      config: gameConfigPda,
      counter: gameCounterPda,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("✓ Transaction:", tx);

  // Verify updated value
  const counterAfter = await program.account.gameCounter.fetch(gameCounterPda);
  console.log("\nAfter update:");
  console.log("  current_round_id:", counterAfter.currentRoundId.toString());

  console.log("\n✅ Counter successfully updated!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
