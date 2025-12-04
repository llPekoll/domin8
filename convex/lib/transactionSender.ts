/**
 * Transaction Sender - Abstraction for sending signed transactions
 * Uses Helius RPC in development, Circular in production
 */
"use node";

import { Connection } from "@solana/web3.js";

export interface SendTransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface TransactionVerification {
  valid: boolean;
  error?: string;
  recipient?: string;
  amount?: number;
}

/**
 * Send a signed transaction to the Solana network
 * Automatically routes to Helius (dev) or Circular (prod) based on environment
 */
export async function sendSignedTransaction(
  signedTxBase64: string,
  rpcUrl: string,
  circularApiKey?: string
): Promise<SendTransactionResult> {
  // Determine if we're in production based on RPC URL or explicit setting
  const isProduction = rpcUrl.includes("mainnet") || process.env.USE_CIRCULAR === "true";

  if (isProduction && circularApiKey) {
    return sendViaCircular(signedTxBase64, circularApiKey);
  } else {
    return sendViaHelius(signedTxBase64, rpcUrl);
  }
}

/**
 * Send transaction via Helius RPC (development)
 */
async function sendViaHelius(
  signedTxBase64: string,
  rpcUrl: string
): Promise<SendTransactionResult> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");

    // Convert base64 to buffer
    const txBuffer = Buffer.from(signedTxBase64, "base64");

    // Send raw transaction
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed");

    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    return {
      success: true,
      signature,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send via Helius",
    };
  }
}

/**
 * Send transaction via Circular API (production)
 * Circular provides faster transaction landing for mainnet
 */
async function sendViaCircular(
  signedTxBase64: string,
  apiKey: string
): Promise<SendTransactionResult> {
  const CIRCULAR_URL = "https://fast.circular.fi/transactions";

  try {
    const response = await fetch(CIRCULAR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [signedTxBase64, { frontRunningProtection: false }],
      }),
    });

    const result = await response.json();

    if (result.error) {
      return {
        success: false,
        error: result.error.message || "Circular API error",
      };
    }

    return {
      success: true,
      signature: result.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send via Circular",
    };
  }
}

/**
 * Verify a transaction on-chain
 * Checks that the transaction was successful and matches expected parameters
 */
export async function verifyTransaction(
  rpcUrl: string,
  txSignature: string,
  expectedRecipient: string,
  expectedAmount: number
): Promise<TransactionVerification> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch transaction with retry
    let tx = null;
    let retries = 0;
    const maxRetries = 5;

    while (!tx && retries < maxRetries) {
      tx = await connection.getTransaction(txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        retries++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!tx) {
      return { valid: false, error: "Transaction not found after retries" };
    }

    if (tx.meta?.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    // Parse the transaction to verify SOL transfer
    // For a simple SOL transfer, we need to check the balance changes
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    const accountKeys = tx.transaction.message.getAccountKeys();

    // Find the recipient in the account keys and verify amount
    let recipientIndex = -1;
    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys.get(i);
      if (key && key.toBase58() === expectedRecipient) {
        recipientIndex = i;
        break;
      }
    }

    if (recipientIndex === -1) {
      return { valid: false, error: "Recipient not found in transaction" };
    }

    // Calculate the amount received by the recipient
    const amountReceived = postBalances[recipientIndex] - preBalances[recipientIndex];

    // Allow for small discrepancy due to rent etc (within 1%)
    const tolerance = expectedAmount * 0.01;
    if (Math.abs(amountReceived - expectedAmount) > tolerance) {
      return {
        valid: false,
        error: `Amount mismatch: expected ${expectedAmount}, got ${amountReceived}`,
      };
    }

    return {
      valid: true,
      recipient: expectedRecipient,
      amount: amountReceived,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

/**
 * Wait for transaction confirmation with timeout
 */
export async function waitForConfirmation(
  rpcUrl: string,
  signature: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const connection = new Connection(rpcUrl, "confirmed");
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await connection.getSignatureStatus(signature);

      if (status?.value?.confirmationStatus === "confirmed" ||
          status?.value?.confirmationStatus === "finalized") {
        return true;
      }

      if (status?.value?.err) {
        return false;
      }
    } catch {
      // Continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}
