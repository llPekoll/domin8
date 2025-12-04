/**
 * Shop Actions - Node.js actions for processing SOL purchases
 * Mutations are in shopMutations.ts (can't be in "use node" files)
 *
 * Flow:
 * 1. Frontend builds & signs transaction (NOT send)
 * 2. Frontend calls this action with signed tx
 * 3. Backend sends via Helius (dev) / Circular (prod)
 * 4. Backend verifies and records purchase
 */
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  sendSignedTransaction,
  verifyTransaction,
} from "./lib/transactionSender";

// Item types that can be purchased
const itemTypes = v.union(v.literal("aura"), v.literal("character"));

/**
 * Purchase an item with SOL
 * Frontend signs transaction, we send it and verify on-chain
 */
export const purchaseItem = action({
  args: {
    walletAddress: v.string(),
    itemType: itemTypes,
    itemId: v.number(),
    signedTxBase64: v.string(),
    expectedAmount: v.number(), // in lamports
  },
  handler: async (ctx, args) => {
    const { walletAddress, itemType, itemId, signedTxBase64, expectedAmount } = args;

    // Get environment variables
    const rpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    const shopTreasury = process.env.SHOP_TREASURY;
    const circularApiKey = process.env.CIRCULAR_API_KEY;

    if (!rpcUrl) {
      throw new Error("SOLANA_RPC_ENDPOINT not configured");
    }
    if (!shopTreasury) {
      throw new Error("SHOP_TREASURY not configured");
    }

    let txSignature: string | undefined;

    try {
      // 1. Send the signed transaction via Helius (dev) / Circular (prod)
      const sendResult = await sendSignedTransaction(
        signedTxBase64,
        rpcUrl,
        circularApiKey
      );

      if (!sendResult.success || !sendResult.signature) {
        // Record failed attempt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.runMutation((internal as any).shopMutations.recordFailedPurchase, {
          walletAddress,
          itemType,
          itemId,
          amountLamports: expectedAmount,
          error: sendResult.error || "Failed to send transaction",
          errorStep: "send_tx",
        });
        throw new Error(sendResult.error || "Failed to send transaction");
      }

      txSignature = sendResult.signature;

      // 2. Verify the transaction on-chain
      const verification = await verifyTransaction(
        rpcUrl,
        txSignature,
        shopTreasury,
        expectedAmount
      );

      if (!verification.valid) {
        // Record failed attempt with signature
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.runMutation((internal as any).shopMutations.recordFailedPurchase, {
          walletAddress,
          itemType,
          itemId,
          amountLamports: expectedAmount,
          error: verification.error || "Transaction verification failed",
          errorStep: "verify_tx",
          txSignature,
        });
        throw new Error(verification.error || "Transaction verification failed");
      }

      // 3. Record the purchase (this also checks for double-spend)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await ctx.runMutation((internal as any).shopMutations.recordPurchase, {
        walletAddress,
        itemType,
        itemId,
        txSignature,
        amountLamports: expectedAmount,
        unlockedBy: "purchase",
      });

      return {
        success: true,
        txSignature,
        itemName: result.itemName,
      };
    } catch (error) {
      // If we haven't recorded the failure yet, record it now
      const errorMessage = error instanceof Error ? error.message : "Purchase failed";

      // Only record if this is a new error (not already recorded above)
      if (!errorMessage.includes("Failed to send") && !errorMessage.includes("verification failed")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.runMutation((internal as any).shopMutations.recordFailedPurchase, {
          walletAddress,
          itemType,
          itemId,
          amountLamports: expectedAmount,
          error: errorMessage,
          errorStep: "record_purchase",
          txSignature,
        });
      }

      throw error;
    }
  },
});
