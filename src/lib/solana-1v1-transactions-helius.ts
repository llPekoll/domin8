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

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import type { Domin81v1Prgm } from "../../target/types/domin8_1v1_prgm";
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
const HELIUS_SIMULATION_CU_LIMIT = 1_400_000; // Conservative limit for simulation
const HELIUS_CU_BUFFER_MULTIPLIER = 1.1; // 10% buffer on simulated CU
const HELIUS_PRIORITY_FEE_BUFFER = 1.2; // 20% buffer on priority fee
const HELIUS_POLL_TIMEOUT_MS = 30_000; // 30 seconds
const HELIUS_POLL_INTERVAL_MS = 2_000; // 2 seconds
const HELIUS_MAX_RETRIES = 3; // Retry up to 3 times
const HELIUS_BLOCKHASH_VALIDITY_CHECK = true; // Check blockhash before retry

// SWITCHBOARD RANDOMNESS CONSTANTS
const SWITCHBOARD_PROGRAM_IDS = {
  mainnet: new PublicKey("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"),
  devnet: new PublicKey("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2"),
} as const;

const SWITCHBOARD_QUEUE_IDS = {
  mainnet: new PublicKey("A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w"),
  devnet: new PublicKey("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7"),
} as const;

const SWITCHBOARD_RANDOMNESS_TIMEOUT_MS = 60_000; // 60 seconds for randomness to be revealed
const SWITCHBOARD_RANDOMNESS_POLL_INTERVAL_MS = 2_000; // Poll every 2 seconds

// Helper types
interface OptimizationMetrics {
  simulatedCU: number;
  optimizedCU: number;
  priorityFee: number;
  estimatedCost: number;
}

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
    [PDA_SEEDS_1V1.LOBBY, new BN(lobbyId).toBuffer("le", 8)],
    PROGRAM_ID
  );
}

/**
 * Helper to derive a randomness account address for Switchboard
 * This creates a deterministic address based on the lobby ID and program
 * The frontend must ensure this account is created/funded on Switchboard before game creation
 * 
 * @param lobbyId - Lobby ID (or use a timestamp/random value if not available yet)
 * @returns PublicKey - Derived randomness account address
 */
export async function deriveRandomnessAccountAddress(lobbyId: number | string): Promise<PublicKey> {
  // Use findProgramAddressSync with a short seed to avoid "Max seed length exceeded" error
  // Convert the ID to a buffer (max 32 bytes)
  const seed = typeof lobbyId === "string" 
    ? Buffer.from(lobbyId.substring(0, 31), "utf-8")  // Limit to 31 bytes for safety
    : Buffer.alloc(8);
  
  if (typeof lobbyId === "number") {
    seed.writeBigInt64LE(BigInt(lobbyId), 0);
  }

  try {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("randomness"), seed],
      PROGRAM_ID
    );
    return address;
  } catch (error) {
    logger.solana.warn("[Randomness] Failed to derive address, using fallback:", error);
    // Fallback: return a deterministic PublicKey based on the input
    const hash = Buffer.alloc(32);
    const seedStr = String(lobbyId);
    for (let i = 0; i < seedStr.length && i < 32; i++) {
      hash[i] = seedStr.charCodeAt(i);
    }
    return new PublicKey(hash);
  }
}

// ============================================================================
// SWITCHBOARD RANDOMNESS FUNCTIONS
// ============================================================================

/**
 * Helper to get the correct Switchboard Queue based on network
 * @param connection - Solana connection
 * @returns PublicKey of the appropriate Switchboard queue
 */
function getSwitchboardQueueId(connection: Connection): PublicKey {
  const endpoint = connection.rpcEndpoint;
  if (endpoint.includes("devnet")) {
    return SWITCHBOARD_QUEUE_IDS.devnet;
  }
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    // For local testing, use devnet queue
    return SWITCHBOARD_QUEUE_IDS.devnet;
  }
  // Default to mainnet
  return SWITCHBOARD_QUEUE_IDS.mainnet;
}

/**
 * Helper to get the correct Switchboard Program ID based on network
 * @param connection - Solana connection
 * @returns PublicKey of the appropriate Switchboard program
 */
function getSwitchboardProgramId(connection: Connection): PublicKey {
  const endpoint = connection.rpcEndpoint;
  if (endpoint.includes("devnet")) {
    return SWITCHBOARD_PROGRAM_IDS.devnet;
  }
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    // For local testing, use devnet program
    return SWITCHBOARD_PROGRAM_IDS.devnet;
  }
  // Default to mainnet
  return SWITCHBOARD_PROGRAM_IDS.mainnet;
}

/**
 * Create and commit a Switchboard randomness account
 * 
 * This function:
 * 1. Generates a new Keypair for the randomness account
 * 2. Creates the randomness account via Switchboard
 * 3. Builds a commit instruction that locks it to the current slot
 * 
 * @param connection - Solana connection
 * @param payer - Fee payer's public key
 * @returns Object containing randomness keypair, pubkey, and commit instruction
 */
export async function createAndCommitRandomnessAccount(
  connection: Connection,
  payer: PublicKey
): Promise<{
  randomnessKeypair: Keypair;
  randomnessPubkey: PublicKey;
  commitIx: TransactionInstruction;
}> {
  try {
    logger.solana.debug("[Switchboard] Creating and committing randomness account", {
      payer: payer.toString(),
    });

    // Get network-appropriate Switchboard program ID
    const sbProgramId = getSwitchboardProgramId(connection);
    
    // Dynamic import of Switchboard SDK
    const { Randomness } = await import("@switchboard-xyz/on-demand");
    
    // Create a minimal provider for Anchor compatibility
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: payer,
        signAllTransactions: async (txs: any) => txs,
        signTransaction: async (tx: any) => tx,
      } as any,
      { commitment: "confirmed" }
    );

    // Load the Switchboard program
    const sbProgram = await Program.at(sbProgramId, provider);

    // Get the queue for this network
    const queueId = getSwitchboardQueueId(connection);

    // Create a new randomness account keypair
    const randomnessKeypair = Keypair.generate();
    logger.solana.debug("[Switchboard] Generated randomness keypair", {
      pubkey: randomnessKeypair.publicKey.toString(),
    });

    // Create randomness account using Switchboard SDK
    // Note: This returns a Randomness wrapper and an instruction to create the account
    const [randomness] = await Randomness.create(sbProgram, randomnessKeypair, queueId);

    logger.solana.debug("[Switchboard] Created Randomness wrapper", {
      pubkey: randomness.pubkey.toString(),
    });

    // Build the commit instruction
    // This commits the randomness account to the current slot
    const commitIx = await randomness.commitIx(queueId);

    logger.solana.info("[Switchboard] Successfully created randomness account and built commit instruction", {
      randomnessPubkey: randomness.pubkey.toString(),
    });

    return {
      randomnessKeypair,
      randomnessPubkey: randomness.pubkey,
      commitIx,
    };
  } catch (error) {
    logger.solana.error("[Switchboard] Failed to create and commit randomness account:", error);
    throw new Error(`Failed to create Switchboard randomness account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Build and execute a reveal instruction for a committed randomness account
 * 
 * @param connection - Solana connection
 * @param randomnessPubkey - Public key of the randomness account to reveal
 * @returns Reveal instruction to be included in a transaction
 */
export async function buildRevealInstruction(
  connection: Connection,
  randomnessPubkey: PublicKey
): Promise<TransactionInstruction> {
  try {
    logger.solana.debug("[Switchboard] Building reveal instruction", {
      randomnessPubkey: randomnessPubkey.toString(),
    });

    // Get network-appropriate Switchboard program ID
    const sbProgramId = getSwitchboardProgramId(connection);

    // Dynamic import of Switchboard SDK
    const { Randomness } = await import("@switchboard-xyz/on-demand");

    // Create a minimal provider for Anchor compatibility
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: PublicKey.default,
        signAllTransactions: async (txs: any) => txs,
        signTransaction: async (tx: any) => tx,
      } as any,
      { commitment: "confirmed" }
    );

    // Load the Switchboard program
    const sbProgram = await Program.at(sbProgramId, provider);

    // Load the randomness account
    const randomness = new Randomness(sbProgram, randomnessPubkey);

    // Build the reveal instruction
    const revealIx = await randomness.revealIx();

    logger.solana.debug("[Switchboard] Built reveal instruction", {
      randomnessPubkey: randomnessPubkey.toString(),
    });

    return revealIx;
  } catch (error) {
    logger.solana.error("[Switchboard] Failed to build reveal instruction:", error);
    throw new Error(`Failed to build reveal instruction: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Wait for a randomness account to be revealed
 * Polls the randomness account until it's revealed (seed_slot != current slot)
 * 
 * @param connection - Solana connection
 * @param randomnessPubkey - Public key of the randomness account
 * @param timeout - Maximum time to wait in milliseconds (default: 60 seconds)
 * @returns True if randomness is revealed, false if timeout
 */
export async function waitForRandomnessRevealed(
  connection: Connection,
  randomnessPubkey: PublicKey,
  timeout: number = SWITCHBOARD_RANDOMNESS_TIMEOUT_MS
): Promise<boolean> {
  try {
    logger.solana.debug("[Switchboard] Waiting for randomness to be revealed", {
      randomnessPubkey: randomnessPubkey.toString(),
      timeoutMs: timeout,
    });

    const startTime = Date.now();
    const sbModule = await import("@switchboard-xyz/on-demand");
    const RandomnessAccountData = (sbModule as any).RandomnessAccountData;

    while (Date.now() - startTime < timeout) {
      try {
        // Fetch the account
        const accountInfo = await connection.getAccountInfo(randomnessPubkey);
        
        if (!accountInfo) {
          logger.solana.debug("[Switchboard] Randomness account not yet created");
          await new Promise((resolve) =>
            setTimeout(resolve, SWITCHBOARD_RANDOMNESS_POLL_INTERVAL_MS)
          );
          continue;
        }

        // Parse the randomness account data
        const randomnessData = RandomnessAccountData.parse(accountInfo.data);
        
        // Get current slot
        const clock = await connection.getSlot();

        // Check if revealed (seed_slot should NOT be the current slot)
        if (randomnessData.seed_slot !== clock) {
          logger.solana.info("[Switchboard] Randomness revealed", {
            seedSlot: randomnessData.seed_slot,
            currentSlot: clock,
          });
          return true;
        }

        logger.solana.debug("[Switchboard] Randomness not yet revealed, polling...", {
          seedSlot: randomnessData.seed_slot,
          currentSlot: clock,
        });
      } catch (parseError) {
        logger.solana.debug("[Switchboard] Error parsing randomness account, retrying...", {
          error: parseError,
        });
      }

      // Wait before polling again
      await new Promise((resolve) =>
        setTimeout(resolve, SWITCHBOARD_RANDOMNESS_POLL_INTERVAL_MS)
      );
    }

    logger.solana.warn("[Switchboard] Timeout waiting for randomness to be revealed");
    return false;
  } catch (error) {
    logger.solana.error("[Switchboard] Error waiting for randomness:", error);
    throw new Error(`Failed while waiting for randomness: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * HELIUS OPTIMIZATION: Simulate transaction to get exact compute units
 * @param connection - Solana connection
 * @param instructions - Transaction instructions
 * @param payer - Fee payer
 * @param blockhash - Recent blockhash
 * @param skipSimulation - If true, skip simulation and use conservative estimate (for external account dependencies)
 * @returns Optimized compute unit limit (with buffer)
 */
async function simulateForComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string,
  skipSimulation: boolean = false
): Promise<number> {
  try {
    logger.solana.debug("[Helius] Simulating transaction for compute units", {
      instructionCount: instructions.length,
      skipSimulation,
    });

    // Skip simulation if requested (e.g., for join_lobby with Switchboard randomness account)
    if (skipSimulation) {
      logger.solana.info("[Helius] Skipping simulation per request, using conservative estimate");
      return 100_000; // Conservative estimate for operations with external account dependencies
    }

    // Build test message with high CU limit for safety
    const testInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: HELIUS_SIMULATION_CU_LIMIT }),
      ...instructions,
    ];

    const testMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: testInstructions,
    }).compileToV0Message();

    const testTx = new VersionedTransaction(testMessage);

    // Simulate with sigVerify disabled (Helius best practice)
    const simulation = await connection.simulateTransaction(testTx, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });

    if (simulation.value.err) {
      // Check if this is an AccountNotFound error (common for external accounts like Switchboard randomness)
      const errorStr = String(simulation.value.err);
      if (errorStr.includes("AccountNotFound")) {
        logger.solana.info("[Helius] AccountNotFound during simulation (likely external account dependency), using conservative fallback", {
          error: simulation.value.err,
        });
        return 100_000; // Conservative estimate for operations with external account dependencies
      }

      logger.solana.warn("[Helius] Simulation error, using fallback CU", {
        error: simulation.value.err,
        logs: simulation.value.logs,
      });
      // Return fallback for VRF-heavy transactions (create_lobby uses VRF CPI)
      return 300_000; // Increased fallback for VRF operations
    }

    if (!simulation.value.unitsConsumed) {
      logger.solana.warn("[Helius] No unitsConsumed, using fallback CU");
      return 300_000;
    }

    // Apply buffer for safety (Helius recommendation: 10% buffer)
    const optimizedCU =
      simulation.value.unitsConsumed < 1000
        ? 1000
        : Math.ceil(simulation.value.unitsConsumed * HELIUS_CU_BUFFER_MULTIPLIER);

    logger.solana.debug("[Helius] Computed optimal CU", {
      consumed: simulation.value.unitsConsumed,
      withBuffer: optimizedCU,
    });

    return optimizedCU;
  } catch (error) {
    logger.solana.warn("[Helius] Simulation failed, using fallback CU:", error);
    return 300_000; // Fallback for VRF operations
  }
}

/**
 * HELIUS OPTIMIZATION: Get priority fee for specific instructions
 * Uses Helius Priority Fee API with transaction serialization method
 * @param connection - Solana connection
 * @param instructions - Transaction instructions
 * @param payer - Fee payer
 * @param blockhash - Recent blockhash
 * @returns Priority fee in microlamports
 */
async function getPriorityFeeForInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    logger.solana.debug("[Helius] Estimating priority fee");

    // Create temp transaction for fee estimation
    const tempMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tempTx = new VersionedTransaction(tempMessage);
    const bs58 = await import("bs58");
    const serializedTx = bs58.default.encode(tempTx.serialize());

    // Call Helius Priority Fee API
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-priority-fee",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: serializedTx,
            options: {
              recommended: true, // Use Helius recommended fee
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.result?.priorityFeeEstimate) {
      // Apply safety buffer (20% additional)
      const estimatedFee = Math.ceil(
        data.result.priorityFeeEstimate * HELIUS_PRIORITY_FEE_BUFFER
      );
      logger.solana.debug("[Helius] Priority fee estimated", {
        base: data.result.priorityFeeEstimate,
        withBuffer: estimatedFee,
      });
      return estimatedFee;
    }

    logger.solana.warn("[Helius] No fee estimate from API, using fallback");
    return 50_000; // Medium priority fallback
  } catch (error) {
    logger.solana.warn("[Helius] Priority fee estimation failed, using fallback:", error);
    return 50_000; // Fallback
  }
}

/**
 * HELIUS OPTIMIZATION: Build optimized transaction with all best practices
 * - Simulates for accurate compute units
 * - Estimates priority fee
 * - Adds compute budget instructions
 * @param connection - Solana connection
 * @param instructions - Core transaction instructions
 * @param payer - Fee payer
 * @returns Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }>
 */
async function buildOptimizedTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  skipSimulation: boolean = false
): Promise<{
  transaction: VersionedTransaction;
  metrics: OptimizationMetrics;
}> {
  try {
    logger.solana.debug("[Helius] Building optimized transaction", {
      instructionCount: instructions.length,
      payer: payer.toString(),
      skipSimulation,
    });

    // HELIUS BEST PRACTICE #1: Get blockhash with confirmed commitment
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    logger.solana.debug("[Helius] Got blockhash", {
      blockhash: blockhash.slice(0, 8) + "...",
      lastValidBlockHeight,
    });

    // HELIUS BEST PRACTICE #2: Simulate for compute units
    // Skip if requested (e.g., for join_lobby with Switchboard randomness account)
    const optimizedCU = await simulateForComputeUnits(
      connection,
      instructions,
      payer,
      blockhash,
      skipSimulation
    );

    // HELIUS BEST PRACTICE #3: Estimate priority fee
    const priorityFee = await getPriorityFeeForInstructions(
      connection,
      instructions,
      payer,
      blockhash
    );

    // Calculate estimated cost
    const baseFee = 5000; // 5,000 lamports base fee
    const priorityFeeCost = (optimizedCU / 1_000_000) * priorityFee;
    const estimatedCost = baseFee + priorityFeeCost;

    const metrics: OptimizationMetrics = {
      simulatedCU: optimizedCU,
      optimizedCU,
      priorityFee,
      estimatedCost,
    };

    logger.solana.debug("[Helius] Optimization metrics", metrics);

    // HELIUS BEST PRACTICE #4: Build final optimized transaction
    // Compute budget instructions MUST come first
    const optimizedInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: optimizedCU }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      ...instructions,
    ];

    // Create versioned transaction (v0 message format)
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: optimizedInstructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    logger.solana.info("[Helius] Optimized transaction built", {
      cu: optimizedCU,
      priorityFee,
      estimatedCost: (estimatedCost / 1e9).toFixed(6) + " SOL",
    });

    return { transaction, metrics };
  } catch (error) {
    logger.solana.error("[Helius] Failed to build optimized transaction:", error);
    throw error;
  }
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
      logger.solana.warn(
        "[Helius] Status check error (attempt " + pollCount + "):",
        error
      );
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
 * Build a create_lobby transaction with Helius optimization
 * 
 * @param playerA - Player A's public key
 * @param amount - Bet amount in lamports
 * @param characterA - Character ID (0-255)
 * @param mapId - Map ID (0-255)
 * @param randomnessAccount - Switchboard randomness account for this game
 * @param connection - Solana connection
 * @returns Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }>
 */
/**
 * Build a create_lobby transaction with Helius optimization and Switchboard randomness commitment
 * 
 * IMPORTANT: This function now handles the full Switchboard commit-reveal pattern:
 * 1. Creates a randomness account via Switchboard
 * 2. Builds and includes the commit instruction
 * 3. Builds the create_lobby instruction
 * 4. Combines them into an optimized transaction
 * 
 * @param playerA - Player A's public key
 * @param amount - Bet amount in lamports
 * @param characterA - Character ID (0-255)
 * @param mapId - Map ID (0-255)
 * @param connection - Solana connection
 * @returns Promise with transaction, metrics, and randomness pubkey for later reveal
 */
export async function buildCreateLobbyTransactionOptimized(
  playerA: PublicKey,
  amount: number,
  characterA: number,
  mapId: number,
  connection: Connection
): Promise<{
  transaction: VersionedTransaction;
  metrics: OptimizationMetrics;
  randomnessPubkey: PublicKey;
  randomnessKeypair: Keypair;
}> {
  try {
    logger.solana.info("[CreateLobby] Building optimized transaction with Switchboard randomness", {
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
    });

    // Step 1: Create and commit randomness account with Switchboard
    const { randomnessKeypair, randomnessPubkey, commitIx } =
      await createAndCommitRandomnessAccount(connection, playerA);

    logger.solana.debug("[CreateLobby] Switchboard randomness account created and committed", {
      randomnessPubkey: randomnessPubkey.toString(),
    });

    // Step 2: Build create_lobby instruction
    const [configPda] = getConfigPDA();

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerA,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Default position for simplicity: [0, 0]
    const positionA = [0, 0] as [number, number];

    logger.solana.debug("[CreateLobby] Building create_lobby instruction", {
      randomnessPubkey: randomnessPubkey.toString(),
    });

    // Build the create_lobby instruction
    const createLobbyIx = await program.methods
      .createLobby(new BN(amount), characterA, positionA, mapId)
      .accounts({
        config: configPda,
        playerA,
        randomnessAccount: randomnessPubkey,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Step 3: Build optimized transaction with BOTH commit and create_lobby instructions
    // Order is important: commit MUST come before create_lobby
    const { transaction, metrics } = await buildOptimizedTransaction(
      connection,
      [commitIx, createLobbyIx], // commitIx FIRST, then createLobbyIx
      playerA,
      true // skipSimulation - randomness account is external dependency
    );

    logger.solana.info("[CreateLobby] Optimized transaction created with Switchboard commit", {
      randomnessPubkey: randomnessPubkey.toString(),
      metrics,
    });

    return { transaction, metrics, randomnessPubkey, randomnessKeypair };
  } catch (error) {
    logger.solana.error("[CreateLobby] Failed to build optimized transaction:", error);
    throw error;
  }
}

/**
 * Build a join_lobby transaction with Helius optimization and Switchboard randomness reveal
 * 
 * IMPORTANT: This function is the second half of the Switchboard commit-reveal pattern:
 * 1. Accepts an optional revealIx instruction
 * 2. If provided, includes the reveal instruction FIRST
 * 3. Then includes the join_lobby instruction
 * 4. This ensures randomness is revealed before join_lobby uses it
 * 
 * @param playerB - Player B's public key
 * @param lobbyId - Lobby ID to join
 * @param characterB - Character ID (0-255)
 * @param lobbyPda - Lobby PDA address
 * @param connection - Solana connection
 * @param revealIx - Optional reveal instruction from Switchboard (must be called before join)
 * @returns Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }>
 */
export async function buildJoinLobbyTransactionOptimized(
  playerB: PublicKey,
  lobbyId: number,
  characterB: number,
  lobbyPda: PublicKey,
  connection: Connection,
  revealIx?: TransactionInstruction
): Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }> {
  try {
    logger.solana.debug("[JoinLobby] Building optimized transaction", {
      playerB: playerB.toString(),
      lobbyId,
      characterB,
      lobbyPda: lobbyPda.toString(),
      hasRevealIx: !!revealIx,
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

    // IMPORTANT: Derive the lobby PDA from lobbyId to ensure correctness
    // This prevents issues with incorrect PDAs stored in the database
    const [derivedLobbyPda] = getLobbyPDA(lobbyId);
    logger.solana.debug("[JoinLobby] Derived lobby PDA", {
      provided: lobbyPda.toString(),
      derived: derivedLobbyPda.toString(),
      match: derivedLobbyPda.equals(lobbyPda),
    });

    // Use the derived PDA instead of the provided one to ensure correctness
    const correctLobbyPda = derivedLobbyPda;

    // Create program instance with a wallet-like object for instruction building
    const provider = new AnchorProvider(connection, {
      publicKey: playerB,
    } as any);

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Fetch lobby to get Player A and randomness account
    logger.solana.debug("[JoinLobby] Fetching lobby account", { lobbyPda: correctLobbyPda.toString() });
    
    let lobbyAccount: any;
    let lobbyAccountInfo = await connection.getAccountInfo(correctLobbyPda);
    
    if (!lobbyAccountInfo) {
      throw new Error(`Lobby account not found at ${correctLobbyPda.toString()}`);
    }

    logger.solana.debug("[JoinLobby] Account info retrieved", {
      owner: lobbyAccountInfo.owner.toString(),
      lamports: lobbyAccountInfo.lamports,
      dataLength: lobbyAccountInfo.data.length,
    });

    try {
      // Try to decode the account data
      lobbyAccount = program.coder.accounts.decode("Domin81v1Lobby", lobbyAccountInfo.data);
      logger.solana.debug("[JoinLobby] Lobby account decoded successfully");
    } catch (decodeError) {
      logger.solana.error("[JoinLobby] Standard decode failed, attempting manual field extraction:", {
        error: decodeError,
        dataLength: lobbyAccountInfo.data.length,
      });
      
      // Manual parsing of Domin81v1Lobby account data
      // Structure: 8-byte discriminator, then fields in order
      try {
        const data = lobbyAccountInfo.data;
        let offset = 8; // Skip discriminator
        
        // Helper to read PublicKey (32 bytes)
        const readPublicKey = (): PublicKey => {
          const key = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;
          return key;
        };
        
        // Helper to read u64
        const readU64 = (): bigint => {
          const value = data.readBigUInt64LE(offset);
          offset += 8;
          return value;
        };
        
        // Helper to read option<T> - 1 byte flag + value if present
        const readOption = (isPublicKey: boolean): PublicKey | null => {
          const hasValue = data[offset] === 1;
          offset += 1;
          if (hasValue) {
            if (isPublicKey) {
              const key = new PublicKey(data.slice(offset, offset + 32));
              offset += 32;
              return key;
            }
          }
          return null;
        };
        
        // Parse fields in order (skip most, focus on what we need)
        const lobbyId = readU64();
        const playerA = readPublicKey();
        const playerB = readOption(true); // Skip playerB
        const amount = readU64();
        const randomnessAccount = readPublicKey();
        
        lobbyAccount = {
          lobbyId,
          playerA,
          playerB,
          amount,
          randomnessAccount,
        };
        
        logger.solana.debug("[JoinLobby] Lobby account parsed successfully (manual extraction)");
      } catch (manualDecodeError) {
        logger.solana.error("[JoinLobby] Manual extraction failed:", {
          error: manualDecodeError,
          dataLength: lobbyAccountInfo.data.length,
        });
        throw new Error(`Failed to decode lobby account: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
      }
    }

    const playerA = lobbyAccount.playerA;
    const randomnessAccount = lobbyAccount.randomnessAccount;
    logger.solana.debug("[JoinLobby] Lobby account details", {
      playerA: playerA.toString(),
      randomnessAccount: randomnessAccount.toString(),
      amount: lobbyAccount.amount.toString(),
    });

    // Default position for simplicity: [0, 0]
    const positionB = [0, 0] as [number, number];

    logger.solana.debug("[JoinLobby] Fetching treasury account for prize distribution");

    // Get treasury address from config
    let treasuryAddress: PublicKey;
    try {
      // Try to fetch using program.account first
      try {
        const configAccount = await program.account.domin81v1Config.fetch(configPda);
        treasuryAddress = configAccount.treasury;
        logger.solana.debug("[JoinLobby] Treasury address resolved (program fetch)", {
          treasury: treasuryAddress.toString(),
        });
      } catch (fetchError) {
        // Fallback: manually parse config account
        logger.solana.debug("[JoinLobby] Program fetch failed, attempting manual config parse");
        
        const configAccountInfo = await connection.getAccountInfo(configPda);
        if (!configAccountInfo) {
          throw new Error("Config account not found");
        }
        
        // Manual parsing of Domin81v1Config account data
        // Structure: 8-byte discriminator, then fields in order
        const data = configAccountInfo.data;
        let offset = 8; // Skip discriminator
        
        // admin: PublicKey (32 bytes)
        offset += 32;
        
        // treasury: PublicKey (32 bytes) - this is what we need
        treasuryAddress = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        
        logger.solana.debug("[JoinLobby] Treasury address resolved (manual parse)", {
          treasury: treasuryAddress.toString(),
        });
      }
    } catch (error) {
      logger.solana.error("[JoinLobby] Failed to fetch config account:", error);
      throw new Error("Failed to fetch 1v1 config account");
    }

    // Build the join_lobby instruction
    const joinLobbyIx = await program.methods
      .joinLobby(new BN(lobbyAccount.amount), characterB, positionB)
      .accounts({
        config: configPda,
        lobby: correctLobbyPda,
        playerA,
        playerB,
        payer: playerB,
        randomnessAccountData: randomnessAccount,
        treasury: treasuryAddress,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Build transaction instructions with optional reveal
    // IMPORTANT: revealIx must come FIRST, then joinLobbyIx
    const instructions = revealIx ? [revealIx, joinLobbyIx] : [joinLobbyIx];

    logger.solana.debug("[JoinLobby] Building transaction with instructions", {
      count: instructions.length,
      hasReveal: !!revealIx,
    });

    // Build optimized transaction with Helius best practices
    // Skip simulation for join_lobby because randomness_account may not exist during simulation
    const { transaction, metrics } = await buildOptimizedTransaction(
      connection,
      instructions,
      playerB,
      true // skipSimulation - randomness account is an external dependency
    );

    logger.solana.info("[JoinLobby] Optimized transaction created", {
      metrics,
      hasReveal: !!revealIx,
    });
    return { transaction, metrics };
  } catch (error) {
    logger.solana.error("[JoinLobby] Failed to build optimized transaction:", error);
    throw error;
  }
}

/**
 * Build a cancel_lobby transaction with Helius optimization
 * Allows Player A to cancel their lobby if no one has joined yet
 * 
 * @param playerA - Player A's public key
 * @param lobbyId - Lobby ID to cancel
 * @param lobbyPda - Lobby PDA address
 * @param connection - Solana connection
 * @returns Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }>
 */
export async function buildCancelLobbyTransactionOptimized(
  playerA: PublicKey,
  lobbyId: number,
  lobbyPda: PublicKey,
  connection: Connection
): Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }> {
  try {
    logger.solana.debug("[CancelLobby] Building optimized transaction", {
      playerA: playerA.toString(),
      lobbyId,
      lobbyPda: lobbyPda.toString(),
    });

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerA,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    logger.solana.debug("[CancelLobby] Building cancel_lobby instruction");

    // Build the cancel_lobby instruction
    const cancelLobbyIx = await program.methods
      .cancelLobby()
      .accounts({
        lobby: lobbyPda,
        playerA,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Build optimized transaction with Helius best practices
    const { transaction, metrics } = await buildOptimizedTransaction(
      connection,
      [cancelLobbyIx],
      playerA
    );

    logger.solana.debug("[CancelLobby] Optimized transaction created", metrics);
    return { transaction, metrics };
  } catch (error) {
    logger.solana.error("[CancelLobby] Failed to build optimized transaction:", error);
    throw error;
  }
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
  network: string = "mainnet-beta"
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
