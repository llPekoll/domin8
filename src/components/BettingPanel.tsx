import { useState, useCallback, useMemo, memo } from "react";
import { useQuery, useAction } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useGameContract } from "../hooks/useGameContract";
import { useActiveGame } from "../hooks/useActiveGame";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { EventBus } from "../game/EventBus";
import { logger } from "../lib/logger";
import { useAssets } from "../contexts/AssetsContext";
import type { Character } from "../types/character";
import styles from "./ButtonShine.module.css";

// Betting limits
const MIN_BET_AMOUNT = 0.001;
const MAX_BET_AMOUNT = 10;
const DEFAULT_BET_AMOUNT = MIN_BET_AMOUNT;

interface BettingPanelProps {
  selectedCharacter: Character | null;
  onBetPlaced?: () => void;
}

const BettingPanel = memo(function BettingPanel({
  selectedCharacter,
  onBetPlaced,
}: BettingPanelProps) {
  const { connected, publicKey, solBalance, isLoadingBalance, externalWalletAddress } =
    usePrivyWallet();
  const { placeBet, validateBet } = useGameContract();

  // NFT verification action
  const verifyNFTOwnership = useAction(api.nft.verifyNFTOwnership);

  const [betAmount, setBetAmount] = useState<string>(DEFAULT_BET_AMOUNT.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingNFT, setIsVerifyingNFT] = useState(false);

  // Memoize wallet address to prevent unnecessary re-queries
  const walletAddress = useMemo(
    () => (connected && publicKey ? publicKey.toString() : null),
    [connected, publicKey]
  );

  // Get player data
  const playerData = useQuery(api.players.getPlayer, walletAddress ? { walletAddress } : "skip");

  // Get maps from assets context
  const { maps: allMaps, characters: allCharacters } = useAssets();

  // Get current game state directly from blockchain
  const { activeGame } = useActiveGame();

  // Derive game state from blockchain
  const canPlaceBet = useMemo(() => {
    if (!activeGame) return true; // No game = can create new one

    // Status: 0 = open/waiting, 1 = closed/determining winner, 2 = finished
    const gameStatus = activeGame.status;
    const betCount = activeGame.betCount || 0;

    // Special case: Stuck/empty game (any status with 0 bets) - allow betting to create new game
    if (betCount === 0) {
      logger.ui.debug("[canPlaceBet] Empty game detected - allowing bet to create new game");
      return true;
    }

    // Allow betting if game is finished (to create new round)
    if (gameStatus === 2) return true;

    // Block betting if game is determining winner (and has bets)
    if (gameStatus === 1) return false;

    // If game is open (status 0), check if betting window is still open
    if (gameStatus === 0) {
      const currentTime = Math.floor(Date.now() / 1000);
      const endTimestamp =
        activeGame.endTimestamp?.toNumber() || activeGame.endDate?.toNumber() || 0;
      const timeRemaining = endTimestamp - currentTime;

      return timeRemaining > 0; // Can bet if time remaining
    }

    // Default: don't allow betting for unknown statuses
    return false;
  }, [activeGame]);

  const handleIncrementBet = (increment: number) => {
    const currentAmount = parseFloat(betAmount) || 0;
    const newAmount = currentAmount + increment;
    // Cap at max bet
    const cappedAmount = Math.min(newAmount, MAX_BET_AMOUNT);
    setBetAmount(cappedAmount.toFixed(2));
  };

  const handlePlaceBet = useCallback(async () => {
    if (!connected || !publicKey || !playerData || !selectedCharacter) {
      toast.error("Please wait for data to load or select a character");
      return;
    }

    // Play insert coin sound via Phaser
    EventBus.emit("play-insert-coin-sound");

    // Check if player can place bet based on blockchain game state
    if (!canPlaceBet && activeGame) {
      const status = activeGame.status;
      if (status === 1) {
        toast.error("Game is determining winner, please wait...");
        return;
      } else if (status === 2) {
        // Game is finished - allow betting to create new round!
        logger.ui.debug("Previous game finished, placing bet will create new round");
        // Continue to place bet (don't return)
      } else {
        toast.error("Cannot place bet at this time");
        return;
      }
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) {
      toast.error(`Bet amount must be between ${MIN_BET_AMOUNT} and ${MAX_BET_AMOUNT} SOL`);
      return;
    }

    // Validate bet using hook
    const validation = await validateBet(amount);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid bet amount");
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate spawn position based on current time for randomness
      const now = Date.now();
      const angle = ((now % 1000) / 1000) * Math.PI * 2;
      const radius = 200;
      const centerX = 512;
      const centerY = 384;

      const spawnX = Math.floor(centerX + Math.cos(angle) * radius);
      const spawnY = Math.floor(centerY + Math.sin(angle) * radius);
      const position: [number, number] = [spawnX, spawnY];

      logger.ui.debug("[BettingPanel] Character data for bet:", {
        name: selectedCharacter.name,
        convexId: selectedCharacter._id,
        skinId: selectedCharacter.id,
        position,
      });

      // Safety check: Ensure character has a blockchain ID
      if (selectedCharacter.id === undefined || selectedCharacter.id === null) {
        toast.error("Character is missing blockchain ID. Please contact support.");
        logger.ui.error("[BettingPanel] Character missing blockchain ID:", selectedCharacter);
        return;
      }

      // SECURITY CHECK: Verify NFT ownership if character requires it
      const characterRequirements = allCharacters?.find(
        (c: { _id: any }) => c._id === selectedCharacter._id
      );
      const requiresNFT =
        characterRequirements &&
        "nftCollection" in characterRequirements &&
        characterRequirements.nftCollection;

      if (requiresNFT) {
        if (!externalWalletAddress) {
          toast.error("NFT Character Requires External Wallet", {
            description: `${selectedCharacter.name} is an exclusive character. Please connect your NFT wallet.`,
          });
          return;
        }

        setIsVerifyingNFT(true);
        logger.ui.debug(
          "[BettingPanel] Verifying NFT ownership for character:",
          selectedCharacter.name
        );

        try {
          const hasNFT = await verifyNFTOwnership({
            walletAddress: externalWalletAddress,
            collectionAddress: requiresNFT as string,
          });

          if (!hasNFT) {
            toast.error("NFT Verification Failed", {
              description: `You don't own the required NFT for ${selectedCharacter.name}. Please select a different character.`,
              duration: 5000,
            });
            logger.ui.error(
              "[BettingPanel] NFT verification failed for character:",
              selectedCharacter.name
            );
            return;
          }

          logger.ui.debug(
            "[BettingPanel] NFT verification successful for character:",
            selectedCharacter.name
          );
        } catch (error) {
          logger.ui.error("[BettingPanel] NFT verification error:", error);
          toast.error("Failed to verify NFT ownership", {
            description: "Please try again or select a different character.",
          });
          return;
        } finally {
          setIsVerifyingNFT(false);
        }
      }

      // Select a random map for the game
      let mapId = 0;
      if (allMaps && allMaps.length > 0) {
        const randomMap = allMaps[Math.floor(Math.random() * allMaps.length)];
        mapId = randomMap.id ?? 0;
        logger.ui.debug("[BettingPanel] Selected map:", randomMap.name, "ID:", mapId);
      }

      // Place bet
      const betResult = await placeBet(
        amount,
        selectedCharacter.id,
        playerData.displayName,
        position,
        mapId
      );
      const { signature: signatureHex, roundId, betIndex } = betResult;

      logger.ui.debug("[BettingPanel] Transaction successful:", {
        signature: signatureHex,
        roundId,
        betIndex,
      });

      // Show toast
      // const hasRealSignature = signatureHex && !signatureHex.startsWith("transaction_");
      // toast.success(`Tx placed!`, {
      //   description: hasRealSignature
      //     ? `${signatureHex.slice(0, 3)}...${signatureHex.slice(-3)}`
      //     : `Round ${roundId}, Bet ${betIndex}`,
      //   duration: 5000,
      //   action: hasRealSignature
      //     ? {
      //         label: "View",
      //         onClick: () => window.open(`https://solscan.io/tx/${signatureHex}`, "_blank"),
      //       }
      //     : undefined,
      // });

      // Emit event for game scene
      const eventData = {
        characterId: selectedCharacter.id,
        characterName: selectedCharacter.name,
        position: position,
        betAmount: amount,
        roundId: roundId,
        betIndex: betIndex,
        walletAddress: publicKey.toString(),
      };

      logger.ui.debug("[BettingPanel] 🎮 EMITTING player-bet-placed EVENT:", eventData);
      EventBus.emit("player-bet-placed", eventData);
      logger.ui.debug("[BettingPanel] ✅ Event emitted successfully");

      setBetAmount(DEFAULT_BET_AMOUNT.toString());
      onBetPlaced?.();
    } catch (error) {
      logger.ui.error("Failed to place bet:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const truncatedMessage = errorMessage.slice(0, 32);
      if (
        errorMessage.toLowerCase().includes("nft") ||
        errorMessage.toLowerCase().includes("collection")
      ) {
        toast.error("NFT Character Error", {
          description: truncatedMessage,
          duration: 6000,
        });
      } else {
        toast.error(truncatedMessage || "Failed to place bet");
      }
    } finally {
      setIsSubmitting(false);
      setIsVerifyingNFT(false);
    }
  }, [
    connected,
    publicKey,
    playerData,
    selectedCharacter,
    betAmount,
    canPlaceBet,
    activeGame,
    placeBet,
    validateBet,
    onBetPlaced,
    allCharacters,
    verifyNFTOwnership,
    externalWalletAddress,
    allMaps,
  ]);

  // Don't render if not connected
  if (!connected) {
    return null;
  }

  return (
    <div className="pt-2">
      <span className="text-amber-400 ">Balance</span>

      <div className="inline-flex items-center gap-1 pl-2">
        {!isLoadingBalance && (
          <img
            src="/sol-logo.svg"
            alt="SOL"
            className="w-3 h-3"
            style={{
              filter:
                "brightness(0) saturate(100%) invert(85%) sepia(23%) saturate(632%) hue-rotate(358deg) brightness(100%) contrast(92%)",
            }}
          />
        )}
        <span className="text-amber-300">{isLoadingBalance ? "..." : solBalance.toFixed(3)}</span>
      </div>
      <div className="flex items-center justify-between bg-gradient-to-b from-amber-900/50 to-amber-950/50 backdrop-blur-xs rounded-xl shadow-2xl shadow-amber-900/50 min-w-[560px] px-2 py-2 space-x-1">
        <div className="relative w-1/5">
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
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="Amount"
            min={MIN_BET_AMOUNT}
            max={MAX_BET_AMOUNT}
            step={DEFAULT_BET_AMOUNT}
            className="text-2xl w-full px-2 py-2 pl-8 bg-black/30 border border-amber-700/50 rounded-lg text-amber-100 placeholder-amber-600 text-center font-bold focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Quick bet buttons */}
        <div className="grid grid-cols-4 gap-2 w-2/5">
          <button
            onClick={() => handleIncrementBet(0.01)}
            className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 text-2xl font-bold transition-colors"
          >
            +0.01
          </button>
          <button
            onClick={() => handleIncrementBet(0.1)}
            className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 text-2xl font-bold transition-colors"
          >
            +0.1
          </button>
          <button
            onClick={() => handleIncrementBet(1)}
            className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 text-2xl font-bold transition-colors"
          >
            +1
          </button>
          <button
            onClick={() => setBetAmount(Math.min(solBalance - 0.001, MAX_BET_AMOUNT).toFixed(3))}
            className={`cursor-pointer py-1.5 bg-gradient-to-b from-amber-500 to-amber-900 hover:to-amber-600/80  rounded-lg text-amber-300 text-2xl  transition-colors ${styles.shineButton}`}
          >
            All-In
          </button>
        </div>

        {/* Place bet button with arcade press effect */}
        <button
          onClick={() => void handlePlaceBet()}
          disabled={isSubmitting || !canPlaceBet || isVerifyingNFT || !selectedCharacter}
          className={`
            text-2xl cursor-pointer flex justify-center items-center w-1/3 py-2
            bg-gradient-to-b from-amber-500 to-amber-700
            hover:to-amber-800 hover:text-amber-300
            disabled:from-gray-600 disabled:to-gray-700
            rounded-lg font-bold text-amber-100 uppercase tracking-wider
            transition-all duration-100
            hover:shadow-[0_5px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)]
            active:translate-y-[8px]
            disabled:opacity-50 disabled:cursor-not-allowed
            disabled:shadow-[0_4px_0_0_rgba(75,85,99,0.7)]
            ${styles.shineButton}
          `}
        >
          <img src="/assets/insert-coin.png" alt="Coin" className="h-6 mr-2" />
          {!selectedCharacter
            ? "Select Character"
            : isVerifyingNFT
              ? "Verifying..."
              : isSubmitting
                ? "Inserting..."
                : !canPlaceBet
                  ? "Closed"
                  : "Insert coin"}
        </button>
      </div>
    </div>
  );
});

export { BettingPanel };
