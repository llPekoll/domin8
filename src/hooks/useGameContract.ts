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
import { useActiveWallet } from "../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../lib/socket";
import { EventBus } from "../game/EventBus";
import { LEVEL_THRESHOLDS } from "../lib/xpUtils";

function getLevelInfo(level: number) {
  return LEVEL_THRESHOLDS.find((l) => l.level === level) || LEVEL_THRESHOLDS[0];
}
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
    const result = await this.privyWallet.signAndSendAllTransactions([
      {
        chain: chainId,
        transaction: serialized,
      },
    ]);

    // Store the signature for later retrieval
    // Convert Uint8Array to base58 string
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

    const results = await this.privyWallet.signAndSendAllTransactions(
      serializedTxs.map((transaction) => ({
        chain: chainId,
        transaction,
      }))
    );

    // Store the last signature
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
 */
async function sendOptimizedTransactionWithPrivy(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  privyWallet: any,
  network: string
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  logger.solana.debug("[sendOptimizedTx] Got blockhash", {
    blockhash: blockhash.slice(0, 8) + "...",
    lastValidBlockHeight,
  });

  const computeUnits = await simulateForComputeUnits(connection, instructions, payer, blockhash);
  const priorityFee = await getPriorityFeeForInstructions(connection, instructions, payer, blockhash);

  logger.solana.debug("[sendOptimizedTx] Optimized parameters", {
    computeUnits,
    priorityFee,
  });

  const optimizedInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
    ...instructions,
  ];

  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: optimizedInstructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  let signature: string | null = null;
  const maxRetries = 3;
  const chainId = `solana:${network}` as `${string}:${string}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.solana.debug(`[sendOptimizedTx] Attempt ${attempt + 1}/${maxRetries}`);

      const currentBlockHeight = await connection.getBlockHeight("confirmed");
      if (currentBlockHeight > lastValidBlockHeight) {
        throw new Error("Blockhash expired, need to rebuild transaction");
      }

      const results = await privyWallet.signAndSendAllTransactions([
        {
          chain: chainId,
          transaction: transaction.serialize(),
        },
      ]);

      if (!results || results.length === 0 || !results[0].signature) {
        throw new Error("No signature returned from Privy");
      }

      const signatureBytes = results[0].signature;
      signature = bs58.encode(signatureBytes);

      logger.solana.debug(`[sendOptimizedTx] Transaction sent: ${signature}`);

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

      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  if (!signature) {
    throw new Error("All retry attempts failed");
  }

  return signature;
}

async function simulateForComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
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
      return 200_000;
    }

    if (!simulation.value.unitsConsumed) {
      logger.solana.warn("[simulateForComputeUnits] No unitsConsumed in simulation");
      return 200_000;
    }

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
    return 200_000;
  }
}

async function getPriorityFeeForInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    const tempMessage = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: instructions,
    }).compileToV0Message();

    const tempTx = new VersionedTransaction(tempMessage);
    const serializedTx = bs58.encode(tempTx.serialize());

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
              recommended: true,
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.result?.priorityFeeEstimate) {
      const estimatedFee = Math.ceil(data.result.priorityFeeEstimate * 1.2);
      logger.solana.debug("[getPriorityFeeForInstructions] Helius fee:", estimatedFee);
      return estimatedFee;
    }

    logger.solana.warn("[getPriorityFeeForInstructions] No result from API, using fallback");
    return 50_000;
  } catch (error) {
    logger.solana.warn("[getPriorityFeeForInstructions] API failed, using fallback:", error);
    return 50_000;
  }
}

async function confirmTransactionWithPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<boolean> {
  const timeout = 30000;
  const interval = 2000;
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
export const GAME_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  WAITING: 2,
} as const;

// Type definitions
export interface GameRound {
  gameRound: BN;
  status: number;
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
  const {
    connected,
    activePublicKey: publicKey,
    activeWalletAddress: walletAddress,
    activeWallet: selectedWallet,
    embeddedWalletAddress,
  } = useActiveWallet();

  const { socket } = useSocket();

  // Socket-based award points
  const awardPoints = useCallback(
    async (args: { walletAddress: string; amountLamports: number }) => {
      if (!socket) return;
      const res = await socketRequest(socket, "award-points", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

  // Socket-based award XP
  const awardXpForBet = useCallback(
    async (args: { walletAddress: string; betAmountLamports: number }) => {
      if (!socket) return;
      const res = await socketRequest(socket, "award-xp-for-bet", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

  // Socket-based referral revenue tracking
  const updateReferralRevenue = useCallback(
    async (args: { userId: string; betAmount: number }) => {
      if (!socket) return;
      const res = await socketRequest(socket, "update-referral-revenue", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

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
    const roundIdBuffer = new BN(roundId).toArrayLike(Buffer, "le", 8);

    const [gameRoundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_ROUND_SEED), roundIdBuffer],
      DOMIN8_PROGRAM_ID
    );

    return gameRoundPda;
  }, []);

  const deriveBetEntryPda = useCallback((roundId: number, betIndex: number) => {
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

      if (!program) return 1;
      const configAccount = await program.account.domin8Config.fetch(gameConfigPda);
      const roundId = configAccount.gameRound.toNumber();
      logger.solana.debug("[fetchCurrentRoundId] Next round ID from config:", roundId);
      return roundId;
    } catch (error) {
      logger.solana.error("Error fetching current round ID:", error);
      return 1;
    }
  }, [connection, derivePDAs, program]);

  const fetchBetEntry = useCallback(
    async (roundId: number, betIndex: number): Promise<BetEntry | null> => {
      try {
        const betEntryPda = deriveBetEntryPda(roundId, betIndex);
        const accountInfo = await connection.getAccountInfo(betEntryPda);

        if (!accountInfo) return null;

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

        const gameStatus = activeGameAccount.status;

        if (gameStatus === GAME_STATUS.CLOSED) {
          throw new Error("Game is closed. Please wait for the next game.");
        }

        const endTimestamp = activeGameAccount.endDate.toNumber();
        const currentTime = Math.floor(Date.now() / 1000);

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

        // HELIUS OPTIMIZATION: Send with all optimizations
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
        const playerWalletAddress = embeddedWalletAddress || publicKey.toString();
        try {
          await awardPoints({
            walletAddress: playerWalletAddress,
            amountLamports: amountLamports,
          });
          logger.solana.debug("[placeBet] Points awarded for bet");
        } catch (pointsError) {
          logger.solana.error("[placeBet] Failed to award points:", pointsError);
        }

        // Award XP for the bet (+10 base + bet bonus + daily bonus)
        try {
          const xpResult = await awardXpForBet({
            walletAddress: playerWalletAddress,
            betAmountLamports: amountLamports,
          });
          logger.solana.debug("[placeBet] XP awarded for bet:", xpResult);

          // Emit level-up event if player leveled up
          if (xpResult?.levelUp) {
            EventBus.emit("level-up", {
              newLevel: xpResult.newLevel,
              levelTitle: getLevelInfo(xpResult.newLevel).title,
            });
          }
        } catch (xpError) {
          logger.solana.error("[placeBet] Failed to award XP:", xpError);
        }

        // Track referral revenue if this user was referred
        try {
          await updateReferralRevenue({
            userId: playerWalletAddress,
            betAmount: amountLamports,
          });
          logger.solana.debug("[placeBet] Referral revenue tracked");
        } catch (referralError) {
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
      embeddedWalletAddress,
    ]
  );

  /**
   * Get user's wallet balance
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
   */
  const canPlaceBet = useCallback((gameStatus: number, endTimestamp: number): boolean => {
    const now = Math.floor(Date.now() / 1000);

    if (gameStatus === GAME_STATUS.CLOSED) {
      return false;
    }

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
