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
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    if (value >= 0 && value <= 100) {
      setBetAmount(value);
    }
  }, []);

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
      const { buildCreateLobbyTransaction } = await import("../../lib/solana-1v1-transactions");

      const connection = getSharedConnection();
      const betAmountLamports = Math.floor(betAmount * 1e9); // Convert SOL to lamports

      logger.ui.info("Starting lobby creation process", {
        playerA: publicKey.toString(),
        amount: betAmountLamports,
        character: selectedCharacter.id,
      });

      // Build create_lobby transaction
      const transaction = await buildCreateLobbyTransaction(
        publicKey,
        betAmountLamports,
        selectedCharacter.id,
        0, // Default map ID
        connection
      );

      // Serialize transaction for Privy (must be Uint8Array, not VersionedTransaction object)
      const serializedTx = transaction.serialize();

      // Sign and send via Privy
      const txResult = await wallet.signAndSendTransaction({
        transaction: serializedTx,
        chain: "solana:mainnet",
      });

      // Handle signature - could be string or Uint8Array
      let signature: string;
      if (typeof txResult.signature === "string") {
        signature = txResult.signature;
      } else if (txResult.signature instanceof Uint8Array) {
        // Convert Uint8Array to base58
        const bs58 = await import("bs58");
        signature = bs58.default.encode(txResult.signature);
      } else {
        throw new Error("Invalid signature format from wallet");
      }

      logger.solana.info("Transaction sent to blockchain", {
        signature: signature.slice(0, 8) + "...",
      });

      toast.loading("Waiting for transaction confirmation...", { id: "tx-confirm" });

      const confirmation = await connection.confirmTransaction(signature, "confirmed");

      if (confirmation.value.err) {
        throw new Error("Transaction failed: " + confirmation.value.err.toString());
      }

      toast.success("Transaction confirmed!", { id: "tx-confirm" });
      logger.solana.info("Transaction confirmed on blockchain", { signature });

      // Call Convex action to create lobby in database
      const result = await createLobbyAction({
        playerAWallet: publicKey.toString(),
        amount: betAmountLamports,
        characterA: selectedCharacter.id,
        mapId: 0,
        transactionHash: signature,
        isPrivate,
      });

      if (result.success) {
        logger.solana.info("Lobby created successfully", {
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
        logger.solana.error("Convex action failed");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.solana.error("Failed to create lobby:", error);
      // Provide user-friendly error messages with recovery guidance
      if (errorMsg.includes("User rejected")) {
        toast.error("Transaction rejected by user");
      } else if (errorMsg.includes("confirmation timeout")) {
        toast.error("Transaction confirmation timed out. Please check your wallet.");
      } else if (errorMsg.includes("Insufficient SOL")) {
        toast.error(`Insufficient SOL. Need: ~${(betAmount + 0.003).toFixed(4)} SOL (bet + fees)`);
      } else {
        toast.error("Failed to create lobby: " + errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    connected,
    publicKey,
    selectedCharacter,
    wallet,
    betAmount,
    isPrivate,
    createLobbyAction,
    onLobbyCreated,
  ]);

  if (!connected || !publicKey) {
    return null;
  }

  return (
    <div className=" p-4">
      {/* CoinFlip-style Header Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Title Section */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-amber-100  tracking-wide">1v1 BATTLE</h1>
        </div>

        {/* Spacer */}
        <div className="flex-1 hidden lg:block"></div>

        {/* Bet Amount Input with Increment Buttons */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <img
              src="/sol-logo.svg"
              alt="SOL"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{
                filter:
                  "brightness(0) saturate(100%) invert(66%) sepia(89%) saturate(470%) hue-rotate(359deg) brightness(97%) contrast(89%)",
              }}
            />
            <input
              type="number"
              value={betAmount}
              onChange={handleAmountChange}
              min="0.01"
              max="100"
              step="0.01"
              className="w-32 px-3 py-2 pl-9 bg-black/30 border border-amber-700/50 rounded-lg text-amber-100 placeholder-amber-600 text-center font-bold focus:outline-none focus:border-amber-500"
              disabled={isLoading}
              placeholder="0.01"
            />
          </div>

          <button
            onClick={() => setBetAmount((prev) => Math.min(prev + 0.1, 100))}
            disabled={isLoading}
            className="px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50"
          >
            +0.1
          </button>
          <button
            onClick={() => setBetAmount((prev) => Math.min(prev + 1, 100))}
            disabled={isLoading}
            className="px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50"
          >
            +1
          </button>
        </div>

        {/* Private Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={isPrivate}
            onClick={() => setIsPrivate(!isPrivate)}
            disabled={isLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              isPrivate ? "bg-amber-600" : "bg-gray-600"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPrivate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-amber-300 font-medium">Private</span>
        </label>

        {/* Create Game Button */}
        <button
          onClick={handleCreateLobby}
          disabled={isLoading || !selectedCharacter || betAmount <= 0}
          className="px-6 py-2 bg-gradient-to-b from-amber-500 to-amber-700 hover:to-amber-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-amber-100 font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg"
        >
          {isLoading ? "Creating..." : "Create Game"}
        </button>
      </div>

      {/* Character Selection Warning */}
      {!selectedCharacter && (
        <div className="mt-3 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <p className="text-amber-300 text-sm text-center">Select a character to create a game</p>
        </div>
      )}
    </div>
  );
}
