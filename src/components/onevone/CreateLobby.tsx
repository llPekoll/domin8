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
}

const DEFAULT_BET_AMOUNT_SOL = 0.01;

export function CreateLobby({ selectedCharacter, onLobbyCreated }: CreateLobbyProps) {
  const { connected, publicKey, wallet } = usePrivyWallet();
  const createLobbyAction = useAction(api.lobbies.createLobby);

  const [betAmount, setBetAmount] = useState<number>(DEFAULT_BET_AMOUNT_SOL);
  const [isLoading, setIsLoading] = useState(false);

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      if (value >= 0 && value <= 100) {
        setBetAmount(value);
      }
    },
    []
  );

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
        deriveRandomnessAccountAddress,
      } = await import("../../lib/solana-1v1-transactions-helius");

      const connection = getSharedConnection();
      const betAmountLamports = Math.floor(betAmount * 1e9); // Convert SOL to lamports

      logger.ui.info("Building optimized create_lobby transaction", {
        playerA: publicKey.toString(),
        amount: betAmountLamports,
        character: selectedCharacter.id,
      });

      // Generate a unique randomness account address for Switchboard
      // In production, you'd coordinate with Switchboard to create/fund this account
      const randomnessAccountAddress = await deriveRandomnessAccountAddress(
        Date.now() // Use timestamp for uniqueness
      );

      // Build optimized transaction with Helius best practices
      const { transaction, metrics } = await buildCreateLobbyTransactionOptimized(
        publicKey,
        betAmountLamports,
        selectedCharacter.id,
        0, // Default map ID
        randomnessAccountAddress,
        connection
      );

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
      logger.ui.debug("Calling Convex action to create lobby in database");

      const result = await createLobbyAction({
        playerAWallet: publicKey.toString(),
        amount: betAmountLamports,
        characterA: selectedCharacter.id,
        mapId: 0,
        transactionHash: signature,
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

      // Provide user-friendly error messages
      if (errorMsg.includes("User rejected")) {
        toast.error("Transaction rejected by user");
      } else if (errorMsg.includes("confirmation timeout")) {
        toast.error("Transaction confirmation timed out. Please check your wallet.");
      } else if (errorMsg.includes("insufficient funds")) {
        toast.error("Insufficient SOL for transaction fee and bet amount");
      } else {
        toast.error("Failed to create lobby: " + errorMsg);
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
    </div>
  );
}
