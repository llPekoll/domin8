/**
 * CHOP Solo Mode Actions (with TX verification)
 * These run in Node.js runtime to verify Solana transactions
 */
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { verifySolTransfer, isValidSignatureFormat } from "./lib/soloPaymentVerifier";

// Pricing in lamports
const SOLO_START_PRICE = 100_000_000; // 0.1 SOL
const SOLO_TREASURY = "FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB";

/**
 * Start a new solo session after verifying payment
 * This action verifies the TX via RPC before creating the session
 */
export const startSoloSessionVerified = action({
  args: {
    walletAddress: v.string(),
    paymentTxSignature: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    // 1. Validate signature format
    if (!isValidSignatureFormat(args.paymentTxSignature)) {
      return { success: false, error: "Invalid transaction signature format" };
    }

    // 2. Check if TX signature already used (replay protection)
    const existingTx = await ctx.runQuery(internal.chopSolo.checkTxUsed, {
      txSignature: args.paymentTxSignature,
    });

    if (existingTx) {
      return { success: false, error: "Transaction already used" };
    }

    // 3. Check if user already has an active session
    const existingSession = await ctx.runQuery(internal.chopSolo.getActiveSessionInternal, {
      walletAddress: args.walletAddress,
    });

    if (existingSession) {
      return { success: true, sessionId: existingSession.sessionId };
    }

    // 4. Verify transaction via RPC
    const rpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    if (!rpcUrl) {
      throw new Error("SOLANA_RPC_ENDPOINT not configured");
    }

    const verification = await verifySolTransfer(
      rpcUrl,
      args.paymentTxSignature,
      args.walletAddress,
      SOLO_TREASURY,
      SOLO_START_PRICE
    );

    if (!verification.isValid) {
      return { success: false, error: verification.error || "Transaction verification failed" };
    }

    // 5. Create session via internal mutation
    const session = await ctx.runMutation(internal.chopSolo.createSoloSession, {
      walletAddress: args.walletAddress,
      paymentTxSignature: args.paymentTxSignature,
      amountPaid: verification.actualAmount || SOLO_START_PRICE,
    });

    // 6. Increment weekly jackpot pool
    await ctx.runMutation(internal.chopJackpot.incrementJackpot, {
      amount: verification.actualAmount || SOLO_START_PRICE,
      type: "session",
    });

    return { success: true, sessionId: session.sessionId };
  },
});

/**
 * Continue solo session after verifying payment
 */
export const continueSoloSessionVerified = action({
  args: {
    sessionId: v.string(),
    paymentTxSignature: v.string(),
    expectedPrice: v.number(), // Frontend sends expected price for verification
  },
  handler: async (ctx, args): Promise<{ success: boolean; continueCount?: number; nextContinuePrice?: number; error?: string }> => {
    // 1. Validate signature format
    if (!isValidSignatureFormat(args.paymentTxSignature)) {
      return { success: false, error: "Invalid transaction signature format" };
    }

    // 2. Check if TX signature already used
    const existingTx = await ctx.runQuery(internal.chopSolo.checkContinueTxUsed, {
      txSignature: args.paymentTxSignature,
    });

    if (existingTx) {
      return { success: false, error: "Transaction already used" };
    }

    // 3. Get session and verify it exists
    const session = await ctx.runQuery(internal.chopSolo.getSessionByIdInternal, {
      sessionId: args.sessionId,
    });

    if (!session || !session.isActive) {
      return { success: false, error: "Session not found or not active" };
    }

    // 4. Verify transaction via RPC
    const rpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    if (!rpcUrl) {
      throw new Error("SOLANA_RPC_ENDPOINT not configured");
    }

    const verification = await verifySolTransfer(
      rpcUrl,
      args.paymentTxSignature,
      session.walletAddress,
      SOLO_TREASURY,
      args.expectedPrice
    );

    if (!verification.isValid) {
      return { success: false, error: verification.error || "Transaction verification failed" };
    }

    // 5. Update session via internal mutation
    const result = await ctx.runMutation(internal.chopSolo.processContinue, {
      sessionId: args.sessionId,
      paymentTxSignature: args.paymentTxSignature,
      amountPaid: verification.actualAmount || args.expectedPrice,
    });

    // 6. Increment weekly jackpot pool
    await ctx.runMutation(internal.chopJackpot.incrementJackpot, {
      amount: verification.actualAmount || args.expectedPrice,
      type: "continue",
    });

    // Calculate next continue price (aggressive fixed tiers)
    const CONTINUE_PRICES_SOL = [0.01, 0.05, 0.15, 0.4, 1, 2.5, 6, 15, 40, 100];
    const priceSOL = CONTINUE_PRICES_SOL[result.continueCount] || CONTINUE_PRICES_SOL[CONTINUE_PRICES_SOL.length - 1];
    const nextContinuePrice = Math.floor(priceSOL * 1_000_000_000);

    return { success: true, continueCount: result.continueCount, nextContinuePrice };
  },
});
