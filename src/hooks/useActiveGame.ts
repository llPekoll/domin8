/**
 * Hook for subscribing to active_game PDA on Solana blockchain
 *
 * This replaces Convex polling with direct blockchain subscription
 * Updates in <1 second vs 5 seconds with Convex
 *
 * Based on risk.fun pattern: useJackpot.ts (lines 108-273)
 */
import { useMemo, useState, useEffect } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { usePrivyWallet } from "./usePrivyWallet";
import idl from "../../target/idl/domin8_prgm.json";

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
function transformGameData(raw: any): ActiveGameState {
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
  };
}

export function useActiveGame() {
  const { walletAddress, wallet } = usePrivyWallet();

  // Create connection using the same RPC URL
  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    return new Connection(rpcUrl, "confirmed");
  }, []);
  const [activeGame, setActiveGame] = useState<ActiveGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Create Anchor program instance with Privy wallet
  const program = useMemo(() => {
    if (!walletAddress || !wallet) {
      return null;
    }

    try {
      // Create a simple wallet adapter for Anchor
      const walletAdapter = {
        publicKey: new PublicKey(walletAddress),
        signTransaction: async (tx: any) => {
          // Use Privy's signTransaction method
          if (!wallet?.signTransaction) {
            throw new Error("Wallet does not support signing transactions");
          }
          return await wallet.signTransaction(tx);
        },
        signAllTransactions: async (txs: any[]) => {
          // Sign each transaction individually using Privy
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

      // Create a minimal provider-like object for Anchor
      const provider = {
        connection,
        wallet: walletAdapter,
        publicKey: new PublicKey(walletAddress),
      };

      return new Program(idl as any, provider as any);
    } catch (err) {
      console.error("[DOMIN8] Failed to create program:", err);
      return null;
    }
  }, [walletAddress, connection, wallet]);

  // Derive active_game PDA (seeds: [b"active_game"])
  const activeGamePDA = useMemo(() => {
    if (!program) return null;

    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("active_game")], program.programId);
    return pda;
  }, [program]);

  // Fetch and subscribe to active_game
  useEffect(() => {
    if (!program || !activeGamePDA || !connection) {
      console.log("[DOMIN8] ⚠️ Missing dependencies for game fetch:", {
        hasProgram: !!program,
        hasActiveGamePDA: !!activeGamePDA,
        hasConnection: !!connection,
      });
      setActiveGame(null);
      return;
    }

    console.log("[DOMIN8] 🚀 Starting active_game subscription:", {
      programId: program.programId.toBase58(),
      activeGamePDA: activeGamePDA.toBase58(),
      connectionEndpoint: connection.rpcEndpoint,
    });

    let subscriptionId: number | null = null;
    let isMounted = true;

    const fetchAndSubscribe = async () => {
      try {
        setIsLoading(true);

        // First, check if the account exists
        try {
          console.log("[DOMIN8] 🔍 Checking active_game account:", {
            activeGamePDA: activeGamePDA.toBase58(),
            programId: program.programId.toBase58(),
          });

          const accountInfo = await connection.getAccountInfo(activeGamePDA);
          console.log("[DOMIN8] 📊 Account info result:", {
            exists: !!accountInfo,
            dataLength: accountInfo?.data.length || 0,
            owner: accountInfo?.owner?.toBase58(),
            executable: accountInfo?.executable,
            lamports: accountInfo?.lamports,
          });

          if (!accountInfo) {
            console.log("[DOMIN8] ❌ Active game account does not exist");
            console.log("[DOMIN8] 💡 This means either:");
            console.log("[DOMIN8]    1. The smart contract has not been initialized");
            console.log("[DOMIN8]    2. You are on the wrong network");
            if (isMounted) {
              setActiveGame(null);
            }
            return;
          }

          // Check if the account is owned by our program
          if (accountInfo.owner.toBase58() !== program.programId.toBase58()) {
            console.log("[DOMIN8] ⚠️ Account exists but is not owned by our program!");
            console.log("[DOMIN8]    Expected owner:", program.programId.toBase58());
            console.log("[DOMIN8]    Actual owner:", accountInfo.owner.toBase58());
            if (isMounted) {
              setActiveGame(null);
            }
            return;
          }

          // Try to fetch the game data
          console.log("[DOMIN8] 🔄 Attempting to fetch game data...");
          const rawGameData = await (program.account as any).domin8Game.fetch(activeGamePDA);
          console.log("[DOMIN8] ✅ Active game data fetched:", rawGameData);

          // Transform data for backward compatibility
          const gameData = transformGameData(rawGameData);

          if (isMounted) {
            setActiveGame(gameData);
          }
        } catch (fetchError) {
          console.log("[DOMIN8] ❌ Failed to fetch active game data:", fetchError);
          console.log("[DOMIN8] 💡 This could mean:");
          console.log("[DOMIN8]    1. The account data is corrupted");
          console.log("[DOMIN8]    2. The account type is wrong");
          console.log("[DOMIN8]    3. The IDL is incorrect");
          if (isMounted) {
            setActiveGame(null);
          }
        }

        // Then subscribe to real-time changes
        if (isMounted) {
          console.log("[DOMIN8] 📡 Setting up real-time subscription...");
          subscriptionId = connection.onAccountChange(
            activeGamePDA,
            (accountInfo) => {
              if (!isMounted) return;

              try {
                if (accountInfo.data.length > 0) {
                  const rawGameData = (program.coder.accounts as any).decode(
                    "domin8Game",
                    accountInfo.data
                  );
                  const gameData = transformGameData(rawGameData);
                  setActiveGame(gameData);
                  console.log("[DOMIN8] 🔄 Active game updated:", gameData);
                } else {
                  setActiveGame(null);
                  console.log("[DOMIN8] ⚠️ Active game account is empty");
                }
              } catch (decodeError) {
                console.error("[DOMIN8] ❌ Failed to decode game data:", decodeError);
                setActiveGame(null);
              }
            },
            "confirmed"
          );
          console.log("[DOMIN8] ✅ Subscription active (ID:", subscriptionId, ")");
        }
      } catch (error) {
        console.error("[DOMIN8] ❌ Failed to fetch/subscribe to active game:", error);
        if (isMounted) {
          setActiveGame(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchAndSubscribe();

    // Cleanup subscription on unmount or dependency change
    return () => {
      isMounted = false;
      if (subscriptionId !== null) {
        console.log("[DOMIN8] 🛑 Removing subscription (ID:", subscriptionId, ")");
        void connection.removeAccountChangeListener(subscriptionId);
      }
    };
  }, [program?.programId.toString(), activeGamePDA?.toString(), connection?.rpcEndpoint]);

  return {
    activeGame,
    isLoading,
    activeGamePDA,
  };
}
