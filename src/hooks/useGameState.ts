/**
 * Hook for accessing game state from Solana blockchain
 *
 * NOW USES: Direct blockchain subscription via active_game PDA
 * BEFORE: Convex polling (5 second delay)
 * BENEFIT: <1 second updates vs 5 seconds
 */
import { useActiveGame } from "./useActiveGame";
import { useMemo } from "react";

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
  // Subscribe directly to active_game PDA on Solana blockchain
  const { activeGame, isLoading, activeGamePDA } = useActiveGame();

  const loading = isLoading;
  const error = null;

  // Helper to convert blockchain status to expected format
  const formatStatus = (status: number): GameState["status"] => {
    // Status is a u8 in the smart contract: 0 = Open/Waiting, 1 = Closed/Finished
    if (status === 0) return "Waiting";
    if (status === 1) return "Finished";
    return "Waiting"; // Default to waiting
  };

  // Transform blockchain active_game to GameState interface
  const gameState: GameState | null = useMemo(() => {
    if (!activeGame) return null;

    return {
      roundId: activeGame.gameRound.toNumber(),
      status: formatStatus(activeGame.status),
      startTimestamp: activeGame.startDate.toNumber(),
      endTimestamp: activeGame.endDate.toNumber(),
      bets: activeGame.bets?.map((bet: any, index: number) => ({
        wallet: activeGame.wallets[bet.walletIndex]?.toString() || `Player ${index + 1}`,
        betAmount: bet.amount.toNumber() / 1_000_000_000, // Convert lamports to SOL
        timestamp: activeGame.startDate.toNumber(), // Approximate
      })) || [],
      initialPot: activeGame.totalDeposit.toNumber() / 1_000_000_000, // Convert lamports to SOL
      winner: activeGame.winner?.toString() || '',
      vrfRequestPubkey: '', // VRF request not stored directly in game account
      vrfSeed: activeGame.rand ? [activeGame.rand.toNumber()] : [], // Using rand field as seed
      randomnessFulfilled: activeGame.status === 1, // Game is finished when status = 1
      gameRoundPda: activeGamePDA?.toString() || "Unknown",
      vaultPda: "Derived from seeds",
    };
  }, [activeGame, activeGamePDA]);

  // Mock game config (these are program constants)
  const gameConfig: GameConfig = useMemo(
    () => ({
      authority: "Backend Wallet",
      treasury: "Treasury Wallet",
      houseFeeBasisPoints: 500, // 5%
      minBetLamports: 0.01, // 0.01 SOL
      vrfFeeLamports: 0.001, // 0.001 SOL
      vrfNetworkState: "Devnet",
      vrfTreasury: "VRF Treasury",
      gameLocked: activeGame?.status === 1 || false, // Locked when status = 1 (Closed)
    }),
    [activeGame]
  );

  const vaultBalance = -1; // Vault balance not tracked yet

  return {
    gameState,
    gameConfig,
    vaultBalance,
    loading,
    error,
    refresh: () => {
      console.log(
        "[DOMIN8] Direct blockchain subscription - no manual refresh needed (updates in <1s)"
      );
    },
  };
}
