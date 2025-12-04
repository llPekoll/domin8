/**
 * Game Bets Actions - Node.js actions for processing game bet transactions
 *
 * Flow:
 * 1. Frontend builds & signs transaction (NOT send)
 * 2. Frontend calls this action with signed tx
 * 3. Backend sends via Helius (dev) / Circular (prod)
 * 4. Backend awards points and tracks referrals
 */
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sendSignedTransaction, waitForConfirmation } from "./lib/transactionSender";

/**
 * Send a signed bet transaction and award points
 * Frontend signs transaction, we send it and process post-tx logic
 */
export const sendBetTransaction = action({
  args: {
    walletAddress: v.string(),
    signedTxBase64: v.string(),
    amountLamports: v.number(),
    roundId: v.number(),
    betIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const { walletAddress, signedTxBase64, amountLamports, roundId, betIndex } = args;

    // Get environment variables
    const rpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    const circularApiKey = process.env.CIRCULAR_API_KEY;

    if (!rpcUrl) {
      throw new Error("SOLANA_RPC_ENDPOINT not configured");
    }

    try {
      // 1. Send the signed transaction via Helius (dev) / Circular (prod)
      const sendResult = await sendSignedTransaction(
        signedTxBase64,
        rpcUrl,
        circularApiKey
      );

      if (!sendResult.success || !sendResult.signature) {
        throw new Error(sendResult.error || "Failed to send transaction");
      }

      const txSignature = sendResult.signature;

      // 2. Wait for confirmation (with timeout)
      const confirmed = await waitForConfirmation(rpcUrl, txSignature, 30000);

      if (!confirmed) {
        throw new Error("Transaction confirmation timeout");
      }

      // 3. Award points for the bet (1 point per 0.001 SOL)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).players.awardPointsInternal, {
        walletAddress,
        amountLamports,
      });

      // 4. Track referral revenue if this user was referred
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).referrals.updateReferralRevenueInternal, {
        userId: walletAddress,
        betAmount: amountLamports,
      });

      return {
        success: true,
        signature: txSignature,
        roundId,
        betIndex,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Bet transaction failed";
      throw new Error(errorMessage);
    }
  },
});
