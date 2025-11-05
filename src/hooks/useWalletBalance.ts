/**
 * Optimized Wallet Balance Hook
 *
 * Fetches and maintains wallet balance with intelligent update triggers:
 * - Reuses shared connection (no new connection per fetch)
 * - Updates when prize distribution occurs (winner_prize goes from non-zero → 0)
 * - Updates when winner changes
 * - Falls back to periodic refresh (30s) for other balance changes
 *
 * Benefits:
 * - No connection overhead
 * - Real-time updates when prizes are sent
 * - Reduced unnecessary RPC calls
 *
 * Prize Detection Logic:
 * - Watches when winner_prize changes from non-zero to 0 (indicates prize was sent)
 * - Also watches when winner changes (new winner determined)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSharedConnection } from "../lib/sharedConnection";
import { logger } from "../lib/logger";
import { ActiveGameState } from "./useActiveGame";

interface UseWalletBalanceOptions {
  /** Wallet address to fetch balance for */
  walletAddress: string | null;
  /** Active game state (to detect prize distribution) */
  activeGame?: ActiveGameState | null;
  /** Fallback refresh interval in ms (default: 30000 = 30 seconds) */
  refreshInterval?: number;
}

export function useWalletBalance({
  walletAddress,
  activeGame,
  refreshInterval = 30000,
}: UseWalletBalanceOptions) {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const lastWinnerPrizeRef = useRef<string | undefined>(undefined);
  const lastWinnerRef = useRef<string | undefined>(undefined);

  // Fetch balance function
  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      setIsLoadingBalance(false);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const connection = getSharedConnection();
      const publicKey = new PublicKey(walletAddress);
      const lamports = await connection.getBalance(publicKey);
      const solBalance = lamports / LAMPORTS_PER_SOL;
      setBalance(solBalance);
      logger.ui.debug("[WalletBalance] ✅ Balance fetched:", {
        address: walletAddress.slice(0, 8) + "...",
        balance: solBalance,
      });
    } catch (error) {
      logger.ui.error("[WalletBalance] ❌ Failed to fetch balance:", error);
      setBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [walletAddress]);

  // Initial fetch when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      void fetchBalance();
    } else {
      setBalance(null);
      setIsLoadingBalance(false);
    }
  }, [walletAddress, fetchBalance]);

  // Smart refresh based on game state changes (prize distribution)
  useEffect(() => {
    if (!activeGame) return;

    const currentWinnerPrize = activeGame.winnerPrize?.toString();
    const currentWinner = activeGame.winner?.toString();

    // Detect if prize was sent: winner_prize went from non-zero to 0
    const prizeSent =
      lastWinnerPrizeRef.current !== undefined &&
      lastWinnerPrizeRef.current !== "0" &&
      currentWinnerPrize === "0";

    // Detect if winner_prize changed at all (including being set initially)
    const winnerPrizeChanged =
      lastWinnerPrizeRef.current !== undefined &&
      lastWinnerPrizeRef.current !== currentWinnerPrize;

    // Detect if winner changed
    const winnerChanged =
      lastWinnerRef.current !== undefined && lastWinnerRef.current !== currentWinner;

    // Update refs for next comparison
    lastWinnerPrizeRef.current = currentWinnerPrize;
    lastWinnerRef.current = currentWinner;

    // Trigger balance refresh if prize was sent or winner changed
    if (prizeSent || winnerChanged) {
      logger.ui.debug("[WalletBalance] 🎁 Prize state changed, refreshing balance", {
        prizeSent,
        winnerPrizeChanged,
        winnerChanged,
        previousWinnerPrize: lastWinnerPrizeRef.current,
        currentWinnerPrize,
        winner: currentWinner,
      });
      void fetchBalance();
    }
  }, [activeGame?.winnerPrize?.toString(), activeGame?.winner?.toString(), fetchBalance]);

  // Fallback periodic refresh for other balance changes (deposits, withdrawals, etc.)
  useEffect(() => {
    if (!walletAddress || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      logger.ui.debug("[WalletBalance] ⏰ Periodic refresh");
      void fetchBalance();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [walletAddress, refreshInterval, fetchBalance]);

  return {
    balance,
    isLoadingBalance,
    refetchBalance: fetchBalance,
  };
}
