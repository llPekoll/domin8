/**
 * Shared Solana Connection Singleton
 *
 * Provides a single Connection instance that's reused across the application
 * to avoid creating multiple connections and wasting resources.
 *
 * Benefits:
 * - Single connection instance regardless of component count
 * - Reduced memory footprint and network overhead
 * - Consistent RPC endpoint usage
 *
 * Usage:
 * ```typescript
 * import { getSharedConnection } from './lib/sharedConnection';
 *
 * const connection = getSharedConnection();
 * const balance = await connection.getBalance(publicKey);
 * ```
 */

import { Connection } from "@solana/web3.js";
import { getSolanaRpcUrl } from "./utils";
import { logger } from "./logger";

/**
 * Singleton connection instance
 */
let sharedConnectionInstance: Connection | null = null;

/**
 * Get or create shared Solana connection
 * @returns Shared Connection instance
 */
export function getSharedConnection(): Connection {
  if (!sharedConnectionInstance) {
    const rpcUrl = getSolanaRpcUrl();
    sharedConnectionInstance = new Connection(rpcUrl, "confirmed");
    logger.solana.debug("[SharedConnection] 🆕 Created singleton instance", {
      endpoint: rpcUrl,
    });
  }
  return sharedConnectionInstance;
}

/**
 * Reset shared connection instance (useful for testing or network changes)
 */
export function resetSharedConnection() {
  sharedConnectionInstance = null;
  logger.solana.debug("[SharedConnection] 🔄 Singleton reset");
}
