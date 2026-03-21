import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

async function main() {
  // Generate 24-word mnemonic
  const mnemonic = await mnemonicNew();
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  const wallet = WalletContractV4.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  console.log("=== TON Deploy Wallet ===\n");
  console.log("Mnemonic (save this, NEVER share):");
  console.log(mnemonic.join(" "));
  console.log("\nWallet address (testnet):", wallet.address.toString({ testOnly: true }));
  console.log("Wallet address (mainnet):", wallet.address.toString());
  console.log("\nNext steps:");
  console.log("1. Add to .env.local:  TON_MNEMONIC=\"" + mnemonic.join(" ") + "\"");
  console.log("2. Fund testnet wallet: https://t.me/testgiver_ton_bot");
  console.log("   Send your testnet address to the bot to get free test TON");
  console.log("3. Deploy: bun run deploy:testnet");
}

main().catch(console.error);
