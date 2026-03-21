import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4, TonClient } from "@ton/ton";

async function main() {
  const mnemonic = process.env.TON_MNEMONIC;
  if (!mnemonic) {
    console.error("Set TON_MNEMONIC in .env");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const network = args.includes("--mainnet") ? "mainnet" : "testnet";

  const endpoint =
    network === "mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC";

  const apiKey = process.env.TONCENTER_API_KEY;

  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  const client = new TonClient({ endpoint, apiKey: apiKey || undefined });
  const balance = await client.getBalance(wallet.address);

  console.log(`Network:  ${network}`);
  console.log(`Address:  ${wallet.address.toString({ testOnly: network === "testnet" })}`);
  console.log(`Balance:  ${Number(balance) / 1e9} TON`);
}

main().catch(console.error);
