import { toNano, Address } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { Domin8 } from "../build/domin8_Domin8";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const network = args.includes("--network")
    ? args[args.indexOf("--network") + 1]
    : "testnet";

  const endpoint =
    network === "mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC";

  // Optional: use TONCENTER_API_KEY to avoid rate limits
  // Get one free at https://toncenter.com
  const apiKey = process.env.TONCENTER_API_KEY;

  console.log(`Deploying Domin8 to ${network}...`);

  const mnemonic = process.env.TON_MNEMONIC;
  if (!mnemonic) {
    console.error("Set TON_MNEMONIC in .env (24 words, space-separated)");
    process.exit(1);
  }

  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const wallet = WalletContractV4.create({
    publicKey: keyPair.publicKey,
    workchain: 0,
  });

  const client = new TonClient({
    endpoint,
    apiKey: apiKey || undefined,
  });

  const walletContract = client.open(wallet);
  const walletSender = walletContract.sender(keyPair.secretKey);

  const addrStr = wallet.address.toString({ testOnly: network === "testnet" });
  console.log(`Deployer: ${addrStr}`);

  await sleep(1500); // avoid rate limit
  const balance = await walletContract.getBalance();
  console.log(`Balance: ${Number(balance) / 1e9} TON`);

  if (balance < toNano("0.5")) {
    console.error("Need at least 0.5 TON for deployment");
    process.exit(1);
  }

  const master = client.open(await Domin8.fromInit(wallet.address));
  console.log(`Master: ${master.address.toString({ testOnly: network === "testnet" })}`);

  // Check if already deployed
  await sleep(1500);
  const state = await client.getContractState(master.address);
  if (state.state === "active") {
    console.log("Already deployed! Skipping to config...");
  } else {
    // Deploy
    await master.send(walletSender, { value: toNano("0.2") }, {
      $$type: "Deploy",
      queryId: 0n,
    });

    console.log("Deploy tx sent. Waiting...");

    let deployed = false;
    for (let i = 0; i < 30; i++) {
      await sleep(3000); // 3s between checks to avoid rate limit
      try {
        const s = await client.getContractState(master.address);
        if (s.state === "active") {
          console.log("Deployed!");
          deployed = true;
          break;
        }
      } catch {
        // rate limited, just retry
      }
      console.log(`Waiting... (${i + 1}/30)`);
    }

    if (!deployed) {
      console.error("Deploy timed out. Check the address on tonscan.");
      process.exit(1);
    }
  }

  // Init config
  const treasuryAddr = process.env.TON_TREASURY || wallet.address.toString();

  console.log("\nInitializing config...");
  console.log(`  Treasury: ${treasuryAddr}`);
  console.log(`  House fee: 5%`);
  console.log(`  Min bet: 0.01 TON`);
  console.log(`  Max bet: 10 TON`);
  console.log(`  Round time: 60s`);

  await sleep(1500);
  await master.send(walletSender, { value: toNano("0.1") }, {
    $$type: "InitConfig",
    treasury: Address.parse(treasuryAddr),
    houseFee: 500n,
    minBet: toNano("0.01"),
    maxBet: toNano("10"),
    roundTime: 60n,
  });

  console.log("Config tx sent.");
  console.log("\nDone!");
  console.log(`  Master: ${master.address.toString({ testOnly: network === "testnet" })}`);
  console.log(`\nAdd to .env: TON_MASTER_ADDRESS=${master.address.toString()}`);

  const explorerBase = network === "testnet"
    ? "https://testnet.tonscan.org/address/"
    : "https://tonscan.org/address/";
  console.log(`\nExplorer: ${explorerBase}${master.address.toString({ testOnly: network === "testnet" })}`);
}

main().catch(console.error);
