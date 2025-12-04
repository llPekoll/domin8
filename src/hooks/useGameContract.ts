/**
 * React Hook for Domin8 Smart Contract Interactions
 *
 * This hook provides all the functions needed to interact with the
 * domin8_prgm Solana smart contract from the frontend using Privy.
 *
 * IMPORTANT: This hook uses Privy for wallet management, NOT @solana/wallet-adapter
 *
 * KEY IMPLEMENTATION DETAILS:
 * - Uses usePrivyWallet() custom hook for wallet state
 * - Frontend builds and SIGNS transactions (NOT send)
 * - Backend sends via Helius (dev) / Circular (prod)
 * - Chain specification required: `solana:${network}`
 *
 * EXAMPLE USAGE:
 * ```typescript
 * const { connected, placeBet, getBalance } = useGameContract();
 *
 * if (connected) {
 *   const signature = await placeBet(0.5); // 0.5 SOL
 *   console.log("Bet placed:", signature);
 * }
 * ```
 */

import { useCallback, useMemo } from "react";
import { usePrivyWallet } from "./usePrivyWallet";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionSignature,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import { type Domin8Prgm } from "../../target/types/domin8_prgm";
import Domin8PrgmIDL from "../../target/idl/domin8_prgm.json";
import { logger } from "../lib/logger";
import { getSharedConnection } from "~/lib/sharedConnection";
import { BetEntry } from "./useGameState";

// Extract Program ID from IDL
export const DOMIN8_PROGRAM_ID = new PublicKey(Domin8PrgmIDL.address);

// Minimal wallet adapter for Anchor (sign-only, backend sends)
class MinimalWalletAdapter {
  constructor(public publicKey: PublicKey) {}

  // These methods are required by Anchor but we don't use them
  // since we build transactions manually and sign via Privy
  async signTransaction(): Promise<never> {
    throw new Error("Use manual transaction building with Privy");
  }

  async signAllTransactions(): Promise<never> {
    throw new Error("Use manual transaction building with Privy");
  }
}

// Constants from smart contract
const MIN_BET_LAMPORTS = 1_000_000; // 0.001 SOL
const HOUSE_FEE_BPS = 500; // 5%

// PDA Seeds (must match Rust program seeds exactly!)
const GAME_CONFIG_SEED = "domin8_config"; // matches b"domin8_config" in Rust
const GAME_ROUND_SEED = "domin8_game"; // matches b"domin8_game" in Rust
const ACTIVE_GAME_SEED = "active_game"; // matches b"active_game" in Rust
const BET_ENTRY_SEED = "bet";

// Circular FAST tip configuration
const FAST_TIP = new PublicKey("FAST3dMFZvESiEipBvLSiXq3QCV51o3xuoHScqRU6cB6");
const MIN_TIP_AMOUNT = 1_000_000; // 0.001 SOL

// Game status constants (matching smart contract)
export const GAME_STATUS = {
  WAITING: 0, // Game created, no bets yet
  OPEN: 1, // First bet placed, countdown started
  CLOSED: 2, // Game ended, winner selected
} as const;

// Type definitions
export interface GameRound {
  gameRound: BN;
  status: number; // 0=WAITING, 1=OPEN, 2=CLOSED
  startDate: BN;
  endDate: BN;
  totalDeposit: BN;
  rand: BN;
  map: number;
  userCount: BN;
  force: number[];
  vrfRequested: boolean;
  winner: PublicKey | null;
  winnerPrize: BN;
  winningBetIndex: BN | null;
  wallets: PublicKey[];
  bets: BetInfo[];
}

export interface BetInfo {
  walletIndex: number;
  amount: BN;
  skin: number;
  position: [number, number];
}

export interface GameConfig {
  admin: PublicKey;
  treasury: PublicKey;
  gameRound: BN;
  houseFee: BN;
  minDepositAmount: BN;
  maxDepositAmount: BN;
  roundTime: BN;
  lock: boolean;
  force: number[];
}

export const useGameContract = () => {
  const { connected, publicKey, walletAddress } = usePrivyWallet();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  // Convex action for sending bet transactions (backend sends via Helius/Circular)
  const sendBetTransaction = useAction(api.gameBets.sendBetTransaction);

  // Get selected wallet (first Solana wallet from Privy)
  const privyWallet = wallets[0];

  // RPC connection (use shared connection with confirmed commitment)
  const connection = getSharedConnection();

  // Network configuration
  const network = useMemo(() => {
    return import.meta.env.VITE_SOLANA_NETWORK || "localnet";
  }, []);

  // Create Anchor Provider and Program
  const program = useMemo<Program<Domin8Prgm> | null>(() => {
    if (!connected || !publicKey) {
      return null;
    }

    try {
      const wallet = new MinimalWalletAdapter(publicKey);
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });

      return new Program<Domin8Prgm>(Domin8PrgmIDL as any, provider);
    } catch (error) {
      logger.solana.error("Failed to create Anchor program:", error);
      return null;
    }
  }, [connected, publicKey, connection]);

  // Derive PDAs
  const derivePDAs = useCallback(() => {
    const [gameConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_CONFIG_SEED)],
      DOMIN8_PROGRAM_ID
    );

    const [activeGamePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(ACTIVE_GAME_SEED)],
      DOMIN8_PROGRAM_ID
    );

    return { gameConfigPda, activeGamePda };
  }, []);

  const deriveGameRoundPda = useCallback((roundId: number) => {
    // Match Rust: round_id is u64 (8 bytes)
    const roundIdBuffer = new BN(roundId).toArrayLike(Buffer, "le", 8);

    const [gameRoundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_ROUND_SEED), roundIdBuffer],
      DOMIN8_PROGRAM_ID
    );

    return gameRoundPda;
  }, []);

  const deriveBetEntryPda = useCallback((roundId: number, betIndex: number) => {
    // Match Rust: round_id is u64 (8 bytes), bet_count is u32 (4 bytes)
    const roundIdBuffer = new BN(roundId).toArrayLike(Buffer, "le", 8);
    const betIndexBuffer = new BN(betIndex).toArrayLike(Buffer, "le", 4);

    const [betEntryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(BET_ENTRY_SEED), roundIdBuffer, betIndexBuffer],
      DOMIN8_PROGRAM_ID
    );

    return betEntryPda;
  }, []);

  // Fetch functions
  const fetchGameConfig = useCallback(async (): Promise<GameConfig | null> => {
    try {
      const { gameConfigPda } = derivePDAs();
      const accountInfo = await connection.getAccountInfo(gameConfigPda);

      if (!accountInfo) return null;

      // Parse account data (simplified - use anchor IDL in production)
      // For now, return null and handle in calling code
      return null;
    } catch (error) {
      logger.solana.error("Error fetching game config:", error);
      return null;
    }
  }, [connection, derivePDAs]);

  const fetchGameRound = useCallback(
    async (roundId: number): Promise<GameRound | null> => {
      try {
        const gameRoundPda = deriveGameRoundPda(roundId);
        const accountInfo = await connection.getAccountInfo(gameRoundPda);

        if (!accountInfo) return null;

        // Parse account data (use anchor IDL in production)
        return null;
      } catch (error) {
        logger.solana.error("Error fetching game round:", error);
        return null;
      }
    },
    [connection, deriveGameRoundPda]
  );

  const fetchCurrentRoundId = useCallback(async (): Promise<number> => {
    try {
      const { gameConfigPda } = derivePDAs();

      // Fetch config to get the next round ID
      if (!program) return 1;
      const configAccount = await program.account.domin8Config.fetch(gameConfigPda);
      const roundId = configAccount.gameRound.toNumber();
      logger.solana.debug("[fetchCurrentRoundId] Next round ID from config:", roundId);
      return roundId;
    } catch (error) {
      logger.solana.error("Error fetching current round ID:", error);
      return 1; // Default to 1 instead of 0
    }
  }, [connection, derivePDAs, program]);

  const fetchBetEntry = useCallback(
    async (roundId: number, betIndex: number): Promise<BetEntry | null> => {
      try {
        const betEntryPda = deriveBetEntryPda(roundId, betIndex);
        const accountInfo = await connection.getAccountInfo(betEntryPda);

        if (!accountInfo) return null;

        // Parse bet entry data
        return null;
      } catch (error) {
        logger.solana.error("Error fetching bet entry:", error);
        return null;
      }
    },
    [connection, deriveBetEntryPda]
  );

  // Smart contract instruction functions

  /**
   * Place a bet in the current game
   *
   * NOTE: Games are created by the backend (Convex). This function only places bets.
   * The game must already exist (status WAITING or OPEN) for betting to work.
   *
   * Flow:
   * 1. Frontend builds transaction with compute budget + FAST tip
   * 2. Frontend signs transaction (NOT send) via Privy
   * 3. Backend sends via Helius (dev) / Circular (prod)
   * 4. Backend awards points and tracks referrals
   *
   * @param amount - Bet amount in SOL
   * @param skin - Character skin ID (0-255)
   * @param position - Spawn position [x, y] in game coordinates
   * @returns Object with transaction signature, round ID, and bet index
   */
  const placeBet = useCallback(
    async (
      amount: number,
      skin: number = 0,
      position: [number, number] = [0, 0]
    ): Promise<{ signature: TransactionSignature; roundId: number; betIndex: number }> => {
      logger.solana.group("[placeBet] Starting placeBet function");
      logger.solana.debug("Connection status", {
        connected,
        publicKey: publicKey?.toString(),
        program: program ? "initialized" : "null",
      });

      if (!connected || !publicKey || !program || !privyWallet) {
        throw new Error("Wallet not connected or program not initialized");
      }

      if (amount < MIN_BET_LAMPORTS / LAMPORTS_PER_SOL) {
        throw new Error(`Minimum bet is ${MIN_BET_LAMPORTS / LAMPORTS_PER_SOL} SOL`);
      }

      try {
        logger.solana.debug("[placeBet] Placing bet of", amount, "SOL");

        const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
        const amountBN = new BN(amountLamports);

        // Derive PDAs
        const { gameConfigPda, activeGamePda } = derivePDAs();

        // Fetch active game state
        const activeGameAccount = await program.account.domin8Game
          .fetch(activeGamePda)
          .catch(() => null);

        if (!activeGameAccount) {
          throw new Error("No active game found. Please wait for a new game to be created.");
        }

        // Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
        const gameStatus = activeGameAccount.status;

        // Can bet when game is OPEN (0) or WAITING (2)
        // Cannot bet when game is CLOSED (1)
        if (gameStatus === 1) {
          throw new Error("Game is closed. Please wait for the next game.");
        }

        // Check if betting window is still open (endDate is set after first bet)
        const endTimestamp = activeGameAccount.endDate.toNumber();
        const currentTime = Math.floor(Date.now() / 1000);

        // If endDate is set (> 0) and we're past it, betting is closed
        if (endTimestamp > 0 && currentTime >= endTimestamp) {
          throw new Error("Betting window closed. Please wait for the current game to finish.");
        }

        const activeRoundId = activeGameAccount.gameRound.toNumber();
        const betIndex = activeGameAccount.bets?.length || 0;

        logger.solana.debug("[placeBet] Game state", {
          activeRoundId,
          betIndex,
          gameStatus,
          endTimestamp: endTimestamp > 0 ? new Date(endTimestamp * 1000).toISOString() : "not set",
        });

        // Derive game round PDA
        const gameRoundPda = deriveGameRoundPda(activeRoundId);
        const roundIdBN = new BN(activeRoundId);

        // Build bet instruction
        const betInstruction = await program.methods
          .bet(roundIdBN, amountBN, skin, position)
          .accounts({
            // @ts-expect-error - Anchor type issue
            config: gameConfigPda,
            game: gameRoundPda,
            activeGame: activeGamePda,
            user: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash("confirmed");

        // Build transaction with compute budget + FAST tip
        const instructions = [
          // Compute budget
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
          // Bet instruction
          betInstruction,
          // FAST tip for Circular
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: FAST_TIP,
            lamports: MIN_TIP_AMOUNT,
          }),
        ];

        // Create versioned transaction
        const message = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(message);

        logger.solana.debug("[placeBet] Transaction built, signing...");

        // Sign only (NOT send) - backend will send via Helius/Circular
        const chainId = `solana:${network}`;

        // Use Privy's useSignTransaction hook (proper SDK pattern)
        const { signedTransaction: signedTxBytes } = await signTransaction({
          wallet: privyWallet,
          transaction: transaction.serialize(),
          chain: chainId,
        });

        if (!signedTxBytes) {
          throw new Error("Failed to sign transaction");
        }
        const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");

        logger.solana.debug("[placeBet] Transaction signed, sending to backend...");

        // Call backend action to send and process
        const result = await sendBetTransaction({
          walletAddress: publicKey.toString(),
          signedTxBase64,
          amountLamports,
          roundId: activeRoundId,
          betIndex,
        });

        logger.solana.info("[placeBet] Transaction successful", {
          signature: result.signature,
          betIndex: result.betIndex,
          roundId: result.roundId,
        });

        logger.solana.groupEnd();

        return {
          signature: result.signature,
          roundId: result.roundId,
          betIndex: result.betIndex,
        };
      } catch (error: any) {
        logger.solana.groupEnd();
        logger.solana.error("[placeBet] Error:", error);

        // Extract useful error message
        if (error.error) {
          throw new Error(
            `Smart contract error: ${error.error.errorMessage || error.error.errorCode?.code || "Unknown error"}`
          );
        } else if (error.message) {
          throw new Error(error.message);
        } else {
          throw error;
        }
      }
    },
    [
      connected,
      publicKey,
      program,
      privyWallet,
      signTransaction,
      deriveGameRoundPda,
      derivePDAs,
      connection,
      network,
      sendBetTransaction,
    ]
  );

  /**
   * Get user's wallet balance
   * @returns Balance in SOL
   */
  const getBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) return 0;

    try {
      const balance = await connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.solana.error("Error fetching balance:", error);
      return 0;
    }
  }, [publicKey, connection]);

  /**
   * Validate bet amount
   * @param amount - Bet amount in SOL
   * @returns Validation result
   */
  const validateBet = useCallback(
    async (amount: number): Promise<{ valid: boolean; error?: string }> => {
      if (amount < MIN_BET_LAMPORTS / LAMPORTS_PER_SOL) {
        return {
          valid: false,
          error: `Minimum bet is ${MIN_BET_LAMPORTS / LAMPORTS_PER_SOL} SOL`,
        };
      }

      const balance = await getBalance();
      if (amount > balance) {
        return {
          valid: false,
          error: "Insufficient balance",
        };
      }

      return { valid: true };
    },
    [getBalance]
  );

  /**
   * Check if user can place bet based on game status
   * Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
   *
   * @param gameStatus - Current game status (numeric: 0, 1, or 2)
   * @param endTimestamp - Betting window end time (0 if not set yet)
   * @returns Can place bet
   */
  const canPlaceBet = useCallback((gameStatus: number, endTimestamp: number): boolean => {
    const now = Math.floor(Date.now() / 1000);

    // Can bet when game is OPEN (0) or WAITING (2)
    // Cannot bet when game is CLOSED (1)
    if (gameStatus === 1) {
      // GAME_STATUS_CLOSED = 1
      return false;
    }

    // If endTimestamp is set (> 0) and we're past it, betting is closed
    if (endTimestamp > 0 && now >= endTimestamp) {
      return false;
    }

    return true;
  }, []);

  // Derive active game PDA for easy access
  const activeGamePda = useMemo(() => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(ACTIVE_GAME_SEED)],
      DOMIN8_PROGRAM_ID
    );
    return pda;
  }, []);

  return {
    // Connection info
    connected,
    publicKey,
    walletAddress,
    privyWallet,

    // PDA derivation
    derivePDAs,
    deriveGameRoundPda,
    deriveBetEntryPda,
    activeGamePda,

    // Fetch functions
    fetchGameConfig,
    fetchGameRound,
    fetchCurrentRoundId,
    fetchBetEntry,
    getBalance,

    // Validation
    validateBet,
    canPlaceBet,

    // Smart contract interactions (using Anchor)
    placeBet,

    // Constants
    MIN_BET: MIN_BET_LAMPORTS / LAMPORTS_PER_SOL,
    HOUSE_FEE_BPS,
    DOMIN8_PROGRAM_ID,
  };
};

export default useGameContract;
