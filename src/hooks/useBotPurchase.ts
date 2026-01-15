/**
 * React Hook for Bot Purchase Operations
 *
 * Handles purchasing bot tiers. Users can own multiple bots (one of each tier)
 * and switch between them. Payment is sent to the treasury wallet, then recorded in Convex.
 */

import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "./usePrivyWallet";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { getSharedConnection } from "~/lib/sharedConnection";
import bs58 from "bs58";

// Treasury wallet for bot purchases (from env)
const BOT_TREASURY_WALLET = new PublicKey(
  import.meta.env.VITE_BOT_TREASURY_WALLET || "11111111111111111111111111111111"
);

// Bot pricing in lamports
const BOT_PRICES = {
  rookie: 100_000_000, // 0.1 SOL
  pro: 500_000_000, // 0.5 SOL
  elite: 1_000_000_000, // 1.0 SOL
} as const;

export type BotTier = keyof typeof BOT_PRICES;

// Network from env
const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK || "devnet";

export function useBotPurchase() {
  const { connected, publicKey, walletAddress, solBalance } = usePrivyWallet();
  const { wallets } = useWallets();

  // Queries
  const activePurchase = useQuery(
    api.botPurchases.getUserBotPurchase,
    walletAddress ? { walletAddress } : "skip"
  );
  const allPurchases = useQuery(
    api.botPurchases.getAllUserBots,
    walletAddress ? { walletAddress } : "skip"
  );
  const tierInfo = useQuery(api.botPurchases.getBotTierInfo, {});

  // Mutations
  const recordPurchase = useMutation(api.botPurchases.purchaseBot);
  const setActiveBotMutation = useMutation(api.botPurchases.setActiveBot);

  // Helper to check if user owns a specific tier
  const ownsTier = useCallback(
    (tier: BotTier): boolean => {
      if (!allPurchases) return false;
      return allPurchases.some((p) => p.tier === tier);
    },
    [allPurchases]
  );

  /**
   * Send SOL to treasury and record purchase
   */
  const purchaseBot = useCallback(
    async (tier: BotTier): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!connected || !publicKey || !walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      const price = BOT_PRICES[tier];
      const priceSOL = price / LAMPORTS_PER_SOL;

      // Check balance
      if (solBalance !== null && solBalance < priceSOL + 0.001) {
        return {
          success: false,
          error: `Insufficient balance. Need ${priceSOL + 0.001} SOL, have ${solBalance.toFixed(3)} SOL`,
        };
      }

      // Check if already owns this specific tier
      if (ownsTier(tier)) {
        return {
          success: false,
          error: `You already own a ${tier} bot.`,
        };
      }

      try {
        logger.ui.debug(`[useBotPurchase] Purchasing ${tier} bot for ${priceSOL} SOL`);

        // Get Privy wallet
        const privyWallet = wallets.find((w) => w.address === walletAddress);
        if (!privyWallet) {
          return { success: false, error: "Privy wallet not found" };
        }

        // Build transfer transaction
        const connection = getSharedConnection();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: BOT_TREASURY_WALLET,
            lamports: price,
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
        logger.ui.debug(`[useBotPurchase] Transaction sent: ${signature}`);

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

        // Record purchase in database
        await recordPurchase({
          walletAddress,
          tier,
          transactionSignature: signature,
          purchaseAmount: price,
        });

        toast.success(`${tier.charAt(0).toUpperCase() + tier.slice(1)} Bot Purchased!`, {
          description: `Your bot is ready to configure.`,
        });

        return { success: true, signature };
      } catch (error) {
        logger.ui.error("[useBotPurchase] Purchase failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [connected, publicKey, walletAddress, solBalance, ownsTier, wallets, recordPurchase]
  );

  /**
   * Switch to a different bot tier (must own it)
   */
  const setActiveBot = useCallback(
    async (tier: BotTier): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      if (!ownsTier(tier)) {
        return { success: false, error: `You don't own a ${tier} bot.` };
      }

      try {
        await setActiveBotMutation({ walletAddress, tier });
        toast.success(`Switched to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Bot!`);
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotPurchase] Switch failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, ownsTier, setActiveBotMutation]
  );

  /**
   * Get price for a bot tier (full price, no upgrades)
   */
  const getPrice = useCallback(
    (tier: BotTier): { cost: number; costSOL: number } | null => {
      // If already owned, return null
      if (ownsTier(tier)) {
        return null;
      }

      return {
        cost: BOT_PRICES[tier],
        costSOL: BOT_PRICES[tier] / LAMPORTS_PER_SOL,
      };
    },
    [ownsTier]
  );

  return {
    // State
    connected,
    activePurchase,
    allPurchases: allPurchases || [],
    activeTier: (activePurchase?.tier as BotTier) || null,
    hasPurchased: !!activePurchase,
    tierInfo,
    prices: BOT_PRICES,

    // Actions
    purchaseBot,
    setActiveBot,
    getPrice,
    ownsTier,

    // Helper
    canAfford: (tier: BotTier) => {
      if (solBalance === null) return false;
      if (ownsTier(tier)) return false; // Already owned
      const priceSOL = BOT_PRICES[tier] / LAMPORTS_PER_SOL;
      return solBalance >= priceSOL + 0.001;
    },
  };
}
