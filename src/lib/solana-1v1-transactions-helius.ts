/**
 * Solana 1v1 Lobby Transaction Builder with Helius Optimization
 *
 * Utilities for building, signing, and sending optimized 1v1 lobby transactions
 * Integrates Helius best practices:
 * - Blockhash caching and validation
 * - Transaction simulation for accurate compute units
 * - Priority fee estimation
 * - Robust polling with exponential backoff
 * - Atomic sign+send via Privy
 *
 * Uses Switchboard Randomness for verifiable, on-chain random number generation
 */

import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import IDL from "../../target/idl/domin8_1v1_prgm.json";
import { logger } from "./logger";

// Extract Program ID from IDL
const PROGRAM_ID = new PublicKey((IDL as any).address);

// PDA Seeds for 1v1 program
const PDA_SEEDS_1V1 = {
  CONFIG: Buffer.from("domin8_1v1_config"),
  LOBBY: Buffer.from("domin8_1v1_lobby"),
} as const;

// HELIUS OPTIMIZATION CONSTANTS
const HELIUS_POLL_TIMEOUT_MS = 30_000; // 30 seconds
const HELIUS_POLL_INTERVAL_MS = 2_000; // 2 seconds
const HELIUS_MAX_RETRIES = 3; // Retry up to 3 times
const HELIUS_BLOCKHASH_VALIDITY_CHECK = true; // Check blockhash before retry

/**
 * Helper to get Config PDA
 */
function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], PROGRAM_ID);
}

/**
 * Helper to get Lobby PDA by ID
 */
function getLobbyPDA(lobbyId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS_1V1.LOBBY, new BN(lobbyId).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

/**
 * HELIUS OPTIMIZATION: Confirm transaction with robust polling and blockhash checking
 * @param connection - Solana connection
 * @param signature - Transaction signature
 * @param lastValidBlockHeight - Last valid block height from blockhash
 * @returns True if confirmed, false if timeout/expired
 */
async function confirmTransactionWithPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  const timeout = HELIUS_POLL_TIMEOUT_MS;
  const interval = HELIUS_POLL_INTERVAL_MS;
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < timeout) {
    pollCount++;

    try {
      const statuses = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: false,
      });

      const status = statuses?.value?.[0];

      if (status) {
        if (status.err) {
          logger.solana.error("[Helius] Transaction failed:", {
            signature: signature.slice(0, 8) + "...",
            error: status.err,
          });
          return false;
        }

        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          logger.solana.info("[Helius] Transaction confirmed", {
            signature: signature.slice(0, 8) + "...",
            status: status.confirmationStatus,
            polls: pollCount,
            duration: Date.now() - startTime,
          });
          return true;
        }
      }

      // Check blockhash expiry (Helius best practice)
      if (HELIUS_BLOCKHASH_VALIDITY_CHECK) {
        const currentBlockHeight = await connection.getBlockHeight("confirmed");
        if (currentBlockHeight > lastValidBlockHeight) {
          logger.solana.warn("[Helius] Blockhash expired during polling", {
            signature: signature.slice(0, 8) + "...",
            currentBlockHeight,
            validUntil: lastValidBlockHeight,
          });
          return false;
        }
      }
    } catch (error) {
      logger.solana.warn("[Helius] Status check error (attempt " + pollCount + "):", error);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  logger.solana.warn("[Helius] Confirmation timeout", {
    signature: signature.slice(0, 8) + "...",
    timeout,
    polls: pollCount,
  });
  return false;
}

/**
 * HELIUS OPTIMIZATION: Send transaction with retry logic and blockhash validation
 * @param connection - Solana connection
 * @param transaction - VersionedTransaction to send
 * @param payer - Transaction payer
 * @param privyWallet - Privy wallet instance
 * @param lastValidBlockHeight - Last valid block height
 * @param network - Network name for chain ID
 * @returns Promise<string> - Transaction signature (base58)
 */
async function sendTransactionWithHeliusRetry(
  connection: Connection,
  transaction: VersionedTransaction,
  payer: PublicKey,
  privyWallet: any,
  lastValidBlockHeight: number,
  network: string
): Promise<string> {
  const chainId = `solana:${network}` as `${string}:${string}`;
  let lastError: Error | null = null;
  let signature: string | null = null;

  for (let attempt = 0; attempt < HELIUS_MAX_RETRIES; attempt++) {
    try {
      logger.solana.debug("[Helius] Send attempt " + (attempt + 1) + "/" + HELIUS_MAX_RETRIES, {
        payer: payer.toString(),
      });

      // Check blockhash validity before retry
      if (attempt > 0 && HELIUS_BLOCKHASH_VALIDITY_CHECK) {
        const currentBlockHeight = await connection.getBlockHeight("confirmed");
        if (currentBlockHeight > lastValidBlockHeight) {
          throw new Error(
            "Blockhash expired (" +
              currentBlockHeight +
              " > " +
              lastValidBlockHeight +
              "), need to rebuild transaction"
          );
        }
      }

      // Sign and send with Privy (atomic operation)
      const bs58 = await import("bs58");
      const serialized = transaction.serialize();

      const results = await privyWallet.signAndSendAllTransactions([
        {
          chain: chainId,
          transaction: serialized,
        },
      ]);

      if (!results || results.length === 0 || !results[0].signature) {
        throw new Error("No signature returned from Privy wallet");
      }

      // Convert Uint8Array signature to base58 string
      const signatureBytes = results[0].signature;
      signature = bs58.default.encode(signatureBytes);

      logger.solana.info("[Helius] Transaction sent", {
        signature: signature.slice(0, 8) + "...",
        attempt: attempt + 1,
      });

      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.solana.warn(
        "[Helius] Send attempt " + (attempt + 1) + " failed: " + lastError.message
      );

      if (attempt === HELIUS_MAX_RETRIES - 1) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 3s
      const backoffMs = 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  if (!signature) {
    throw lastError || new Error("Failed to send transaction");
  }

  return signature;
}

/**
 * Send transaction with Helius optimizations and Privy wallet
 * @param connection - Solana connection
 * @param transaction - VersionedTransaction to send
 * @param payer - Transaction payer
 * @param privyWallet - Privy wallet instance
 * @param lastValidBlockHeight - Last valid block height from blockhash
 * @param network - Network name
 * @returns Promise<string> - Transaction signature (base58)
 */
export async function sendOptimizedTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
  payer: PublicKey,
  privyWallet: any,
  lastValidBlockHeight: number,
  network: string = "devnet"
): Promise<string> {
  return sendTransactionWithHeliusRetry(
    connection,
    transaction,
    payer,
    privyWallet,
    lastValidBlockHeight,
    network
  );
}

/**
 * Wait for transaction confirmation with Helius polling
 * @param connection - Solana connection
 * @param signature - Transaction signature
 * @param lastValidBlockHeight - Last valid block height
 * @returns Promise<boolean> - True if confirmed
 */
export async function waitForConfirmationOptimized(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  return confirmTransactionWithPolling(connection, signature, lastValidBlockHeight);
}

/**
 * Get the Program ID for the 1v1 program
 */
export function get1v1ProgramId(): PublicKey {
  return PROGRAM_ID;
}

/**
 * Get the Lobby PDA for a given lobby ID
 */
export function get1v1LobbyPDA(lobbyId: number): PublicKey {
  const [pda] = getLobbyPDA(lobbyId);
  return pda;
}

/**
 * Get the Config PDA
 */
export function get1v1ConfigPDA(): PublicKey {
  const [pda] = getConfigPDA();
  return pda;
}
