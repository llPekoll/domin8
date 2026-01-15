/**
 * React Hook for Domin8 Smart Contract Interactions
 *
 * This hook provides all the functions needed to interact with the
 * domin8_prgm Solana smart contract from the frontend using Privy.
 *
 * IMPORTANT: This hook uses Privy for wallet management, NOT @solana/wallet-adapter
 * Pattern follows CharacterSelection.tsx implementation with @solana/kit
 *
 * KEY IMPLEMENTATION DETAILS:
 * - Uses usePrivyWallet() custom hook for wallet state
 * - Uses @solana/kit for manual transaction building (NOT Anchor Program)
 * - Manual instruction creation with discriminators from IDL
 * - Transaction signing via wallet.signAndSendAllTransactions()
 * - Chain specification required: `solana:${network}`
 * - Signature returned as hex string for database storage
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
import { useWallets } from "@privy-io/react-auth/solana";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EventBus } from "../game/EventBus";
import { getLevelInfo } from "../../convex/xpConstants";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionSignature,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { type Domin8Prgm } from "../../target/types/domin8_prgm";
import Domin8PrgmIDL from "../../target/idl/domin8_prgm.json";
import { logger } from "../lib/logger";
import { getSharedConnection } from "~/lib/sharedConnection";
import { BetEntry } from "./useGameState";

// Extract Program ID from IDL
export const DOMIN8_PROGRAM_ID = new PublicKey(Domin8PrgmIDL.address);

// Simple Wallet adapter for Privy
// NOTE: Privy's signAndSendAllTransactions both signs AND sends the transaction
// So we can't use Anchor's .rpc() method which also tries to send
// Instead, we'll use .transaction() to build, then sign+send with Privy
class PrivyWalletAdapter {
  public lastSignature: string | null = null; // Store last transaction signature

  constructor(
    public publicKey: PublicKey,
    private privyWallet: any,
    private network: string
  ) {
    // logger.solana.debug("[PrivyWalletAdapter] Initialized with network:", network);
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const chainId = `solana:${this.network}` as `${string}:${string}`;
    logger.solana.debug("[PrivyWalletAdapter] Signing transaction", {
      chainId,
      network: this.network,
      wallet: this.privyWallet?.address,
    });

    // Serialize transaction
    let serialized: Uint8Array;
    if (tx instanceof Transaction) {
      serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    } else {
      serialized = tx.message.serialize();
    }

    // Sign and send with Privy (Privy doesn't have sign-only method)
    // TODO SING: and send via FAST
    // const result = await this.privyWallet.
    const result = await this.privyWallet.signAndSendAllTransactions([
      {
        chain: chainId,
        transaction: serialized,
      },
    ]);

    // Store the signature for later retrieval
    // Convert Uint8Array to base58 string for Convex compatibility
    if (result && result.length > 0 && result[0].signature) {
      const signatureBytes = result[0].signature;
      this.lastSignature = bs58.encode(signatureBytes);
    }

    // Return the transaction (already sent by Privy)
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    const chainId = `solana:${this.network}` as `${string}:${string}`;

    const serializedTxs = txs.map((tx) => {
      if (tx instanceof Transaction) {
        return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      } else {
        return tx.message.serialize();
      }
    });

    // TODO SING: and send via FAST
    const results = await this.privyWallet.signAndSendAllTransactions(
      serializedTxs.map((transaction) => ({
        chain: chainId,
        transaction,
      }))
    );

    // Store the last signature
    // Convert Uint8Array to base58 string for Convex compatibility
    if (results && results.length > 0 && results[results.length - 1].signature) {
      const signatureBytes = results[results.length - 1].signature;
      this.lastSignature = bs58.encode(signatureBytes);
    }

    return txs;
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

// ========================================
// HELIUS TRANSACTION OPTIMIZATION HELPERS
// ========================================

/**
 * HELIUS OPTIMIZATION: Build and send optimized transaction with Privy
 * This helper wraps Privy's signAndSendAllTransactions with Helius best practices
 *
 * @param connection - Solana connection
 * @param instructions - Array of transaction instructions
 * @param payer - Transaction fee payer
 * @param privyWallet - Privy wallet instance
 * @param network - Network name for chain ID
 * @returns Transaction signature (base58 string)
 */
async function sendOptimizedTransactionWithPrivy(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  privyWallet: any,
  network: string
): Promise<string> {
  // HELIUS BEST PRACTICE #1: Use 'confirmed' commitment for blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  logger.solana.debug("[sendOptimizedTx] Got blockhash", {
    blockhash: blockhash.slice(0, 8) + "...",
    lastValidBlockHeight,
  });

  // HELIUS BEST PRACTICE #2: Simulate to optimize compute units
  const computeUnits = await simulateForComputeUnits(connection, instructions, payer, blockhash);

  // HELIUS BEST PRACTICE #3: Get dynamic priority fee
  const priorityFee = await getPriorityFeeForInstructions(
    connection,
    instructions,
    payer,
    blockhash
  );

  logger.solana.debug("[sendOptimizedTx] Optimized parameters", {
    computeUnits,
    priorityFee,
  });

  // Build final optimized transaction with compute budget instructions
  // IMPORTANT: Compute budget instructions MUST come first
  const optimizedInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
    ...instructions,
  ];

  // Create versioned transaction (Privy supports both Transaction and VersionedTransaction)
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: optimizedInstructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  // HELIUS BEST PRACTICE #4 & #5: Send with skipPreflight + custom retry logic
  let signature: string | null = null;
  const maxRetries = 3;
  const chainId = `solana:${network}` as `${string}:${string}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.solana.debug(`[sendOptimizedTx] Attempt ${attempt + 1}/${maxRetries}`);

      // Check blockhash validity before retry
      const currentBlockHeight = await connection.getBlockHeight("confirmed");
      if (currentBlockHeight > lastValidBlockHeight) {
        throw new Error("Blockhash expired, need to rebuild transaction");
      }

      // Sign and send with Privy
      const results = await privyWallet.signAndSendAllTransactions([
        {
          chain: chainId,
          transaction: transaction.serialize(),
        },
      ]);

      if (!results || results.length === 0 || !results[0].signature) {
        throw new Error("No signature returned from Privy");
      }

      // Convert Uint8Array signature to base58 string
      const signatureBytes = results[0].signature;
      signature = bs58.encode(signatureBytes);

      logger.solana.debug(`[sendOptimizedTx] Transaction sent: ${signature}`);

      // Confirm with polling
      const confirmed = await confirmTransactionWithPolling(
        connection,
        signature,
        lastValidBlockHeight
      );

      if (confirmed) {
        logger.solana.info(
          `[sendOptimizedTx] Transaction confirmed on attempt ${attempt + 1}: ${signature}`
        );
        break;
      } else {
        logger.solana.warn(`[sendOptimizedTx] Confirmation timeout on attempt ${attempt + 1}`);
      }
    } catch (error: any) {
      logger.solana.warn(`[sendOptimizedTx] Attempt ${attempt + 1} failed:`, error.message);

      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 3s
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  if (!signature) {
    throw new Error("All retry attempts failed");
  }

  return signature;
}

/**
 * HELIUS OPTIMIZATION: Simulate transaction to get exact compute units
 * @param connection - Solana connection
 * @param instructions - Transaction instructions
 * @param payer - Fee payer
 * @param blockhash - Recent blockhash
 * @returns Optimized compute unit limit (with 10% buffer)
 */
async function simulateForComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    // HELIUS BEST PRACTICE: Simulate with 1.4M CU to ensure success
    const testInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ...instructions,
    ];

    const testMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: testInstructions,
    }).compileToV0Message();

    const testTx = new VersionedTransaction(testMessage);

    const simulation = await connection.simulateTransaction(testTx, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });

    if (simulation.value.err) {
      logger.solana.warn("[simulateForComputeUnits] Simulation error:", simulation.value.err);
      return 200_000; // Conservative fallback
    }

    if (!simulation.value.unitsConsumed) {
      logger.solana.warn("[simulateForComputeUnits] No unitsConsumed in simulation");
      return 200_000;
    }

    // Add 10% buffer (Helius recommendation)
    const optimizedCU =
      simulation.value.unitsConsumed < 1000
        ? 1000
        : Math.ceil(simulation.value.unitsConsumed * 1.1);

    logger.solana.debug("[simulateForComputeUnits] Optimized CU", {
      consumed: simulation.value.unitsConsumed,
      withBuffer: optimizedCU,
    });

    return optimizedCU;
  } catch (error) {
    logger.solana.warn("[simulateForComputeUnits] Simulation failed:", error);
    return 200_000; // Fallback
  }
}

/**
 * HELIUS OPTIMIZATION: Get priority fee for specific instructions
 * Uses Helius Priority Fee API with serialized transaction method
 * @param connection - Solana connection
 * @param instructions - Transaction instructions
 * @param payer - Fee payer
 * @param blockhash - Recent blockhash
 * @returns Priority fee in microlamports
 */
async function getPriorityFeeForInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    // Create temp transaction for fee estimation
    const tempMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: instructions,
    }).compileToV0Message();

    const tempTx = new VersionedTransaction(tempMessage);
    const serializedTx = bs58.encode(tempTx.serialize());

    // Call Helius Priority Fee API
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-priority-fee",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: serializedTx,
            options: {
              recommended: true, // Use Helius recommended fee
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.result?.priorityFeeEstimate) {
      // Add 20% safety buffer
      const estimatedFee = Math.ceil(data.result.priorityFeeEstimate * 1.2);
      logger.solana.debug("[getPriorityFeeForInstructions] Helius fee:", estimatedFee);
      return estimatedFee;
    }

    logger.solana.warn("[getPriorityFeeForInstructions] No result from API, using fallback");
    return 50_000; // Medium priority fallback
  } catch (error) {
    logger.solana.warn("[getPriorityFeeForInstructions] API failed, using fallback:", error);
    return 50_000;
  }
}

/**
 * HELIUS OPTIMIZATION: Confirm transaction with robust polling
 * @param connection - Solana connection
 * @param signature - Transaction signature
 * @param lastValidBlockHeight - Last valid block height
 * @returns True if confirmed, false if timeout/expired
 */
async function confirmTransactionWithPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  const timeout = 30000; // 30 seconds (generous for user transactions)
  const interval = 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const statuses = await connection.getSignatureStatuses([signature]);
      const status = statuses?.value?.[0];

      if (status) {
        if (status.err) {
          logger.solana.error("[confirmTransactionWithPolling] Transaction failed:", status.err);
          return false;
        }

        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return true;
        }
      }

      // Check blockhash expiry
      const currentBlockHeight = await connection.getBlockHeight("confirmed");
      if (currentBlockHeight > lastValidBlockHeight) {
        logger.solana.warn("[confirmTransactionWithPolling] Blockhash expired during polling");
        return false;
      }
    } catch (error) {
      logger.solana.warn("[confirmTransactionWithPolling] Status check failed:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  logger.solana.warn("[confirmTransactionWithPolling] Confirmation timeout");
  return false;
}

// Game status constants (matching smart contract constants.rs)
// IMPORTANT: These values MUST match the Rust constants:
// pub const GAME_STATUS_OPEN: u8 = 0;
// pub const GAME_STATUS_CLOSED: u8 = 1;
// pub const GAME_STATUS_WAITING: u8 = 2;
export const GAME_STATUS = {
  OPEN: 0, // Game is open for betting (countdown running)
  CLOSED: 1, // Game ended, winner selected
  WAITING: 2, // Game created, no bets yet (waiting for first bet)
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

  // Convex mutation for awarding points
  const awardPoints = useMutation(api.players.awardPoints);

  // Convex mutation for awarding XP
  const awardXpForBet = useMutation(api.players.awardXpForBet);

  // Convex mutation for tracking referral revenue
  const updateReferralRevenue = useMutation(api.referrals.updateReferralRevenue);

  // Get selected wallet (first Solana wallet from Privy)
  const selectedWallet = useMemo(() => {
    return wallets.length > 0 ? wallets[0] : null;
  }, [wallets]);

  // RPC connection (use shared connection with confirmed commitment)
  const connection = getSharedConnection();

  // Network configuration
  const network = useMemo(() => {
    return import.meta.env.VITE_SOLANA_NETWORK || "localnet";
  }, []);

  // Create Anchor Provider and Program
  const { program, walletAdapter } = useMemo<{
    provider: AnchorProvider | null;
    program: Program<Domin8Prgm> | null;
    walletAdapter: PrivyWalletAdapter | null;
  }>(() => {
    if (!connected || !publicKey || !selectedWallet) {
      return { provider: null, program: null, walletAdapter: null };
    }

    try {
      const wallet = new PrivyWalletAdapter(publicKey, selectedWallet, network);
      const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
      });

      const program = new Program<Domin8Prgm>(Domin8PrgmIDL as any, provider);
      return { provider, program, walletAdapter: wallet };
    } catch (error) {
      logger.solana.error("Failed to create Anchor program:", error);
      return { provider: null, program: null, walletAdapter: null };
    }
  }, [connected, publicKey, selectedWallet, connection, network]);

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
   * Place a bet in the current game using OPTIMIZED manual transaction building
   *
   * NOTE: Games are created by the backend (Convex). This function only places bets.
   * The game must already exist (status WAITING or OPEN) for betting to work.
   *
   * HELIUS OPTIMIZATIONS APPLIED:
   * - Confirmed commitment for blockhash
   * - Compute unit simulation and optimization
   * - Dynamic priority fees via Helius API
   * - Custom retry logic with blockhash expiry checks
   * - Transaction confirmation polling
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
      logger.solana.group("[placeBet] Starting OPTIMIZED placeBet function");
      logger.solana.debug("Connection status", {
        connected,
        publicKey: publicKey?.toString(),
        program: program ? "initialized" : "null",
        walletAdapter: walletAdapter ? "initialized" : "null",
      });

      if (!connected || !publicKey || !program || !selectedWallet) {
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
        if (gameStatus === GAME_STATUS.CLOSED) {
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
        const instruction = await program.methods
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

        // ✅ HELIUS OPTIMIZATION: Send with all optimizations
        const signature = await sendOptimizedTransactionWithPrivy(
          connection,
          [instruction],
          publicKey,
          selectedWallet,
          network
        );

        logger.solana.info("[placeBet] Transaction successful", {
          signature,
          betIndex,
          roundId: activeRoundId,
        });

        // Award points for the bet (1 point per 0.001 SOL)
        try {
          await awardPoints({
            walletAddress: publicKey.toString(),
            amountLamports: amountLamports,
          });
          logger.solana.debug("[placeBet] Points awarded for bet");
        } catch (pointsError) {
          // Don't fail the bet if points award fails
          logger.solana.error("[placeBet] Failed to award points:", pointsError);
        }

        // Award XP for the bet (+10 base + bet bonus + daily bonus)
        try {
          const xpResult = await awardXpForBet({
            walletAddress: publicKey.toString(),
            betAmountLamports: amountLamports,
          });
          logger.solana.debug("[placeBet] XP awarded for bet:", xpResult);

          // Emit level-up event if player leveled up
          if (xpResult.levelUp) {
            EventBus.emit("level-up", {
              newLevel: xpResult.newLevel,
              levelTitle: getLevelInfo(xpResult.newLevel).title,
            });
          }
        } catch (xpError) {
          // Don't fail the bet if XP award fails
          logger.solana.error("[placeBet] Failed to award XP:", xpError);
        }

        // Track referral revenue if this user was referred
        try {
          await updateReferralRevenue({
            userId: publicKey.toString(),
            betAmount: amountLamports,
          });
          logger.solana.debug("[placeBet] Referral revenue tracked");
        } catch (referralError) {
          // Don't fail the bet if referral tracking fails
          logger.solana.error("[placeBet] Failed to track referral revenue:", referralError);
        }

        logger.solana.groupEnd();

        return {
          signature,
          roundId: activeRoundId,
          betIndex,
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
      selectedWallet,
      deriveGameRoundPda,
      derivePDAs,
      connection,
      network,
      awardPoints,
      awardXpForBet,
      updateReferralRevenue,
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
    if (gameStatus === GAME_STATUS.CLOSED) {
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
    selectedWallet,

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
