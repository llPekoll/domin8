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
    logger.ui.warn("[Randomness] Failed to derive address, using fallback:", error);
    // Fallback: return a deterministic PublicKey based on the input
    const hash = Buffer.alloc(32);
    const seedStr = String(lobbyId);
    for (let i = 0; i < seedStr.length && i < 32; i++) {
      hash[i] = seedStr.charCodeAt(i);
    }
    return new PublicKey(hash);
  }
}

/**
 * HELIUS OPTIMIZATION: Simulate transaction to get exact compute units
 * @param connection - Solana connection
 * @param instructions - Transaction instructions
 * @param payer - Fee payer
 * @param blockhash - Recent blockhash
 * @returns Optimized compute unit limit (with buffer)
 */
async function simulateForComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    logger.solana.debug("[Helius] Simulating transaction for compute units", {
      instructionCount: instructions.length,
    });

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
  payer: PublicKey
): Promise<{
  transaction: VersionedTransaction;
  metrics: OptimizationMetrics;
}> {
  try {
    logger.solana.debug("[Helius] Building optimized transaction", {
      instructionCount: instructions.length,
      payer: payer.toString(),
    });

    // HELIUS BEST PRACTICE #1: Get blockhash with confirmed commitment
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    logger.solana.debug("[Helius] Got blockhash", {
      blockhash: blockhash.slice(0, 8) + "...",
      lastValidBlockHeight,
    });

    // HELIUS BEST PRACTICE #2: Simulate for compute units
    const optimizedCU = await simulateForComputeUnits(
      connection,
      instructions,
      payer,
      blockhash
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
export async function buildCreateLobbyTransactionOptimized(
  playerA: PublicKey,
  amount: number,
  characterA: number,
  mapId: number,
  randomnessAccount: PublicKey,
  connection: Connection
): Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }> {
  try {
    logger.ui.debug("[CreateLobby] Building optimized transaction", {
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
      randomnessAccount: randomnessAccount.toString(),
    });

    // Get Config PDA
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

    logger.ui.debug("[CreateLobby] Building instruction with Switchboard randomness account");

    // Build the create_lobby instruction
    const createLobbyIx = await program.methods
      .createLobby(new BN(amount), characterA, positionA, mapId)
      .accounts({
        config: configPda,
        playerA,
        randomnessAccount,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Build optimized transaction with Helius best practices
    const { transaction, metrics } = await buildOptimizedTransaction(
      connection,
      [createLobbyIx],
      playerA
    );

    logger.ui.debug("[CreateLobby] Optimized transaction created", metrics);
    return { transaction, metrics };
  } catch (error) {
    logger.ui.error("[CreateLobby] Failed to build optimized transaction:", error);
    throw error;
  }
}

/**
 * Build a join_lobby transaction with Helius optimization
 * 
 * @param playerB - Player B's public key
 * @param lobbyId - Lobby ID to join
 * @param characterB - Character ID (0-255)
 * @param lobbyPda - Lobby PDA address
 * @param connection - Solana connection
 * @returns Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }>
 */
export async function buildJoinLobbyTransactionOptimized(
  playerB: PublicKey,
  lobbyId: number,
  characterB: number,
  lobbyPda: PublicKey,
  connection: Connection
): Promise<{ transaction: VersionedTransaction; metrics: OptimizationMetrics }> {
  try {
    logger.ui.debug("[JoinLobby] Building optimized transaction", {
      playerB: playerB.toString(),
      lobbyId,
      characterB,
      lobbyPda: lobbyPda.toString(),
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerB,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Fetch lobby to get Player A and randomness account
    const lobbyAccount = await program.account.domin81v1Lobby.fetch(lobbyPda);
    const playerA = lobbyAccount.playerA;
    const randomnessAccount = lobbyAccount.randomnessAccount;

    // Default position for simplicity: [0, 0]
    const positionB = [0, 0] as [number, number];

    logger.ui.debug("[JoinLobby] Fetching treasury account for prize distribution");

    // Get treasury address from config
    let treasuryAddress: PublicKey;
    try {
      const configAccount = await program.account.domin81v1Config.fetch(configPda);
      treasuryAddress = configAccount.treasury;
      logger.ui.debug("[JoinLobby] Treasury address resolved", {
        treasury: treasuryAddress.toString(),
      });
    } catch (error) {
      logger.ui.error("[JoinLobby] Failed to fetch config account:", error);
      throw new Error("Failed to fetch 1v1 config account");
    }

    // Build the join_lobby instruction
    const joinLobbyIx = await program.methods
      .joinLobby(new BN(lobbyAccount.amount), characterB, positionB)
      .accounts({
        config: configPda,
        lobby: lobbyPda,
        playerA,
        playerB,
        payer: playerB,
        randomnessAccountData: randomnessAccount,
        treasury: treasuryAddress,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Build optimized transaction with Helius best practices
    const { transaction, metrics } = await buildOptimizedTransaction(
      connection,
      [joinLobbyIx],
      playerB
    );

    logger.ui.debug("[JoinLobby] Optimized transaction created", metrics);
    return { transaction, metrics };
  } catch (error) {
    logger.ui.error("[JoinLobby] Failed to build optimized transaction:", error);
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
