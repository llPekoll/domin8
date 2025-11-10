/**
 * Hook for subscribing to active_game PDA on Solana blockchain
 *
 * This replaces Convex polling with direct blockchain subscription
 * Updates in <1 second vs 5 seconds with Convex
 *
 * Based on risk.fun pattern: useJackpot.ts (lines 108-273)
 */
import { useMemo, useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { usePrivyWallet } from "./usePrivyWallet";
import { useAssets } from "../contexts/AssetsContext";
import idl from "../../target/idl/domin8_prgm.json";
import { logger } from "../lib/logger";
import { getSharedGameSubscription } from "../lib/sharedGameSubscription";
import { getSharedConnection } from "../lib/sharedConnection";

// Bet info structure from smart contract
export interface BetInfo {
  walletIndex: number;
  amount: BN;
  skin: number;
  position: [number, number];
}

// Match Domin8Game struct from smart contract (risk-based architecture)
export interface ActiveGameState {
  gameRound: BN; // Changed from roundId
  startDate: BN; // Changed from startTimestamp
  endDate: BN; // Changed from endTimestamp
  totalDeposit: BN; // Changed from totalPot
  rand: BN;
  userCount: BN;
  force: number[];
  status: number; // 0 = open, 1 = closed (simplified from enum)
  winner: PublicKey | null;
  winnerPrize: BN;
  winningBetIndex: BN | null;
  wallets: PublicKey[]; // NEW: Unique wallet addresses
  bets: BetInfo[]; // NEW: Array of bet info structs
  map: number; // Map/background ID (0-255)

  // Computed properties for backward compatibility
  roundId?: BN;
  startTimestamp?: BN;
  endTimestamp?: BN;
  totalPot?: BN;
  betCount?: number;
  betAmounts?: BN[];
  betSkin?: number[];
  betPosition?: [number, number][];
}

// Transform raw game data to include backward-compatible computed properties
function transformGameData(raw: any, mapData?: any): ActiveGameState {
  const bets: BetInfo[] = raw.bets || [];

  return {
    ...raw,
    // Add computed properties for backward compatibility
    roundId: raw.gameRound,
    startTimestamp: raw.startDate,
    endTimestamp: raw.endDate,
    totalPot: raw.totalDeposit,
    betCount: bets.length,
    betAmounts: bets.map((b: BetInfo) => b.amount),
    betSkin: bets.map((b: BetInfo) => b.skin),
    betPosition: bets.map((b: BetInfo) => b.position),
    // Override map with full map object if available
    map: mapData || raw.map,
  };
}

export function useActiveGame() {
  const { walletAddress, wallet } = usePrivyWallet();
  const { getMapById } = useAssets();

  // Use shared connection instance
  const connection = useMemo(() => getSharedConnection(), []);
  const [activeGame, setActiveGame] = useState<ActiveGameState | null>(null);
  const [rawGameData, setRawGameData] = useState<any>(null);

  // Client-side map lookup (from shared context, no backend query)
  const mapData = useMemo(() => {
    if (rawGameData?.map === undefined) return null;
    return getMapById(rawGameData.map);
  }, [rawGameData?.map, getMapById]);

  // Debug log when map lookup changes
  useEffect(() => {
    logger.solana.debug("[DOMIN8] 🗺️ Map lookup result changed:", {
      skipped: rawGameData?.map === undefined,
      requestedMapId: rawGameData?.map,
      mapDataReceived: !!mapData,
      mapData,
    });
  }, [mapData, rawGameData?.map]);

  const [isLoading, setIsLoading] = useState(false);

  // Create Anchor program instance (read-only if no wallet, full access with wallet)
  const program = useMemo(() => {
    try {
      // If no wallet, create read-only program for spectating
      if (!walletAddress || !wallet) {
        logger.solana.debug("[DOMIN8] Creating read-only program for spectating");
        const provider = {
          connection,
        };
        return new Program(idl as any, provider as any);
      }

      // With wallet, create full program for transactions
      logger.solana.debug("[DOMIN8] Creating full program with wallet");
      const walletAdapter = {
        publicKey: new PublicKey(walletAddress),
        signTransaction: async (tx: any) => {
          if (!wallet?.signTransaction) {
            throw new Error("Wallet does not support signing transactions");
          }
          return await wallet.signTransaction(tx);
        },
        signAllTransactions: async (txs: any[]) => {
          if (!wallet?.signTransaction) {
            throw new Error("Wallet does not support signing transactions");
          }
          const signedTxs: any[] = [];
          for (const tx of txs) {
            signedTxs.push(await wallet.signTransaction(tx));
          }
          return signedTxs;
        },
      };

      const provider = {
        connection,
        wallet: walletAdapter,
        publicKey: new PublicKey(walletAddress),
      };

      return new Program(idl as any, provider as any);
    } catch (err) {
      logger.solana.error("[DOMIN8] Failed to create program:", err);
      return null;
    }
  }, [walletAddress, connection, wallet]);

  // Derive active_game PDA (seeds: [b"active_game"])
  const activeGamePDA = useMemo(() => {
    if (!program) return null;

    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("active_game")], program.programId);
    return pda;
  }, [program]);

  // Enrich raw game data with map data from Convex when available
  useEffect(() => {
    logger.solana.debug("[DOMIN8] 🔄 Map enrichment effect triggered", {
      hasRawGameData: !!rawGameData,
      rawMapValue: rawGameData?.map,
      mapDataLoading: mapData === undefined,
      hasMapData: !!mapData,
      mapData,
    });

    if (!rawGameData) {
      logger.solana.debug("[DOMIN8] No raw game data, clearing active game");
      setActiveGame(null);
      return;
    }

    // Transform game data with enriched map (or just the raw map number if map data not loaded yet)
    const enrichedGame = transformGameData(rawGameData, mapData);

    logger.solana.debug("[DOMIN8] 🎨 Game data enriched with map:", {
      rawMapNumber: rawGameData.map,
      hasMapData: !!mapData,
      mapBackground: mapData?.background,
      enrichedMapType: typeof enrichedGame.map,
      enrichedMapValue: enrichedGame.map,
      fullEnrichedGame: enrichedGame,
    });

    setActiveGame(enrichedGame);
  }, [rawGameData, mapData]);

  // Fetch and subscribe to active_game using shared WebSocket
  useEffect(() => {
    if (!program || !activeGamePDA || !connection) {
      logger.solana.debug("[DOMIN8] ⚠️ Missing dependencies for game fetch", {
        hasProgram: !!program,
        hasActiveGamePDA: !!activeGamePDA,
        hasConnection: !!connection,
      });
      setRawGameData(null);
      setActiveGame(null);
      return;
    }

    logger.solana.debug("[DOMIN8] 🚀 Starting active_game subscription (shared)", {
      programId: program.programId.toBase58(),
      activeGamePDA: activeGamePDA.toBase58(),
      connectionEndpoint: connection.rpcEndpoint,
    });

    setIsLoading(true);

    // Get shared subscription manager
    const sharedSubscription = getSharedGameSubscription(connection, activeGamePDA, program);

    // Check for cached data for instant display
    const cachedData = sharedSubscription.getCurrentData();
    if (cachedData) {
      try {
        logger.solana.debug("[DOMIN8] 💾 Using cached data from shared subscription");
        const decodedGameData = (program.coder.accounts as any).decode("domin8Game", cachedData.data);
        setRawGameData(decodedGameData);
        setIsLoading(false);
      } catch (err) {
        logger.solana.error("[DOMIN8] Failed to decode cached data:", err);
      }
    }

    // Subscribe to updates via shared manager
    const unsubscribe = sharedSubscription.subscribe((accountInfo) => {
      try {
        if (accountInfo.data.length > 0) {
          const decodedGameData = (program.coder.accounts as any).decode("domin8Game", accountInfo.data);
          setRawGameData(decodedGameData);
          setIsLoading(false);
          logger.solana.debug("[DOMIN8] 🔄 Active game updated (via shared subscription):", decodedGameData);
        } else {
          setRawGameData(null);
          setActiveGame(null);
          setIsLoading(false);
          logger.solana.warn("[DOMIN8] ⚠️ Active game account is empty");
        }
      } catch (decodeError) {
        logger.solana.error("[DOMIN8] ❌ Failed to decode game data:", decodeError);
        setRawGameData(null);
        setActiveGame(null);
        setIsLoading(false);
      }
    });

    // Cleanup on unmount
    return () => {
      logger.solana.debug("[DOMIN8] 🛑 Unsubscribing from shared subscription");
      unsubscribe();
    };
  }, [program?.programId.toString(), activeGamePDA?.toString(), connection?.rpcEndpoint]);

  return {
    activeGame,
    isLoading,
    activeGamePDA,
  };
}
