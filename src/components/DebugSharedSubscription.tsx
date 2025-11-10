/**
 * Debug Component for Shared WebSocket Subscription
 *
 * Monitors and logs WebSocket health and subscriber count.
 * Useful for development and production debugging.
 *
 * Usage: Add <DebugSharedSubscription /> to your App component
 *
 * Enable/disable via environment variable:
 * VITE_DEBUG_SHARED_SUBSCRIPTION=true
 */

import { useEffect, useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { getSharedGameSubscription } from "../lib/sharedGameSubscription";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import idl from "../../target/idl/domin8_prgm.json";
import { logger } from "../lib/logger";

export function DebugSharedSubscription() {
  const { walletAddress, wallet } = usePrivyWallet();

  // Check if debug mode is enabled
  const isEnabled = import.meta.env.VITE_DEBUG_SHARED_SUBSCRIPTION === "true";

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    return new Connection(rpcUrl, "confirmed");
  }, []);

  const program = useMemo(() => {
    if (!walletAddress || !wallet) return null;

    try {
      const walletAdapter = {
        publicKey: new PublicKey(walletAddress),
        signTransaction: async (tx: any) => {
          if (!wallet.signTransaction) {
            throw new Error("Wallet does not support signing transactions");
          }
          return await wallet.signTransaction(tx);
        },
        signAllTransactions: async (txs: any[]) => {
          if (!wallet.signTransaction) {
            throw new Error("Wallet does not support signing transactions");
          }
          const signed = [];
          for (const tx of txs) {
            signed.push(await wallet.signTransaction(tx));
          }
          return signed;
        },
      };

      const provider = {
        connection,
        wallet: walletAdapter,
        publicKey: new PublicKey(walletAddress),
      };

      return new Program(idl as any, provider as any);
    } catch (err) {
      logger.solana.error("[DebugSharedSub] Failed to create program:", err);
      return null;
    }
  }, [walletAddress, connection, wallet]);

  const activeGamePDA = useMemo(() => {
    if (!program) return null;
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("active_game")], program.programId);
    return pda;
  }, [program]);

  useEffect(() => {
    if (!isEnabled || !program || !activeGamePDA) return;

    const shared = getSharedGameSubscription(connection, activeGamePDA, program);

    // Log stats every 3 seconds
    const interval = setInterval(() => {
      const stats = {
        subscriberCount: shared.getSubscriberCount(),
        hasCachedData: !!shared.getCurrentData(),
        cachedDataSize: shared.getCurrentData()?.data.length || 0,
        timestamp: new Date().toISOString(),
        rpcEndpoint: connection.rpcEndpoint,
      };

      logger.solana.debug("[DebugSharedSub] 📊 WebSocket Stats:", stats);

      // Also log to console.table for easy viewing
      console.table({
        "Subscriber Count": stats.subscriberCount,
        "Has Cached Data": stats.hasCachedData ? "✅" : "❌",
        "Cached Data Size (bytes)": stats.cachedDataSize,
        "RPC Endpoint": stats.rpcEndpoint,
      });
    }, 3000);

    logger.solana.debug("[DebugSharedSub] ✅ Debug monitoring started");

    return () => {
      clearInterval(interval);
      logger.solana.debug("[DebugSharedSub] 🛑 Debug monitoring stopped");
    };
  }, [isEnabled, program, activeGamePDA, connection]);

  // No UI, just debugging
  return null;
}
