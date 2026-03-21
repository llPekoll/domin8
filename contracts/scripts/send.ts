import { toNano, Address, internal } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

async function main() {
  const mnemonic = process.env.TON_MNEMONIC;
  if (!mnemonic) {
    console.error("Set TON_MNEMONIC in .env");
    process.exit(1);
  }

  const to = process.argv[2];
  const amount = process.argv[3] || "1";

  if (!to) {
    console.error("Usage: bun scripts/send.ts <address> [amount]");
    process.exit(1);
  }

  const apiKey = process.env.TONCENTER_API_KEY;
  const client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
    apiKey: apiKey || undefined,
  });

  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  const contract = client.open(wallet);
  const seqno = await contract.getSeqno();

  console.log(`Sending ${amount} TON to ${to}...`);

  await contract.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: Address.parse(to),
        value: toNano(amount),
        body: "From Domin8 deploy wallet",
      }),
    ],
  });

  console.log("Sent! Check in ~10s.");
}

main().catch(console.error);
