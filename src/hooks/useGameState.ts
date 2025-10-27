/**
 * Hook for accessing game state from Convex
 * Convex automatically syncs blockchain state every 5 seconds via cron job
 * 
 * This replaces direct blockchain polling with reactive Convex queries
 */
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface BetEntry {
  wallet: string;
  betAmount: number;
  timestamp: number;
}

export interface GameState {
  roundId: number;
  status: "Waiting" | "AwaitingWinnerRandomness" | "Finished";
  startTimestamp: number;
  endTimestamp: number;
  bets: BetEntry[];
  initialPot: number;
  winner: string | null;
  vrfRequestPubkey: string;
  vrfSeed: number[];
  randomnessFulfilled: boolean;
  gameRoundPda: string;
  vaultPda: string;
}

export interface GameConfig {
  authority: string;
  treasury: string;
  houseFeeBasisPoints: number;
  minBetLamports: number;
  vrfFeeLamports: number;
  vrfNetworkState: string;
  vrfTreasury: string;
  gameLocked: boolean;
}

export function useGameState() {
  // Query current game state from Convex (auto-synced from blockchain)
  const currentRoundState = useQuery(api.events.getCurrentRoundState);
  const stateStats = useQuery(api.events.getStateStats);

  const loading = currentRoundState === undefined || stateStats === undefined;
  const error = null;

  // Helper to convert Convex status to expected format
  const formatStatus = (status: string): GameState["status"] => {
    const statusMap: Record<string, GameState["status"]> = {
      waiting: "Waiting",
      awaitingWinnerRandomness: "AwaitingWinnerRandomness",
      finished: "Finished",
    };
    return statusMap[status] || "Waiting";
  };

  // Transform Convex gameRoundState to GameState interface
  const gameState: GameState | null = currentRoundState
    ? {
        roundId: currentRoundState.roundId,
        status: formatStatus(currentRoundState.status),
        startTimestamp: currentRoundState.startTimestamp,
        endTimestamp: currentRoundState.endTimestamp,
        bets: currentRoundState.betAmounts.map((amount: number, index: number) => ({
          wallet: `Player ${index + 1}`, // Wallet addresses not stored in gameRoundStates
          betAmount: amount / 1_000_000_000, // Convert lamports to SOL
          timestamp: currentRoundState.startTimestamp, // Approximate
        })),
        initialPot: currentRoundState.totalPot / 1_000_000_000, // Convert lamports to SOL
        winner: currentRoundState.winner,
        vrfRequestPubkey: currentRoundState.vrfRequestPubkey || "N/A",
        vrfSeed: currentRoundState.vrfSeed,
        randomnessFulfilled: currentRoundState.randomnessFulfilled,
        gameRoundPda: "Tracked via Convex",
        vaultPda: "Tracked via Convex",
      }
    : null;

  // Mock game config (these are program constants, consider fetching from blockchain if needed)
  const gameConfig: GameConfig = {
    authority: "Backend Wallet",
    treasury: "Treasury Wallet",
    houseFeeBasisPoints: 500, // 5%
    minBetLamports: 0.01, // 0.01 SOL
    vrfFeeLamports: 0.001, // 0.001 SOL
    vrfNetworkState: "Mainnet",
    vrfTreasury: "VRF Treasury",
    gameLocked: currentRoundState?.status !== "waiting",
  };

  const vaultBalance = -1; // Vault balance not tracked in Convex yet

  return { 
    gameState, 
    gameConfig, 
    vaultBalance, 
    loading, 
    error, 
    refresh: () => {
      console.log("Convex auto-syncs blockchain state every 5 seconds via cron job");
    } 
  };
}
