import { useState, useCallback } from "react";
import { useActiveWallet } from "../../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../../lib/socket";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SpriteAnimator } from "../SpriteAnimator";
import type { Character } from "../../types/character";

interface CreateLobbyProps {
  selectedCharacter: Character | null;
  characters: Character[];
  onCharacterChange: (direction: "prev" | "next") => void;
  onLobbyCreated?: (lobbyId: number) => void;
}

const DEFAULT_BET_AMOUNT_SOL = 0.01;

export function CreateLobby({
  selectedCharacter,
  characters,
  onCharacterChange,
  onLobbyCreated,
}: CreateLobbyProps) {
  const { connected, activePublicKey: publicKey, activeWallet: wallet } = useActiveWallet();
  const { socket } = useSocket();
  const createLobbyAction = useCallback(
    async (args: any) => {
      if (!socket) throw new Error("Not connected");
      const res = await socketRequest(socket, "create-lobby", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

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

      // Debug: Log the character being used for lobby creation
      console.log("[1v1 Debug] CreateLobby - creating with character:", {
        selectedCharacterId: selectedCharacter.id,
        selectedCharacterName: selectedCharacter.name,
        betAmount: betAmountLamports,
      });

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
    <div className="py-2">
      {/* Mobile: Stack vertically, Desktop: Single row */}
      <div className="flex flex-col gap-3 md:gap-4">
        {/* Title - always visible */}
        <h1 className="text-2xl md:text-4xl font-black text-amber-100 tracking-wide text-center md:text-left">
          1V1 BATTLE
        </h1>

        {/* Controls - stack on mobile, row on desktop */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          {/* Character Selector */}
          <div className="flex items-center justify-center md:justify-start gap-1 bg-black/40 border border-amber-700/50 rounded-lg px-2 py-1">
            <button
              onClick={() => onCharacterChange("prev")}
              disabled={isLoading || characters.length <= 1}
              className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5 text-amber-300" />
            </button>

            <div className="flex items-center gap-2 w-35 md:w-40 justify-center">
              {selectedCharacter && (
                <>
                  <div className="w-10 shrink-0 flex items-center justify-center">
                    <SpriteAnimator
                      assetPath={selectedCharacter.assetPath}
                      animation="idle"
                      size={40}
                      scale={1.8}
                    />
                  </div>
                  <span className="text-amber-100 font-bold text-sm uppercase tracking-wide truncate">
                    {selectedCharacter.name}
                  </span>
                </>
              )}
              {!selectedCharacter && <span className="text-gray-400 text-sm">Select</span>}
            </div>

            <button
              onClick={() => onCharacterChange("next")}
              disabled={isLoading || characters.length <= 1}
              className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5 text-amber-300" />
            </button>
          </div>

          {/* Bet Amount Input with Increment Buttons */}
          <div className="flex items-center justify-center md:justify-start gap-2">
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
                min="0.001"
                max="100"
                step="0.001"
                className="w-28 md:w-32 px-3 py-2 pl-9 bg-black/30 border border-amber-700/50 rounded-lg text-amber-100 placeholder-amber-600 text-center font-bold focus:outline-none focus:border-amber-500"
                disabled={isLoading}
                placeholder="0.001"
              />
            </div>

            <button
              onClick={() => setBetAmount((prev) => Math.min(prev + 0.1, 100))}
              disabled={isLoading}
              className="px-2 md:px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50 text-sm md:text-base"
            >
              +0.1
            </button>
            <button
              onClick={() => setBetAmount((prev) => Math.min(prev + 1, 100))}
              disabled={isLoading}
              className="px-2 md:px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50 text-sm md:text-base"
            >
              +1
            </button>
          </div>

          {/* Private Toggle + Create Button Row */}
          <div className="flex items-center justify-center md:justify-start gap-3 md:gap-4">
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
              className="flex-1 md:flex-none px-4 md:px-6 py-2 bg-linear-to-b from-amber-500 to-amber-700 hover:to-amber-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-amber-100 font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg text-sm md:text-base"
            >
              {isLoading ? "Creating..." : "Create Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
