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
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionSignature,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { Domin8PrgmIDL, DOMIN8_PROGRAM_ID, type Domin8Prgm } from "../programs/domin8";

// Use the program ID from the IDL (or environment override)
const PROGRAM_ID = import.meta.env.VITE_GAME_PROGRAM_ID
  ? new PublicKey(import.meta.env.VITE_GAME_PROGRAM_ID)
  : DOMIN8_PROGRAM_ID;

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
    // console.log("[PrivyWalletAdapter] Initialized with network:", network);
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const chainId = `solana:${this.network}` as `${string}:${string}`;
    console.log("[PrivyWalletAdapter] Signing transaction with chainId:", chainId);
    console.log("[PrivyWalletAdapter] Network:", this.network);
    console.log("[PrivyWalletAdapter] Privy wallet:", this.privyWallet);

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
const MIN_BET_LAMPORTS = 10_000_000; // 0.01 SOL
const HOUSE_FEE_BPS = 500; // 5%

// PDA Seeds
const GAME_CONFIG_SEED = "game_config";
const GAME_COUNTER_SEED = "game_counter";
const GAME_ROUND_SEED = "game_round";
const BET_ENTRY_SEED = "bet";
const VAULT_SEED = "vault";

// Type definitions
export interface GameRound {
  roundId: BN;
  status: "waiting" | "awaitingWinnerRandomness" | "finished";
  startTimestamp: BN;
  endTimestamp: BN;
  betCount: number;
  totalPot: BN;
  betAmounts: BN[];
  winner: PublicKey;
  winningBetIndex: number;
  vrfRequestPubkey: PublicKey;
  vrfSeed: number[];
}

export interface GameConfig {
  authority: PublicKey;
  treasury: PublicKey;
  houseFee: number;
  minBet: BN;
  betsLocked: boolean;
  force: number[];
}

export interface BetEntry {
  roundId: BN;
  betIndex: number;
  wallet: PublicKey;
  betAmount: BN;
}

export interface GameCounter {
  currentRoundId: BN;
}

export const useGameContract = () => {
  const { connected, publicKey, walletAddress } = usePrivyWallet();
  const { wallets } = useWallets();

  // Get selected wallet (first Solana wallet from Privy)
  const selectedWallet = useMemo(() => {
    return wallets.length > 0 ? wallets[0] : null;
  }, [wallets]);

  // RPC connection (use env variable)
  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "http://127.0.0.1:8899";
    return new Connection(rpcUrl, "confirmed");
  }, []);

  // Network configuration
  const network = useMemo(() => {
    return import.meta.env.VITE_SOLANA_NETWORK || "localnet";
  }, []);

  // Create Anchor Provider and Program
  const { provider, program, walletAdapter } = useMemo<{
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
      console.error("Failed to create Anchor program:", error);
      return { provider: null, program: null, walletAdapter: null };
    }
  }, [connected, publicKey, selectedWallet, connection, network]);

  // Derive PDAs
  const derivePDAs = useCallback(() => {
    const [gameConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_CONFIG_SEED)],
      PROGRAM_ID
    );

    const [gameCounterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_COUNTER_SEED)],
      PROGRAM_ID
    );

    const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from(VAULT_SEED)], PROGRAM_ID);

    return { gameConfigPda, gameCounterPda, vaultPda };
  }, []);

  const deriveGameRoundPda = useCallback((roundId: number) => {
    // Match Rust: round_id is u64 (8 bytes)
    const roundIdBuffer = new BN(roundId).toArrayLike(Buffer, "le", 8);

    const [gameRoundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(GAME_ROUND_SEED), roundIdBuffer],
      PROGRAM_ID
    );

    return gameRoundPda;
  }, []);

  // Derive mock VRF PDA for localnet: seeds = [b"mock_vrf", force]
  const deriveMockVrfPda = useCallback((force: Buffer | Uint8Array) => {
    const seedPrefix = Buffer.from("mock_vrf");
    const forceBuf = Buffer.from(force);

    const [mockVrfPda] = PublicKey.findProgramAddressSync([seedPrefix, forceBuf], PROGRAM_ID);
    return mockVrfPda;
  }, []);

  const deriveBetEntryPda = useCallback((roundId: number, betIndex: number) => {
    // Match Rust: round_id is u64 (8 bytes), bet_count is u32 (4 bytes)
    const roundIdBuffer = new BN(roundId).toArrayLike(Buffer, "le", 8);
    const betIndexBuffer = new BN(betIndex).toArrayLike(Buffer, "le", 4);

    const [betEntryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(BET_ENTRY_SEED), roundIdBuffer, betIndexBuffer],
      PROGRAM_ID
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
      console.error("Error fetching game config:", error);
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
        console.error("Error fetching game round:", error);
        return null;
      }
    },
    [connection, deriveGameRoundPda]
  );

  const fetchCurrentRoundId = useCallback(async (): Promise<number> => {
    try {
      const { gameCounterPda } = derivePDAs();
      const accountInfo = await connection.getAccountInfo(gameCounterPda);

      if (!accountInfo) return 0;

      // Parse current_round_id (u64 at offset 8)
      const data = accountInfo.data;
      const roundId = Number(new BN(data.slice(8, 16), "le"));

      return roundId;
    } catch (error) {
      console.error("Error fetching current round ID:", error);
      return 0;
    }
  }, [connection, derivePDAs]);

  const fetchBetEntry = useCallback(
    async (roundId: number, betIndex: number): Promise<BetEntry | null> => {
      try {
        const betEntryPda = deriveBetEntryPda(roundId, betIndex);
        const accountInfo = await connection.getAccountInfo(betEntryPda);

        if (!accountInfo) return null;

        // Parse bet entry data
        return null;
      } catch (error) {
        console.error("Error fetching bet entry:", error);
        return null;
      }
    },
    [connection, deriveBetEntryPda]
  );

  // Smart contract instruction functions

  /**
   * Place a bet in the current game using Anchor Program
   * This function handles both creating a new game (if needed) and placing additional bets
   * @param amount - Bet amount in SOL
   * @returns Transaction signature
   */
  const placeBet = useCallback(
    async (amount: number): Promise<TransactionSignature> => {
      console.log("[placeBet] Starting placeBet function");
      console.log("[placeBet] Connected:", connected);
      console.log("[placeBet] PublicKey:", publicKey?.toString());
      console.log("[placeBet] Program:", program ? "initialized" : "null");
      console.log("[placeBet] WalletAdapter:", walletAdapter ? "initialized" : "null");

      if (!connected || !publicKey || !program) {
        throw new Error("Wallet not connected or program not initialized");
      }

      if (amount < MIN_BET_LAMPORTS / LAMPORTS_PER_SOL) {
        throw new Error(`Minimum bet is ${MIN_BET_LAMPORTS / LAMPORTS_PER_SOL} SOL`);
      }

      try {
        console.log("[placeBet] Placing bet of", amount, "SOL");

        // Convert SOL to lamports
        const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
        const amountBN = new BN(amountLamports);
        console.log("[placeBet] Amount in lamports:", amountLamports);

        // Fetch current round ID
        console.log("[placeBet] Fetching current round ID...");
        const currentRoundId = await fetchCurrentRoundId();
        console.log("[placeBet] Current round ID:", currentRoundId);

        // Derive PDAs
        console.log("[placeBet] Deriving PDAs...");
        const { gameConfigPda } = derivePDAs();
        console.log("[placeBet] Game config PDA:", gameConfigPda.toString());

        // Check previous round first (counter increments AFTER game creation, so active game is usually counter - 1)
        let activeRoundId = currentRoundId;
        let gameRoundPda = deriveGameRoundPda(currentRoundId);
        console.log("[placeBet] Current game round PDA:", gameRoundPda.toString());

        console.log("[placeBet] Fetching game round account info...");
        let gameRoundInfo = await connection.getAccountInfo(gameRoundPda);
        console.log("[placeBet] Current game round exists:", !!gameRoundInfo);

        // If current round doesn't exist, check previous round
        if (!gameRoundInfo && currentRoundId > 0) {
          console.log("[placeBet] Current round doesn't exist, checking previous round...");
          const prevRoundId = currentRoundId - 1;
          const prevGameRoundPda = deriveGameRoundPda(prevRoundId);
          console.log("[placeBet] Previous game round PDA:", prevGameRoundPda.toString());

          const prevGameRoundInfo = await connection.getAccountInfo(prevGameRoundPda);
          console.log("[placeBet] Previous game round exists:", !!prevGameRoundInfo);

          if (prevGameRoundInfo) {
            // Previous round exists, check if it's still accepting bets
            console.log("[placeBet] Fetching previous game round data...");
            console.log("[placeBet] Program.account:", program.account);
            console.log("[placeBet] Program.account.gameRound:", program.account.gameRound);

            try {
              const prevGameRound = await program.account.gameRound.fetchNullable(prevGameRoundPda);
              console.log("[placeBet] Fetched previous game round:", prevGameRound);

              if (prevGameRound) {
                const prevStatus = Object.keys(prevGameRound.status)[0];
                console.log(
                  `[placeBet] Previous round ${prevRoundId} exists with status: ${prevStatus}`
                );

                if (prevStatus === "waiting") {
                  // Previous round is still active, use it!
                  activeRoundId = prevRoundId;
                  gameRoundPda = prevGameRoundPda;
                  gameRoundInfo = prevGameRoundInfo;
                  console.log(`[placeBet] Using active previous round: ${prevRoundId}`);
                }
              } else {
                console.log("[placeBet] Previous round exists but can't be deserialized");
              }
            } catch (fetchError) {
              console.error("[placeBet] Error fetching previous game round:", fetchError);
            }
          }
        }

        let tx: string;

        // Check if we need to create a new game (no game OR game is finished)
        let shouldCreateNewGame = false;

        if (!gameRoundInfo) {
          shouldCreateNewGame = true;
          console.log("[placeBet] No game exists, creating new game with first bet");
        } else {
          // Game exists - check if it's finished
          console.log("[placeBet] Game round exists, fetching status...");
          console.log("[placeBet] Program.account:", program.account);
          console.log("[placeBet] Program.account.gameRound:", program.account.gameRound);

          try {
            const gameRoundAccount = await program.account.gameRound.fetchNullable(gameRoundPda);
            console.log("[placeBet] Fetched game round account:", gameRoundAccount);

            if (!gameRoundAccount) {
              // Account exists but can't be deserialized - treat as need new game
              console.log("[placeBet] Game round account exists but can't be fetched, creating new game");
              shouldCreateNewGame = true;
            } else {
              const gameStatus = Object.keys(gameRoundAccount.status)[0];
              console.log("[placeBet] Game exists with status:", gameStatus);

              if (gameStatus === "finished") {
                shouldCreateNewGame = true;
                console.log("[placeBet] Game is finished, need to create new round");
              }
            }
          } catch (fetchError) {
            console.error("[placeBet] Error fetching game round:", fetchError);
            console.log("[placeBet] Treating as need new game due to fetch error");
            shouldCreateNewGame = true;
          }
        }

        if (shouldCreateNewGame) {
          // Check what network you're actually using
          console.log("Network:", import.meta.env.VITE_SOLANA_NETWORK);
          console.log("RPC URL:", import.meta.env.VITE_SOLANA_RPC_URL);
          console.log("Program ID:", import.meta.env.VITE_GAME_PROGRAM_ID);
          // No game exists OR game is finished - CREATE a new game with this bet
          console.log("[placeBet] Creating new game for round", currentRoundId);
          console.log("[placeBet] Available methods:", Object.keys(program.methods));

          // Get config to fetch VRF force field
          const configInfo = await connection.getAccountInfo(gameConfigPda);
          if (!configInfo) {
            throw new Error("Game config not found. Please contact support.");
          }
          // Parse force field from config using Anchor deserialization
          // const configAccountParsed = await program.account.gameConfig.fetch(gameConfigPda);
          // const force = Buffer.from(configAccountParsed.force);

          // LOCALNET: simulate ORAO by creating MockVrfAccount PDA and pass it to create_game
          // Fetch game config to read the current force field used as VRF seed
          if (network === "devnet") {
            // Use Anchor to fetch the GameConfig (has `force: [u8;32]`)
            const configAccount = await program.account.gameConfig.fetch(gameConfigPda);
            const forceArr = configAccount.force as any; // usually Uint8Array or number[]
            const forceBuf = Buffer.from(forceArr as any);

            // Derive mock_vrf PDA using seed [b"mock_vrf", force]
            const mockVrfPda = deriveMockVrfPda(forceBuf);

            console.log("[placeBet] Localnet: mock VRF PDA:", mockVrfPda.toString());

            // Call create_game providing the mock_vrf PDA
            tx = await program.methods
              .createGame(amountBN)
              .accounts({
                player: publicKey,
                mockVrf: mockVrfPda,
                systemProgram: SystemProgram.programId,
              })
              .rpc();

            console.log("[placeBet] Created new localnet game with first bet (mock VRF)", tx);

            // Auto-fulfill mock VRF to simulate ORAO (helps immediate local testing)
            try {
              const { gameCounterPda } = derivePDAs();
              const gameRoundPdaAfter = deriveGameRoundPda(currentRoundId);

              // Use a reasonably-random u64 (timestamp) for testing
              const randomnessValue = Math.floor(Date.now() / 1000);

              const fulfillSig = await program.methods
                .fulfillMockVrf(new BN(randomnessValue))
                .accounts({
                  counter: gameCounterPda,
                  gameRound: gameRoundPdaAfter,
                  mockVrf: mockVrfPda,
                  config: gameConfigPda,
                  fulfiller: publicKey,
                })
                .rpc();

              console.log("[placeBet] Auto-fulfilled mock VRF (localnet):", fulfillSig);
            } catch (fulfillErr) {
              console.warn("[placeBet] Auto-fulfill mock VRF failed (you can call fulfill_mock_vrf manually):", fulfillErr);
            }
          } else {
            // DEVNET/MAINNET: Use ORAO VRF
            // TODO: Implement ORAO VRF integration for devnet/mainnet
            // For now, throw error since ORAO VRF is not yet fully integrated
            throw new Error("ORAO VRF integration for devnet/mainnet is not yet implemented. Please use localnet for testing.");
            
            // FUTURE IMPLEMENTATION (when ORAO VRF is integrated):
            // const { Orao, networkStateAccountAddress, randomnessAccountAddress } = await import("@orao-network/solana-vrf");
            // const orao = new Orao(provider as any);
            // const networkState = networkStateAccountAddress();
            // const force = Buffer.from(configAccount.force);
            // const vrfRequest = randomnessAccountAddress(force);
            // const networkStateData = await orao.getNetworkState();
            // const vrfTreasury = networkStateData.config.treasury;
            // 
            // tx = await program.methods
            //   .createGame(amountBN)
            //   .accounts({
            //     player: publicKey,
            //     treasury: vrfTreasury,
            //     vrfRequest: vrfRequest,
            //   })
            //   .rpc();
          }
          // Transaction variable 'tx' is now set in the network-specific branches above
        } else {
          // Game exists - PLACE an additional bet
          console.log(`[placeBet] Game exists (round ${activeRoundId}), placing additional bet`);

          // Fetch fresh game state using Anchor (more reliable than manual parsing)
          const gameRoundAccount = await program.account.gameRound.fetch(gameRoundPda);
          const betCount = gameRoundAccount.bet_count;
          console.log("[placeBet] Current bet count (from Anchor):", betCount);

          // Call placeBet instruction (camelCase, not snake_case)
          // Note: All accounts are auto-resolved by Anchor from the IDL
          // We only need to provide: player (signer)
          tx = await program.methods
            .placeBet(amountBN)
            .accounts({
              player: publicKey,
            })
            .rpc();
        }

        // Get the actual signature from Privy wallet adapter
        // (since Privy signs+sends, the tx variable from .rpc() might not be accurate)
        const actualSignature = walletAdapter?.lastSignature || tx;
        console.log("[placeBet] Transaction successful:", actualSignature);
        return actualSignature;
      } catch (error: any) {
        console.error("[placeBet] Error:", error);

        // WORKAROUND: Privy signing sometimes throws "signature verification failed"
        // but the transaction actually succeeds on-chain. Check if it's just a signing error.
        if (error.message && error.message.includes("Signature verification")) {
          console.log(
            "[placeBet] Signature verification error (Privy quirk) - transaction likely succeeded"
          );
          // Check if Privy wallet has the signature
          if (walletAdapter?.lastSignature) {
            console.log("[placeBet] Returning signature from Privy:", walletAdapter.lastSignature);
            return walletAdapter.lastSignature;
          }
          // Return a placeholder - the UI should refresh to show the updated game state
          return "transaction_pending";
        }

        // Try to extract useful error message
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
      fetchCurrentRoundId,
      derivePDAs,
      deriveGameRoundPda,
      deriveBetEntryPda,
      connection,
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
      console.error("Error fetching balance:", error);
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
   * @param gameStatus - Current game status
   * @param endTimestamp - Betting window end time
   * @returns Can place bet
   */
  const canPlaceBet = useCallback((gameStatus: string, endTimestamp: number): boolean => {
    const now = Math.floor(Date.now() / 1000);

    if (gameStatus !== "waiting") {
      return false;
    }

    if (now >= endTimestamp) {
      return false;
    }

    return true;
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
    PROGRAM_ID,
  };
};

export default useGameContract;
