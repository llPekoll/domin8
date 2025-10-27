import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef } from "react";

/**
 * Hook to get all bets for a specific round
 * Simple data fetching without animation triggers
 */
export function useGameBets(roundId: number) {
  const bets = useQuery((api as any).queries.getBetsForRound, { roundId });
  
  return {
    bets: bets || [],
    totalBets: bets?.length || 0,
    totalPot: bets?.reduce((sum: number, bet: any) => sum + bet.amount, 0) || 0,
    isLoading: bets === undefined,
  };
}

/**
 * Hook to detect new bets in real-time and trigger animations
 * Returns bets array and a callback ref that triggers when new bets arrive
 */
export function useRealtimeBets(roundId: number, onNewBet?: (bet: any) => void) {
  const bets = useQuery((api as any).queries.getBetsForRound, { roundId });
  const [prevBetCount, setPrevBetCount] = useState(0);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (!bets) return;

    // Skip animation on initial load
    if (isInitialLoad.current) {
      setPrevBetCount(bets.length);
      isInitialLoad.current = false;
      return;
    }

    // Detect new bets
    if (bets.length > prevBetCount) {
      const newBets = bets.slice(prevBetCount);
      
      console.log(`🎰 ${newBets.length} new bet(s) detected!`);
      
      // Trigger callback for each new bet
      newBets.forEach((bet: any) => {
        console.log(`  - ${bet.walletAddress}: ${bet.amount} SOL`);
        if (onNewBet) {
          onNewBet(bet);
        }
      });
      
      setPrevBetCount(bets.length);
    }
  }, [bets, prevBetCount, onNewBet]);

  return {
    bets: bets || [],
    totalBets: bets?.length || 0,
    totalPot: bets?.reduce((sum: number, bet: any) => sum + bet.amount, 0) || 0,
    isLoading: bets === undefined,
  };
}

/**
 * Hook to get bet statistics for a round
 * Includes total pot, unique players, average bet, etc.
 */
export function useRoundBetStats(roundId: number) {
  const stats = useQuery((api as any).queries.getRoundBetStats, { roundId });
  
  return {
    stats: stats || null,
    isLoading: stats === undefined,
  };
}

/**
 * Hook to get latest bets across all rounds (for bet ticker)
 * Shows recent betting activity globally
 */
export function useLatestBets(limit: number = 10) {
  const bets = useQuery((api as any).queries.getLatestBets, { limit });
  
  return {
    bets: bets || [],
    isLoading: bets === undefined,
  };
}

/**
 * Hook to get current game round with bets
 * Returns the latest round state and all its bets
 */
export function useCurrentRound() {
  const round = useQuery((api as any).queries.getCurrentRound);
  
  return {
    round: round || null,
    bets: round?.bets || [],
    isLoading: round === undefined,
  };
}

/**
 * Hook to get bets for a specific wallet
 * Shows user's betting history
 */
export function useBetsByWallet(walletAddress: string | null, limit: number = 50) {
  const bets = useQuery(
    walletAddress ? (api as any).queries.getBetsByWallet : undefined,
    walletAddress ? { walletAddress, limit } : "skip"
  );
  
  return {
    bets: bets || [],
    isLoading: bets === undefined,
  };
}
