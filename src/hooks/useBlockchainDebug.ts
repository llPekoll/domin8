/**
 * Hook for debugging game state from Convex
 * Convex automatically syncs blockchain state every 5 seconds via cron job
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface BlockchainDebugState {
  // Connection info
  connected: boolean;
  rpcEndpoint: string;
  programId: string;

  // Account states (from Convex gameRoundStates table)
  gameConfig: any | null;
  gameCounter: any | null;
  gameRound: any | null;
  vault: { balance: number; address: string } | null;

  // Derived info
  currentRoundId: number;
  gameRoundPDA: string;
  gameExists: boolean;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
}

export function useBlockchainDebug(): BlockchainDebugState {
  // Query current game state from Convex (synced from blockchain every 5s)
  const currentRoundState = useQuery(api.events.getCurrentRoundState);
  const stateStats = useQuery(api.events.getStateStats);

  const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "http://127.0.0.1:8899";
  const programId =
    import.meta.env.VITE_GAME_PROGRAM_ID || "93swWR5KYURGFWhDbgat9HxRdJAS5pQKssPffnj9bfXK";

  const isLoading = currentRoundState === undefined || stateStats === undefined;
  const error = null;

  // Convert Convex status string to Anchor enum format
  const formatStatusForAnchor = (status: string) => {
    const statusMap: Record<string, any> = {
      waiting: { waiting: {} },
      awaitingWinnerRandomness: { awaitingWinnerRandomness: {} },
      finished: { finished: {} },
    };
    return statusMap[status] || { waiting: {} };
  };

  // Transform Convex gameRoundState to match expected interface
  const gameRound = currentRoundState
    ? {
        roundId: currentRoundState.roundId,
        status: formatStatusForAnchor(currentRoundState.status),
        startTimestamp: currentRoundState.startTimestamp,
        endTimestamp: currentRoundState.endTimestamp,
        betCount: currentRoundState.betCount,
        totalPot: currentRoundState.totalPot / 1_000_000_000, // Convert lamports to SOL
        betAmounts: currentRoundState.betAmounts,
        winner: currentRoundState.winner || "Not determined",
        vrfRequestPubkey: currentRoundState.vrfRequestPubkey || "N/A",
        randomnessFulfilled: currentRoundState.randomnessFulfilled,
        winningBetIndex: currentRoundState.winningBetIndex,
      }
    : null;

  // Mock game config (these are program constants, not in Convex)
  const gameConfig = {
    authority: "Backend Wallet",
    treasury: "Treasury Wallet",
    minBetLamports: 10_000_000, // 0.01 SOL
    houseFeeBasisPoints: 500, // 5%
    betsLocked: currentRoundState?.status !== "waiting",
    smallGameDurationConfig: {
      waitingPhaseDuration: 30,
    },
  };

  return {
    connected: true,
    rpcEndpoint: rpcUrl,
    programId,
    gameConfig,
    gameCounter: { currentRoundId: stateStats?.latestRoundId || 0 },
    gameRound,
    vault: { balance: 0, address: "Vault PDA (not tracked in Convex)" },
    currentRoundId: stateStats?.latestRoundId || 0,
    gameRoundPDA: "Tracked via Convex",
    gameExists: currentRoundState !== null,
    isLoading,
    error,
    refresh: async () => {
      // Convex queries auto-refresh reactively
      console.log("Convex auto-syncs blockchain state every 5 seconds via cron job");
    },
  };
}
