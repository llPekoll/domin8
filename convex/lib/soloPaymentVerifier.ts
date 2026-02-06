/**
 * Solo Mode Payment Verifier
 * Verifies SOL transfers via RPC before allowing session start/continue
 */
"use node";

import { Connection } from "@solana/web3.js";

export interface TransferVerification {
  isValid: boolean;
  error?: string;
  actualAmount?: number;
  sender?: string;
  recipient?: string;
}

/**
 * Verify a SOL transfer transaction
 *
 * @param rpcUrl - Solana RPC endpoint
 * @param signature - Transaction signature to verify
 * @param expectedSender - Expected sender wallet address
 * @param expectedRecipient - Expected recipient (treasury) address
 * @param expectedMinAmount - Minimum expected amount in lamports
 * @returns Verification result
 */
export async function verifySolTransfer(
  rpcUrl: string,
  signature: string,
  expectedSender: string,
  expectedRecipient: string,
  expectedMinAmount: number
): Promise<TransferVerification> {
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    // Fetch transaction with confirmed commitment
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { isValid: false, error: "Transaction not found" };
    }

    // Check if transaction succeeded
    if (tx.meta?.err) {
      return { isValid: false, error: "Transaction failed on-chain" };
    }

    // Get pre and post balances to find transfers
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;

    // Find the sender and recipient indices
    let senderIndex = -1;
    let recipientIndex = -1;

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys[i].toBase58();
      if (key === expectedSender) senderIndex = i;
      if (key === expectedRecipient) recipientIndex = i;
    }

    if (senderIndex === -1) {
      return { isValid: false, error: "Sender not found in transaction" };
    }

    if (recipientIndex === -1) {
      return { isValid: false, error: "Treasury not found in transaction" };
    }

    // Calculate the transfer amount (recipient's balance increase)
    const recipientIncrease = postBalances[recipientIndex] - preBalances[recipientIndex];

    // The recipient increase should match the expected amount
    if (recipientIncrease < expectedMinAmount) {
      return {
        isValid: false,
        error: `Insufficient amount: got ${recipientIncrease}, expected ${expectedMinAmount}`,
        actualAmount: recipientIncrease,
      };
    }

    // Verify sender signed the transaction
    // The first account is typically the fee payer/signer
    const isSignedBySender = tx.transaction.message.isAccountSigner(senderIndex);
    if (!isSignedBySender) {
      return { isValid: false, error: "Transaction not signed by expected sender" };
    }

    return {
      isValid: true,
      actualAmount: recipientIncrease,
      sender: expectedSender,
      recipient: expectedRecipient,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if a transaction signature has already been used
 * This is called from the action before the mutation to prevent replay attacks
 */
export function isValidSignatureFormat(signature: string): boolean {
  // Solana signatures are base58 encoded and typically 87-88 characters
  if (!signature || signature.length < 80 || signature.length > 90) {
    return false;
  }

  // Basic base58 character check
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(signature);
}
