import { useState, useCallback, useMemo, memo } from "react";
import { useQuery, useAction } from "convex/react";
import { useActiveWallet } from "../contexts/ActiveWalletContext";
import { useGameContract } from "../hooks/useGameContract";
import { useActiveGame } from "../hooks/useActiveGame";
import { useFundWallet } from "../hooks/useFundWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { EventBus } from "../game/EventBus";
import { logger } from "../lib/logger";
import { useAssets } from "../contexts/AssetsContext";
import type { Character } from "../types/character";
import styles from "./ButtonShine.module.css";
import { Plus, Wallet } from "lucide-react";
import { BotDialog } from "./BotDialog";
import { BotControlTab } from "./BotControlTab";

const MIN_BET_AMOUNT = 0.001;
const MAX_BET_AMOUNT = 10;
const DEFAULT_BET_AMOUNT = MIN_BET_AMOUNT;

interface BettingPanelMobileProps {
  selectedCharacter: Character | null;
  onBetPlaced?: () => void;
}

const BettingPanelMobile = memo(function BettingPanelMobile({
  selectedCharacter,
  onBetPlaced,
}: BettingPanelMobileProps) {
  const {
    connected,
    activePublicKey: publicKey,
    solBalance,
    externalWalletAddress,
    embeddedWalletAddress,
  } = useActiveWallet();
  const { placeBet, validateBet } = useGameContract();
  const { handleAddFunds } = useFundWallet();

  const [betAmount, setBetAmount] = useState<string>(DEFAULT_BET_AMOUNT.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [botDialogOpen, setBotDialogOpen] = useState(false);

  // Use embedded wallet for player data queries
  const walletAddress = useMemo(
    () => embeddedWalletAddress,
    [embeddedWalletAddress]
  );

  const { unlockedCharacters } = useNFTCharacters(externalWalletAddress, walletAddress);
  const verifyCachedNFT = useAction(api.nftHolderScanner.verifyCachedNFTOwnership);
  const playerData = useQuery(api.players.getPlayer, walletAddress ? { walletAddress } : "skip");
  const { maps: allMaps, characters: allCharacters } = useAssets();
  const { activeGame } = useActiveGame();

  const canPlaceBet = useMemo(() => {
    if (!activeGame) return true;
    const gameStatus = activeGame.status;
    const betCount = activeGame.betCount || 0;

    if (betCount === 0) return true;
    if (gameStatus === 2) return true;
    if (gameStatus === 1) return false;

    if (gameStatus === 0) {
      const currentTime = Math.floor(Date.now() / 1000);
      const endTimestamp =
        activeGame.endTimestamp?.toNumber() || activeGame.endDate?.toNumber() || 0;
      return endTimestamp - currentTime > 0;
    }

    return false;
  }, [activeGame]);

  const hasInsufficientBalance = useMemo(() => {
    if (solBalance === null) return false;
    return solBalance < MIN_BET_AMOUNT + 0.001;
  }, [solBalance]);

  const isSelectedCharacterLocked = useMemo(() => {
    if (!selectedCharacter) return false;
    if (!selectedCharacter.nftCollection) return false;
    if (unlockedCharacters?.some((c) => c._id === selectedCharacter._id)) return false;
    return true;
  }, [selectedCharacter, unlockedCharacters]);

  const handleIncrementBet = (increment: number) => {
    const currentAmount = parseFloat(betAmount) || 0;
    const newAmount = Math.min(currentAmount + increment, MAX_BET_AMOUNT);
    setBetAmount(newAmount.toFixed(3));
  };

  const handlePlaceBet = useCallback(async () => {
    if (!connected || !publicKey || !playerData || !selectedCharacter) {
      toast.error("Please wait for data to load or select a character");
      return;
    }

    EventBus.emit("play-insert-coin-sound");

    if (!canPlaceBet && activeGame) {
      const status = activeGame.status;
      if (status === 1) {
        toast.error("Game has ended, please wait for next round...");
        return;
      } else if (status !== 2) {
        toast.error("Cannot place bet at this time");
        return;
      }
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) {
      toast.error(`Bet amount must be between ${MIN_BET_AMOUNT} and ${MAX_BET_AMOUNT} SOL`);
      return;
    }

    const validation = await validateBet(amount);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid bet amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const now = Date.now();
      const angle = ((now % 1000) / 1000) * Math.PI * 2;
      const radius = 200;
      const spawnX = Math.floor(512 + Math.cos(angle) * radius);
      const spawnY = Math.floor(384 + Math.sin(angle) * radius);
      const position: [number, number] = [spawnX, spawnY];

      if (selectedCharacter.id === undefined || selectedCharacter.id === null) {
        toast.error("Character is missing blockchain ID");
        return;
      }

      const characterRequirements = allCharacters?.find(
        (c: { _id: string; nftCollection?: string }) => c._id === selectedCharacter._id
      );
      const requiresNFT =
        characterRequirements &&
        "nftCollection" in characterRequirements &&
        characterRequirements.nftCollection;

      if (requiresNFT) {
        if (!externalWalletAddress) {
          toast.error("NFT Character Requires External Wallet");
          return;
        }

        const cachedResult = await verifyCachedNFT({
          walletAddress: externalWalletAddress,
          collectionAddress: requiresNFT as string,
        });

        if (!cachedResult?.hasNFT) {
          toast.error("NFT Not Found");
          return;
        }
      }

      const betResult = await placeBet(amount, selectedCharacter.id, position);
      const { signature: signatureHex, roundId, betIndex } = betResult;

      logger.ui.debug("[BettingPanelMobile] Transaction successful:", {
        signature: signatureHex,
        roundId,
        betIndex,
      });

      EventBus.emit("player-bet-placed", {
        characterId: selectedCharacter.id,
        characterName: selectedCharacter.name,
        position,
        betAmount: amount,
        roundId,
        betIndex,
        walletAddress: publicKey.toString(),
      });

      onBetPlaced?.();
    } catch (error) {
      logger.ui.error("Failed to place bet:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(errorMessage.slice(0, 32) || "Failed to place bet");
    } finally {
      setIsSubmitting(false);
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
    verifyCachedNFT,
    externalWalletAddress,
    allMaps,
  ]);

  if (!connected) {
    return null;
  }

  // Insufficient balance state
  if (hasInsufficientBalance) {
    return (
      <div className="shrink-0 bg-linear-to-t from-gray-900 to-gray-800/90 border-t border-gray-700/50 p-3">
        <button
          onClick={() => walletAddress && handleAddFunds(walletAddress)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-bold text-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Add Funds to Play
          <Wallet className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // Locked character state
  if (isSelectedCharacterLocked) {
    return (
      <div className="shrink-0 bg-linear-to-t from-gray-900 to-gray-800/90 border-t border-gray-700/50 p-3">
        <div className="text-center text-red-400 text-sm py-2">
          This character requires an NFT. Select a different character.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Bot Control Tab - positioned above the panel */}
      <div className="flex justify-end px-3">
        <BotControlTab onClick={() => setBotDialogOpen(true)} />
      </div>

      <div className="shrink-0 bg-linear-to-t from-amber-950 to-amber-900/90 border-t border-amber-600/30 p-3 space-y-2">
        {/* Row 1: Input + Quick bet buttons */}
        <div className="flex items-center gap-2">
          {/* SOL Input */}
          <div className="relative flex-1">
            <img
              src="/sol-logo.svg"
              alt="SOL"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{
                filter:
                  "brightness(0) saturate(100%) invert(66%) sepia(89%) saturate(470%) hue-rotate(359deg) brightness(97%) contrast(89%)",
              }}
            />
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              min={MIN_BET_AMOUNT}
              max={MAX_BET_AMOUNT}
              step={DEFAULT_BET_AMOUNT}
              className="w-full pl-7 pr-2 py-2 bg-black/40 border border-amber-600/50 rounded-lg text-amber-100 text-center font-bold text-lg focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Quick bet buttons */}
          <button
            onClick={() => handleIncrementBet(0.01)}
            className="px-3 py-2 bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors"
          >
            +.01
          </button>
          <button
            onClick={() => handleIncrementBet(0.1)}
            className="px-3 py-2 bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors"
          >
            +.1
          </button>
          <button
            onClick={() => handleIncrementBet(1)}
            className="px-3 py-2 bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors"
          >
            +1
          </button>
          <button
            onClick={() => setBetAmount(Math.min(solBalance! - 0.001, MAX_BET_AMOUNT).toFixed(3))}
            className={`px-3 py-2 bg-linear-to-b from-amber-500 to-amber-800 rounded-lg text-amber-100 font-bold transition-colors ${styles.shineButton}`}
          >
            MAX
          </button>
        </div>

        {/* Row 2: Place Bet button (full width) */}
        <button
          onClick={() => void handlePlaceBet()}
          disabled={isSubmitting || !canPlaceBet || !selectedCharacter}
          className={`
            w-full flex items-center justify-center gap-2 py-3
            bg-linear-to-b from-amber-500 to-amber-700
            hover:from-amber-400 hover:to-amber-600
            disabled:from-gray-600 disabled:to-gray-700
            rounded-xl font-bold text-lg text-amber-100 uppercase tracking-wider
            transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            ${styles.shineButton}
          `}
        >
          <img src="/assets/insert-coin.png" alt="Coin" className="h-6" />
          {!selectedCharacter
            ? "Select Character"
            : isSubmitting
              ? "Inserting..."
              : !canPlaceBet
                ? "Closed"
                : "Insert Coin"}
        </button>
      </div>

      {/* Bot Dialog */}
      <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
    </>
  );
});

export { BettingPanelMobile };
