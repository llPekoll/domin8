/**
 * Shared WebSocket Subscription Manager
 *
 * Implements a singleton pattern to manage a single WebSocket connection to the active_game PDA,
 * shared across all users. This prevents rate limiting issues (429 errors) and reduces RPC costs.
 *
 * Benefits:
 * - 1 WebSocket connection regardless of user count (1000 users = 1 connection)
 * - Sub-second updates maintained (~200-500ms)
 * - Auto-connect when first user subscribes
 * - Auto-disconnect when last user leaves
 * - Cached data for instant delivery to new subscribers
 *
 * Usage:
 * ```typescript
 * const sharedSub = getSharedGameSubscription(connection, activeGamePDA, program);
 * const unsubscribe = sharedSub.subscribe((accountInfo) => {
 *   // Handle account updates
 * });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { logger } from "./logger";

type AccountUpdateCallback = (accountInfo: AccountInfo<Buffer>) => void;

/**
 * Manages a shared WebSocket subscription to the active_game PDA
 */
class SharedGameSubscription {
  private connection: Connection;
  private activeGamePDA: PublicKey;
  // private program: Program; // Kept for future use (e.g., decoding)
  private subscriptionId: number | null = null;
  private subscribers: Set<AccountUpdateCallback> = new Set();
  private currentData: AccountInfo<Buffer> | null = null;
  private isConnecting: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly POLL_INTERVAL_MS = 5000; // Fallback poll every 5s

  constructor(connection: Connection, activeGamePDA: PublicKey, program: Program) {
    this.connection = connection;
    this.activeGamePDA = activeGamePDA;
    // this.program = program; // Kept for future use
    void program; // Suppress unused parameter warning
  }

  /**
   * Subscribe to game updates
   * @param callback Function to call when game state updates
   * @returns Unsubscribe function
   */
  subscribe(callback: AccountUpdateCallback): () => void {
    this.subscribers.add(callback);

    // Send cached data immediately if available
    if (this.currentData) {
      try {
        callback(this.currentData);
      } catch (err) {
        logger.solana.error("[SharedSub] Callback error:", err);
      }
    }

    // Connect if first subscriber
    if (this.subscribers.size === 1 && !this.subscriptionId && !this.isConnecting) {
      void this.connect();
    }

    logger.solana.debug("[SharedSub] 📈 Subscriber added", {
      totalSubscribers: this.subscribers.size,
      hasWebSocket: !!this.subscriptionId,
    });

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);

      logger.solana.debug("[SharedSub] 📉 Subscriber removed", {
        totalSubscribers: this.subscribers.size,
      });

      // Disconnect if no more subscribers
      if (this.subscribers.size === 0) {
        this.disconnect();
      }
    };
  }

  /**
   * Get current cached data (if available)
   */
  getCurrentData(): AccountInfo<Buffer> | null {
    return this.currentData;
  }

  /**
   * Get current subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Connect WebSocket to active_game PDA
   */
  private async connect() {
    if (this.subscriptionId || this.isConnecting) return;

    this.isConnecting = true;

    try {
      logger.solana.debug("[SharedSub] 🔌 Connecting WebSocket...", {
        activeGamePDA: this.activeGamePDA.toBase58(),
        endpoint: this.connection.rpcEndpoint,
      });

      // Fetch current state first
      console.log("🔴🔴🔴 [PEKO_DEBUG SharedSub] Fetching initial account info for PDA:", this.activeGamePDA.toBase58());
      const accountInfo = await this.connection.getAccountInfo(this.activeGamePDA);
      console.log("🔴🔴🔴 [PEKO_DEBUG SharedSub] Initial fetch result:", {
        hasData: !!accountInfo,
        dataLength: accountInfo?.data?.length ?? 0,
        owner: accountInfo?.owner?.toBase58() ?? "NULL",
      });
      if (accountInfo) {
        this.currentData = accountInfo;
        this.notifySubscribers(accountInfo);
      }

      // Setup WebSocket subscription
      this.subscriptionId = this.connection.onAccountChange(
        this.activeGamePDA,
        (accountInfo) => {
          this.currentData = accountInfo;
          this.notifySubscribers(accountInfo);

          logger.solana.debug("[SharedSub] 🔄 Game state updated", {
            dataLength: accountInfo.data.length,
            subscriberCount: this.subscribers.size,
          });
        },
        "confirmed"
      );

      logger.solana.debug("[SharedSub] ✅ WebSocket connected", {
        subscriptionId: this.subscriptionId,
        subscriberCount: this.subscribers.size,
      });

      // Start fallback polling to catch dropped WebSocket updates
      this.startPolling();
    } catch (error) {
      logger.solana.error("[SharedSub] ❌ Failed to connect:", error);
      this.subscriptionId = null;
      // Still start polling as fallback even if WebSocket fails
      this.startPolling();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Start fallback polling (catches dropped WebSocket updates)
   */
  private startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      try {
        const accountInfo = await this.connection.getAccountInfo(this.activeGamePDA);
        console.log("🔴🔴🔴 [PEKO_DEBUG SharedSub] Poll result:", {
          hasData: !!accountInfo,
          dataLength: accountInfo?.data?.length ?? 0,
          currentDataLength: this.currentData?.data?.length ?? 0,
        });
        if (!accountInfo) return;

        // Only notify if data actually changed
        if (
          !this.currentData ||
          !accountInfo.data.equals(this.currentData.data)
        ) {
          logger.solana.debug("[SharedSub] 🔄 Poll detected change (WebSocket may have missed it)");
          this.currentData = accountInfo;
          this.notifySubscribers(accountInfo);
        }
      } catch (err) {
        logger.solana.error("[SharedSub] ❌ Poll error:", err);
      }
    }, SharedGameSubscription.POLL_INTERVAL_MS);

    logger.solana.debug("[SharedSub] ⏱️ Fallback polling started");
  }

  /**
   * Stop fallback polling
   */
  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.solana.debug("[SharedSub] ⏱️ Fallback polling stopped");
    }
  }

  /**
   * Disconnect WebSocket
   */
  private disconnect() {
    if (this.subscriptionId === null) return;

    logger.solana.debug("[SharedSub] 🔌 Disconnecting WebSocket...", {
      subscriptionId: this.subscriptionId,
    });

    void this.connection.removeAccountChangeListener(this.subscriptionId);
    this.subscriptionId = null;
    this.stopPolling();

    logger.solana.debug("[SharedSub] ✅ WebSocket disconnected");
  }

  /**
   * Notify all subscribers of account update
   */
  private notifySubscribers(accountInfo: AccountInfo<Buffer>) {
    for (const callback of this.subscribers) {
      try {
        callback(accountInfo);
      } catch (err) {
        logger.solana.error("[SharedSub] ❌ Subscriber callback error:", err);
      }
    }
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

/**
 * Singleton instance of SharedGameSubscription
 */
let sharedSubscriptionInstance: SharedGameSubscription | null = null;

/**
 * Get or create shared game subscription instance
 * @param connection Solana connection
 * @param activeGamePDA Public key of active_game PDA
 * @param program Anchor program instance
 * @returns Shared subscription instance
 */
export function getSharedGameSubscription(
  connection: Connection,
  activeGamePDA: PublicKey,
  program: Program
): SharedGameSubscription {
  if (!sharedSubscriptionInstance) {
    sharedSubscriptionInstance = new SharedGameSubscription(connection, activeGamePDA, program);
    logger.solana.debug("[SharedSub] 🆕 Created singleton instance");
  }
  return sharedSubscriptionInstance;
}

/**
 * Reset shared subscription instance (useful for testing or reconnection)
 */
export function resetSharedGameSubscription() {
  sharedSubscriptionInstance = null;
  logger.solana.debug("[SharedSub] 🔄 Singleton reset");
}
