import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";

interface CreateLobbyProps {
  selectedCharacter: Character | null;
  onLobbyCreated?: (lobbyId: number) => void;
  userOpenLobbies?: Array<{
    _id: string;
    lobbyId: number;
    lobbyPda: string;
    amount: number;
    status: number;
  }>;
  onLobbyCancelled?: (lobbyId: number) => void;
}

const DEFAULT_BET_AMOUNT_SOL = 0.01;

export function CreateLobby({
  selectedCharacter,
  onLobbyCreated,
  userOpenLobbies = [],
  onLobbyCancelled,
}: CreateLobbyProps) {
  const { connected, publicKey, wallet } = usePrivyWallet();
  const createLobbyAction = useAction(api.lobbies.createLobby);
  const cancelLobbyAction = useAction(api.lobbies.cancelLobby);

  const [betAmount, setBetAmount] = useState<number>(DEFAULT_BET_AMOUNT_SOL);
  const [isLoading, setIsLoading] = useState(false);
  const [cancellingLobbies, setCancellingLobbies] = useState<Set<number>>(new Set());
  const [randomnessAccountPubkey, setRandomnessAccountPubkey] = useState<string | null>(null);

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      if (value >= 0 && value <= 100) {
        setBetAmount(value);
      }
    },
    []
  );

  const handleCancelLobby = useCallback(
    async (lobby: any) => {
      if (!connected || !publicKey || !wallet) {
        toast.error("Please connect wallet");
        return;
      }

      // Confirm cancellation
      const confirmed = window.confirm(
        `Cancel lobby #${lobby.lobbyId}? You will receive a refund of ${(
          lobby.amount / 1e9
        ).toFixed(4)} SOL minus gas fees.`
      );
      if (!confirmed) return;

      setCancellingLobbies((prev) => new Set(prev).add(lobby.lobbyId));

      try {
        // Import utilities
        const { getSharedConnection } = await import("../../lib/sharedConnection");
        const {
          buildCancelLobbyTransactionOptimized,
          sendOptimizedTransaction,
          waitForConfirmationOptimized,
        } = await import("../../lib/solana-1v1-transactions-helius");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = getSharedConnection();

        logger.ui.info("Cancelling lobby", {
          lobbyId: lobby.lobbyId,
          playerA: publicKey.toString(),
        });

        // Build optimized cancel transaction
        const lobbyPda = new PublicKey(lobby.lobbyPda);
        const { transaction, metrics } = await buildCancelLobbyTransactionOptimized(
          publicKey,
          lobby.lobbyId,
          lobbyPda,
          connection
        );

        // Get the block height for later validation
        const { blockhash: _, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        logger.ui.info("Transaction optimization metrics", {
          computeUnits: metrics.optimizedCU,
          priorityFee: metrics.priorityFee,
          estimatedCost: (metrics.estimatedCost / 1e9).toFixed(6) + " SOL",
        });

        logger.ui.debug("Signing and sending optimized cancel transaction with Privy wallet");

        // Send with Helius optimizations
        const network = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
        const signature = await sendOptimizedTransaction(
          connection,
          transaction,
          publicKey,
          wallet,
          lastValidBlockHeight,
          network
        );

        logger.ui.info("Optimized cancel transaction sent", {
          signature: signature.slice(0, 8) + "...",
          lobbyId: lobby.lobbyId,
        });
        toast.loading("Waiting for transaction confirmation...", { id: "cancel-tx-confirm" });

        // Wait for confirmation
        const isConfirmed = await waitForConfirmationOptimized(
          connection,
          signature,
          lastValidBlockHeight
        );

        if (!isConfirmed) {
          toast.error("Transaction confirmation timeout", { id: "cancel-tx-confirm" });
          logger.ui.error("Cancel transaction confirmation timed out", { signature });
          return;
        }

        toast.success("Transaction confirmed!", { id: "cancel-tx-confirm" });
        logger.ui.info("Cancel transaction confirmed on blockchain", { signature });

        // Call Convex action to update database
        logger.ui.debug("Calling Convex action to cancel lobby in database");

        const result = await cancelLobbyAction({
          lobbyId: lobby.lobbyId,
          transactionHash: signature,
        });

        if (result.success) {
          logger.ui.info("Lobby cancelled successfully", {
            lobbyId: result.lobbyId,
          });

          toast.success(`Lobby #${result.lobbyId} cancelled! Refund sent to your wallet.`, {
            duration: 5000,
          });

          // Callback to parent component
          onLobbyCancelled?.(result.lobbyId);
        } else {
          toast.error("Failed to cancel lobby in database");
          logger.ui.error("Convex action failed");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("Failed to cancel lobby:", error);

        // Provide user-friendly error messages
        if (errorMsg.includes("User rejected")) {
          toast.error("Transaction rejected by user");
        } else if (errorMsg.includes("confirmation timeout")) {
          toast.error("Transaction confirmation timed out. Please check your wallet.");
        } else if (errorMsg.includes("insufficient funds")) {
          toast.error("Insufficient SOL for transaction fee");
        } else if (errorMsg.includes("InvalidLobbyStatus")) {
          toast.error("Lobby already joined or invalid status");
        } else {
          toast.error("Failed to cancel lobby: " + errorMsg);
        }
      } finally {
        setCancellingLobbies((prev) => {
          const next = new Set(prev);
          next.delete(lobby.lobbyId);
          return next;
        });
      }
    },
    [connected, publicKey, wallet, cancelLobbyAction, onLobbyCancelled]
  );

  // Convert SOL from lamports for display
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  const handleCreateLobby = useCallback(async () => {
    if (!connected || !publicKey || !selectedCharacter || !wallet) {
      toast.error("Please connect wallet and select a character");
      return;
    }

    if (betAmount <= 0) {
      toast.error("Bet amount must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      // Import utilities
      const { getSharedConnection } = await import("../../lib/sharedConnection");
      const {
        buildCreateLobbyTransactionOptimized,
        sendOptimizedTransaction,
        waitForConfirmationOptimized,
      } = await import("../../lib/solana-1v1-transactions-helius");

      const connection = getSharedConnection();
      const betAmountLamports = Math.floor(betAmount * 1e9); // Convert SOL to lamports

      logger.ui.info("Building optimized create_lobby transaction", {
        playerA: publicKey.toString(),
        amount: betAmountLamports,
        character: selectedCharacter.id,
      });

      // Build optimized transaction with Helius best practices
      // This now handles the full Switchboard commit-reveal pattern:
      // 1. Creates a randomness account via Switchboard
      // 2. Builds and includes the commit instruction
      // 3. Builds the create_lobby instruction
      const { transaction, metrics, randomnessPubkey } =
        await buildCreateLobbyTransactionOptimized(
          publicKey,
          betAmountLamports,
          selectedCharacter.id,
          0, // Default map ID
          connection
        );

      // Store randomness account for later reveal phase
      setRandomnessAccountPubkey(randomnessPubkey.toString());

      logger.ui.info("Switchboard randomness account created", {
        randomnessPubkey: randomnessPubkey.toString(),
      });

      // Store the block height for later validation
      const { blockhash: _, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      logger.ui.info("Transaction optimization metrics", {
        computeUnits: metrics.optimizedCU,
        priorityFee: metrics.priorityFee,
        estimatedCost: (metrics.estimatedCost / 1e9).toFixed(6) + " SOL",
      });

      logger.ui.debug("Signing and sending optimized transaction with Privy wallet");

      // Send with Helius optimizations (retry logic, blockhash checking)
      const network = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
      const signature = await sendOptimizedTransaction(
        connection,
        transaction,
        publicKey,
        wallet,
        lastValidBlockHeight,
        network
      );

      logger.ui.info("Optimized transaction sent", {
        signature: signature.slice(0, 8) + "...",
      });
      toast.loading("Waiting for transaction confirmation...", { id: "tx-confirm" });

      // Wait for confirmation with Helius polling
      const isConfirmed = await waitForConfirmationOptimized(
        connection,
        signature,
        lastValidBlockHeight
      );

      if (!isConfirmed) {
        toast.error("Transaction confirmation timeout", { id: "tx-confirm" });
        logger.ui.error("Transaction confirmation timed out", { signature });
        return;
      }

      toast.success("Transaction confirmed!", { id: "tx-confirm" });
      logger.ui.info("Transaction confirmed on blockchain", { signature });

      // Call Convex action to create lobby in database
      logger.ui.debug("Calling Convex action to create lobby in database", {
        randomnessPubkey: randomnessAccountPubkey,
      });

      // Verify randomness account was created
      if (!randomnessAccountPubkey) {
        throw new Error("Failed to create randomness account");
      }

      const result = await createLobbyAction({
        playerAWallet: publicKey.toString(),
        amount: betAmountLamports,
        characterA: selectedCharacter.id,
        mapId: 0,
        transactionHash: signature,
        randomnessAccountPubkey: randomnessAccountPubkey,
      });

      if (result.success) {
        logger.ui.info("Lobby created successfully", {
          lobbyId: result.lobbyId,
          lobbyPda: result.lobbyPda,
        });

        toast.success(`Lobby #${result.lobbyId} created! Waiting for Player B...`, {
          duration: 5000,
        });

        // Callback to parent component
        onLobbyCreated?.(result.lobbyId);
      } else {
        toast.error("Failed to create lobby in database");
        logger.ui.error("Convex action failed");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.ui.error("Failed to create lobby:", error);

      // Provide user-friendly error messages with recovery guidance
      if (errorMsg.includes("User rejected")) {
        toast.error("Transaction rejected by user");
      } else if (errorMsg.includes("confirmation timeout")) {
        toast.error("Transaction confirmation timed out. Please check your wallet.");
      } else if (
        errorMsg.includes("insufficient funds") ||
        errorMsg.includes("insufficient lamports")
      ) {
        toast.error(
          `Insufficient SOL. Need: ~${(betAmount + 0.01).toFixed(4)} SOL (bet + fees + randomness rent)`
        );
      } else if (errorMsg.includes("Failed to create Switchboard randomness account")) {
        toast.error(
          "Switchboard randomness account creation failed. Please retry or contact support."
        );
      } else if (errorMsg.includes("Failed to create lobby")) {
        // Generic lobby creation error
        toast.error("Failed to create lobby. Please try again.");
      } else {
        // For unknown errors, show a generic message but log the full error
        toast.error("Failed to create lobby: " + (errorMsg.length > 100 ? errorMsg.substring(0, 100) + "..." : errorMsg));
      }
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, wallet, selectedCharacter, betAmount, createLobbyAction, onLobbyCreated]);

  if (!connected || !publicKey) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500 rounded text-red-200 text-sm">
        Connect wallet to create lobbies
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6">
      <h2 className="text-xl font-bold text-indigo-200 mb-4">Create Lobby</h2>

      {/* Selected Character Display */}
      <div className="mb-4 p-3 bg-gray-800 border border-indigo-400/50 rounded">
        <p className="text-xs text-indigo-400 mb-1">Your Character</p>
        <p className="text-indigo-200 font-semibold">
          {selectedCharacter ? selectedCharacter.name : "No character selected"}
        </p>
      </div>

      {/* Bet Amount Input */}
      <div className="mb-4">
        <label className="block text-sm text-indigo-300 mb-2">Bet Amount (SOL)</label>
        <input
          type="number"
          value={betAmount}
          onChange={handleAmountChange}
          min="0"
          max="100"
          step="0.01"
          className="w-full px-3 py-2 bg-gray-800 border border-indigo-500/30 rounded text-indigo-200 focus:border-indigo-400 focus:outline-none"
          disabled={isLoading}
        />
        <p className="text-xs text-gray-400 mt-1">Min: 0.01 SOL | Max: 100 SOL</p>
      </div>

      {/* Info */}
      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200">
        <p>• Awaiting Player B to join</p>
        <p>• 2% house fee on winnings</p>
        <p>• Winner determined by VRF randomness</p>
      </div>

      {/* Create Button */}
      <button
        onClick={handleCreateLobby}
        disabled={isLoading || !selectedCharacter || betAmount <= 0}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded transition-colors"
      >
        {isLoading ? "Creating..." : "Create Lobby"}
      </button>

      {/* My Open Lobbies Section */}
      {userOpenLobbies.length > 0 && (
        <div className="mt-6 pt-6 border-t border-indigo-400/20">
          <h3 className="text-lg font-bold text-indigo-200 mb-3">Your Open Lobbies</h3>
          <div className="space-y-2">
            {userOpenLobbies.map((lobby) => (
              <div
                key={lobby._id}
                className="bg-gray-800 border border-orange-400/50 rounded p-3 flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm text-indigo-400">
                    Lobby #{lobby.lobbyId} - {formatAmount(lobby.amount)} SOL
                  </p>
                  <p className="text-xs text-gray-400">Waiting for Player B...</p>
                </div>
                <button
                  onClick={() => handleCancelLobby(lobby)}
                  disabled={cancellingLobbies.has(lobby.lobbyId) || isLoading}
                  className="ml-3 px-3 py-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors whitespace-nowrap"
                >
                  {cancellingLobbies.has(lobby.lobbyId) ? "Cancelling..." : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
