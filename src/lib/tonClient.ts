/**
 * TON Client Singleton
 *
 * Shared TonClient instance for all blockchain reads.
 * Equivalent of sharedConnection.ts for Solana.
 */

import { TonClient } from "@ton/ton";

let client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (!client) {
    const network = import.meta.env.VITE_TON_NETWORK || "testnet";
    const apiKey = import.meta.env.VITE_TONCENTER_API_KEY || "";

    const endpoint =
      network === "mainnet"
        ? "https://toncenter.com/api/v2/jsonRPC"
        : "https://testnet.toncenter.com/api/v2/jsonRPC";

    client = new TonClient({
      endpoint,
      apiKey: apiKey || undefined,
    });

    console.log(`[TonClient] Created (${network})`);
  }
  return client;
}

export function getTonNetwork(): "mainnet" | "testnet" {
  return (import.meta.env.VITE_TON_NETWORK || "testnet") as "mainnet" | "testnet";
}

export function resetTonClient() {
  client = null;
}
