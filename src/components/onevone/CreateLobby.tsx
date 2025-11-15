import { useState, useCallback } from "react";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";

interface CreateLobbyProps {
  selectedCharacter: Character | null;
  onLobbyCreated?: (lobbyId: number) => void;
}

const DEFAULT_BET_AMOUNT_SOL = 0.01;

export function CreateLobby({ selectedCharacter, onLobbyCreated }: CreateLobbyProps) {
  const { connected, publicKey } = usePrivyWallet();
  const signTransaction = useSignTransaction();

  const [betAmount, setBetAmount] = useState<number>(DEFAULT_BET_AMOUNT_SOL);
  const [isLoading, setIsLoading] = useState(false);

  // TODO: Uncomment after Convex API is regenerated
  // const createLobby = useAction(api.lobbies.createLobby);

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
    if (!connected || !publicKey || !selectedCharacter) {
      toast.error("Please connect wallet and select a character");
      return;
    }

    if (betAmount <= 0) {
      toast.error("Bet amount must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Implement actual transaction creation and signing
      // For now, just show a toast
      toast.info("Create lobby functionality coming soon", {
        description: "Waiting for on-chain program integration",
      });

      logger.ui.info("CreateLobby: Placeholder implementation", {
        character: selectedCharacter.name,
        amount: betAmount,
        wallet: publicKey?.toString(),
      });

      // Example flow (to be implemented):
      // 1. Build create_lobby transaction on-chain
      // 2. Sign transaction with wallet
      // 3. Send transaction
      // 4. Wait for confirmation
      // 5. Call Convex action with transaction hash
      // 6. Call onLobbyCreated with lobby ID
      // onLobbyCreated?.(lobbyId);
    } catch (error) {
      logger.ui.error("Failed to create lobby:", error);
      toast.error("Failed to create lobby");
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, selectedCharacter, betAmount, signTransaction, onLobbyCreated]);

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
