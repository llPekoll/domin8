/**
 * Shop Purchase Hook
 * Generic hook for purchasing items (auras, characters) with SOL
 *
 * Flow:
 * 1. Frontend builds transaction
 * 2. Frontend signs transaction (NOT send) via Privy
 * 3. Calls backend action which sends via Helius (dev) / Circular (prod)
 * 4. Backend verifies and records purchase
 */

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "./usePrivyWallet";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSharedConnection } from "../lib/sharedConnection";
import { logger } from "../lib/logger";

export type ItemType = "aura" | "character";

export interface PurchaseResult {
  success: boolean;
  txSignature?: string;
  itemName?: string;
  error?: string;
}

/**
 * Hook for purchasing shop items with SOL
 */
export function useShopPurchase() {
  const { connected, publicKey, walletAddress } = usePrivyWallet();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Convex action to process purchase on backend
  const purchaseItemAction = useAction(api.shop.purchaseItem);

  // Get the Privy wallet
  const privyWallet = wallets[0];

  // Get treasury address from env
  const treasuryAddress = import.meta.env.VITE_SHOP_TREASURY;

  // Circular FAST tip configuration
  const FAST_TIP = new PublicKey("FAST3dMFZvESiEipBvLSiXq3QCV51o3xuoHScqRU6cB6");
  const MIN_TIP_AMOUNT = 1_000_000; // 0.001 SOL

  /**
   * Purchase an item with SOL
   * @param itemType - Type of item ("aura" | "character")
   * @param itemId - ID of the item to purchase
   * @param priceInLamports - Price in lamports
   */
  const purchaseItem = useCallback(
    async (
      itemType: ItemType,
      itemId: number,
      priceInLamports: number
    ): Promise<PurchaseResult> => {
      if (!connected || !walletAddress || !publicKey) {
        return { success: false, error: "Wallet not connected" };
      }

      if (!treasuryAddress) {
        return { success: false, error: "Shop treasury not configured" };
      }

      if (!privyWallet) {
        return { success: false, error: "Wallet not available" };
      }

      setIsPurchasing(true);

      try {
        logger.solana.debug("[useShopPurchase] Starting purchase", {
          itemType,
          itemId,
          priceInLamports,
          priceSol: priceInLamports / LAMPORTS_PER_SOL,
        });

        const connection = getSharedConnection();
        const network = import.meta.env.VITE_SOLANA_NETWORK || "devnet";
        const chainId = `solana:${network}` as `solana:${string}`;

        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash("confirmed");

        // Build instructions
        const instructions = [
          // Compute budget
          ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
          // SOL transfer to treasury
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(treasuryAddress),
            lamports: priceInLamports,
          }),
          // FAST tip for Circular
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: FAST_TIP,
            lamports: MIN_TIP_AMOUNT,
          }),
        ];

        // Create versioned transaction
        const message = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(message);

        logger.solana.debug("[useShopPurchase] Transaction built, signing...");

        // Sign only (NOT send) - backend will send via Helius/Circular
        // Use Privy's useSignTransaction hook (proper SDK pattern)
        const { signedTransaction: signedTxBytes } = await signTransaction({
          wallet: privyWallet,
          transaction: transaction.serialize(),
          chain: chainId,
        });

        if (!signedTxBytes) {
          throw new Error("Failed to sign transaction");
        }

        const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");

        logger.solana.debug("[useShopPurchase] Transaction signed, sending to backend...");

        // Call backend action to send and verify
        const result = await purchaseItemAction({
          walletAddress,
          itemType,
          itemId,
          signedTxBase64,
          expectedAmount: priceInLamports,
        });

        logger.solana.info("[useShopPurchase] Purchase completed", {
          txSignature: result.txSignature,
          itemName: result.itemName,
        });

        return {
          success: true,
          txSignature: result.txSignature,
          itemName: result.itemName,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Purchase failed";
        logger.solana.error("[useShopPurchase] Purchase failed:", error);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsPurchasing(false);
      }
    },
    [connected, walletAddress, publicKey, treasuryAddress, privyWallet, signTransaction, purchaseItemAction]
  );

  /**
   * Get price in SOL from lamports
   */
  const formatPrice = useCallback((lamports: number): string => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(2);
  }, []);

  return {
    purchaseItem,
    isPurchasing,
    connected,
    formatPrice,
    treasuryConfigured: !!treasuryAddress,
  };
}

export default useShopPurchase;
