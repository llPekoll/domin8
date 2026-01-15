/**
 * React Hook for Bot Settings Management
 *
 * Handles bot configuration, toggling, and statistics.
 */

import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "./usePrivyWallet";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { getSharedConnection } from "~/lib/sharedConnection";
import bs58 from "bs58";

// Treasury wallet for budget refills (from env)
const BOT_TREASURY_WALLET = new PublicKey(
  import.meta.env.VITE_BOT_TREASURY_WALLET || "11111111111111111111111111111111"
);

const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || "devnet";

export interface BotConfiguration {
  // Rookie settings
  fixedBetAmount?: number;
  selectedCharacter?: number;
  budgetLimit?: number;

  // Pro settings
  betMin?: number;
  betMax?: number;
  stopLoss?: number;
  winStreakMultiplier?: number;
  cooldownRounds?: number;
  characterRotation?: number[];

  // Elite settings
  takeProfit?: number;
  martingaleEnabled?: boolean;
  antiMartingaleEnabled?: boolean;
  scheduleStart?: number;
  scheduleEnd?: number;
  smartSizing?: boolean;
  smartSizingThreshold?: number;
}

export function useBotSettings() {
  const { connected, publicKey, walletAddress, solBalance } = usePrivyWallet();
  const { wallets } = useWallets();

  // Queries
  const config = useQuery(
    api.botConfigurations.getConfiguration,
    walletAddress ? { walletAddress } : "skip"
  );

  const stats = useQuery(
    api.botConfigurations.getBotStats,
    walletAddress ? { walletAddress } : "skip"
  );

  const recentPerformance = useQuery(
    api.botConfigurations.getRecentBotPerformance,
    walletAddress ? { walletAddress, limit: 20 } : "skip"
  );

  // Mutations
  const saveConfigMutation = useMutation(api.botConfigurations.saveConfiguration);
  const toggleActiveMutation = useMutation(api.botConfigurations.toggleBotActive);
  const updateSessionSignerMutation = useMutation(api.botConfigurations.updateSessionSignerState);
  const refillBudgetMutation = useMutation(api.botConfigurations.refillBudget);

  /**
   * Save bot settings
   */
  const saveSettings = useCallback(
    async (settings: Partial<BotConfiguration>): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        await saveConfigMutation({
          walletAddress,
          config: settings,
        });

        toast.success("Settings saved");
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Save failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to save settings";
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, saveConfigMutation]
  );

  /**
   * Toggle bot active state
   */
  const toggleBot = useCallback(
    async (active: boolean): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        await toggleActiveMutation({
          walletAddress,
          isActive: active,
        });

        toast.success(active ? "Bot activated" : "Bot deactivated");
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Toggle failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to toggle bot";
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, toggleActiveMutation]
  );

  /**
   * Update session signer state
   */
  const updateSessionSigner = useCallback(
    async (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        await updateSessionSignerMutation({
          walletAddress,
          enabled,
        });

        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Session signer update failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to update session signer";
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, updateSessionSignerMutation]
  );

  /**
   * Refill bot budget by sending SOL to treasury
   */
  const refillBudget = useCallback(
    async (
      amountSOL: number
    ): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!connected || !publicKey || !walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

      if (amountLamports < 10_000_000) {
        return { success: false, error: "Minimum refill is 0.01 SOL" };
      }

      // Check balance
      if (solBalance !== null && solBalance < amountSOL + 0.001) {
        return {
          success: false,
          error: `Insufficient balance. Need ${amountSOL + 0.001} SOL, have ${solBalance.toFixed(3)} SOL`,
        };
      }

      try {
        logger.ui.debug(`[useBotSettings] Refilling budget with ${amountSOL} SOL`);

        // Get Privy wallet
        const privyWallet = wallets.find((w) => w.address === walletAddress);
        if (!privyWallet) {
          return { success: false, error: "Privy wallet not found" };
        }

        // Build transfer transaction
        const connection = getSharedConnection();
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: BOT_TREASURY_WALLET,
            lamports: amountLamports,
          })
        );

        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = publicKey;

        // Sign and send via Privy
        const chainId = `solana:${SOLANA_NETWORK}` as `${string}:${string}`;
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        const result = await privyWallet.signAndSendAllTransactions([
          {
            chain: chainId,
            transaction: serialized,
          },
        ]);

        if (!result || result.length === 0 || !result[0].signature) {
          return { success: false, error: "Transaction failed - no signature returned" };
        }

        const signature = bs58.encode(result[0].signature);
        logger.ui.debug(`[useBotSettings] Refill transaction sent: ${signature}`);

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight,
          },
          "confirmed"
        );

        if (confirmation.value.err) {
          return {
            success: false,
            error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
          };
        }

        // Record refill in database
        await refillBudgetMutation({
          walletAddress,
          additionalBudget: amountLamports,
          transactionSignature: signature,
        });

        toast.success(`Budget refilled with ${amountSOL} SOL`);
        return { success: true, signature };
      } catch (error) {
        logger.ui.error("[useBotSettings] Refill failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [connected, publicKey, walletAddress, solBalance, wallets, refillBudgetMutation]
  );

  // Computed values
  const isActive = config?.isActive ?? false;
  const sessionSignerEnabled = config?.sessionSignerEnabled ?? false;
  const tier = config?.tier ?? null;

  const budgetInfo = {
    limit: config?.budgetLimit ?? 0,
    spent: config?.currentSpent ?? 0,
    remaining: (config?.budgetLimit ?? 0) - (config?.currentSpent ?? 0),
    limitSOL: (config?.budgetLimit ?? 0) / LAMPORTS_PER_SOL,
    spentSOL: (config?.currentSpent ?? 0) / LAMPORTS_PER_SOL,
    remainingSOL: ((config?.budgetLimit ?? 0) - (config?.currentSpent ?? 0)) / LAMPORTS_PER_SOL,
    percentUsed:
      config?.budgetLimit && config.budgetLimit > 0
        ? ((config.currentSpent ?? 0) / config.budgetLimit) * 100
        : 0,
  };

  return {
    // State
    config,
    isActive,
    sessionSignerEnabled,
    tier,
    budgetInfo,

    // Stats
    stats,
    recentPerformance,

    // Actions
    saveSettings,
    toggleBot,
    updateSessionSigner,
    refillBudget,

    // Helpers
    canActivate: sessionSignerEnabled && budgetInfo.remaining > 0,
  };
}
