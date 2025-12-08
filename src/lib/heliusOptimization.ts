/**
 * Helius Transaction Optimization Helpers
 *
 * Shared utilities for Helius-optimized Solana transactions:
 * - Transaction simulation for accurate compute units
 * - Priority fee estimation via Helius API
 *
 * Used by: useGameContract.ts, useShopPurchase.ts
 */

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";

// Constants
const SIMULATION_CU_LIMIT = 1_400_000;
const CU_BUFFER_MULTIPLIER = 1.1; // 10% buffer
const PRIORITY_FEE_BUFFER = 1.2; // 20% buffer
const DEFAULT_CU_FALLBACK = 50_000; // For simple SOL transfers
const DEFAULT_PRIORITY_FEE = 50_000; // Medium priority fallback

/**
 * Simulate transaction to get exact compute units needed
 * @param connection - Solana connection
 * @param instructions - Transaction instructions (without compute budget)
 * @param payer - Fee payer public key
 * @param blockhash - Recent blockhash
 * @returns Optimized compute unit limit with 10% buffer
 */
export async function simulateForComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    const testInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: SIMULATION_CU_LIMIT }),
      ...instructions,
    ];

    const testMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: testInstructions,
    }).compileToV0Message();

    const testTx = new VersionedTransaction(testMessage);

    const simulation = await connection.simulateTransaction(testTx, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });

    if (simulation.value.err || !simulation.value.unitsConsumed) {
      return DEFAULT_CU_FALLBACK;
    }

    // Add 10% buffer
    return Math.ceil(simulation.value.unitsConsumed * CU_BUFFER_MULTIPLIER);
  } catch {
    return DEFAULT_CU_FALLBACK;
  }
}

/**
 * Get priority fee estimate for specific instructions via Helius API
 * @param connection - Solana connection (must be Helius RPC)
 * @param instructions - Transaction instructions
 * @param payer - Fee payer public key
 * @param blockhash - Recent blockhash
 * @returns Priority fee in microlamports with 20% buffer
 */
export async function getPriorityFeeForInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    const tempMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: instructions,
    }).compileToV0Message();

    const tempTx = new VersionedTransaction(tempMessage);
    const serializedTx = bs58.encode(tempTx.serialize());

    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-priority-fee",
        method: "getPriorityFeeEstimate",
        params: [{ transaction: serializedTx, options: { recommended: true } }],
      }),
    });

    const data = await response.json();
    if (data.result?.priorityFeeEstimate) {
      return Math.ceil(data.result.priorityFeeEstimate * PRIORITY_FEE_BUFFER);
    }
    return DEFAULT_PRIORITY_FEE;
  } catch {
    return DEFAULT_PRIORITY_FEE;
  }
}

/**
 * Run both optimizations in parallel for efficiency
 * @param connection - Solana connection
 * @param instructions - Core instructions (without compute budget)
 * @param payer - Fee payer public key
 * @param blockhash - Recent blockhash
 * @returns Object with optimizedCU and priorityFee
 */
export async function getHeliusOptimizations(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<{ optimizedCU: number; priorityFee: number }> {
  const [optimizedCU, priorityFee] = await Promise.all([
    simulateForComputeUnits(connection, instructions, payer, blockhash),
    getPriorityFeeForInstructions(connection, instructions, payer, blockhash),
  ]);

  return { optimizedCU, priorityFee };
}
