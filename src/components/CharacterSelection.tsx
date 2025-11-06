import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useQuery, useAction } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useGameContract } from "../hooks/useGameContract";
import { useActiveGame } from "../hooks/useActiveGame";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { BadgeCheck, Shuffle, Star } from "lucide-react";
import { CharacterPreviewScene } from "./CharacterPreviewScene";
import { NFTCharacterModal } from "./NFTCharacterModal";
import styles from "./ButtonShine.module.css";
import { Buffer } from "buffer";
import { EventBus } from "../game/EventBus";
import { logger } from "../lib/logger";
import { useAssets } from "../contexts/AssetsContext";

interface Character {
  _id: Id<"characters">;
  id?: number; // Blockchain ID
  name: string;
  description?: string;
  nftCollection?: string;
}

// Make Buffer available globally for Privy
if (typeof window !== "undefined") {
  window.Buffer = Buffer;
}

interface CharacterSelectionProps {
  onParticipantAdded?: () => void;
}

const CharacterSelection = memo(function CharacterSelection({
  onParticipantAdded,
}: CharacterSelectionProps) {
  const { connected, publicKey, solBalance, isLoadingBalance, externalWalletAddress } =
    usePrivyWallet();
  const { placeBet, validateBet } = useGameContract();

  // NFT verification action
  const verifyNFTOwnership = useAction(api.nft.verifyNFTOwnership);

  const [currentCharacter, setCurrentCharacter] = useState<Character | null>(null);
  const [betAmount, setBetAmount] = useState<string>("0.1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingNFT, setIsVerifyingNFT] = useState(false);

  // NFT character selection state
  const [showNFTModal, setShowNFTModal] = useState(false);
  const [selectedNFTCharacters, setSelectedNFTCharacters] = useState<Character[]>([]);

  // Memoize wallet address to prevent unnecessary re-queries
  const walletAddress = useMemo(
    () => (connected && publicKey ? publicKey.toString() : null),
    [connected, publicKey]
  );

  // Get player data - only fetch once
  const playerData = useQuery(api.players.getPlayer, walletAddress ? { walletAddress } : "skip");

  // Get all available characters and maps from assets context (shared across app)
  const { characters: allCharacters, maps: allMaps } = useAssets();

  // Get current game state directly from blockchain (real-time, no polling lag)
  const { activeGame } = useActiveGame();

  // NFT character checking
  const {
    unlockedCharacters,
    isLoading: isLoadingNFTs,
    error: nftError,
  } = useNFTCharacters(externalWalletAddress);

  // Surface NFT hook errors as user-friendly toasts
  useEffect(() => {
    if (nftError) {
      toast.error("Failed to load exclusive characters", {
        description: String(nftError),
      });
    }
  }, [nftError]);

  // Get all exclusive characters for modal
  const allExclusiveChars = useQuery(api.characters.getExclusiveCharacters);

  // Derive game state from blockchain (not Convex, to avoid stale data)
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

  const playerParticipantCount = 0; // TODO: Track participant count when needed

  // Handle NFT character selection changes
  const handleNFTCharacterSelected = useCallback(
    (characters: Character[]) => {
      if (characters.length === 0) {
        // No characters selected - reset to random regular character
        if (allCharacters && allCharacters.length > 0) {
          const regularCharacters = allCharacters.filter(
            (char: { nftCollection: null | undefined }) =>
              !char.nftCollection || char.nftCollection === null || char.nftCollection === undefined
          );

          if (regularCharacters.length > 0) {
            const randomChar =
              regularCharacters[Math.floor(Math.random() * regularCharacters.length)];
            setCurrentCharacter(randomChar);
            toast.info("Switched back to regular characters", {
              description: `Now using ${randomChar.name}`,
            });
          }
        }
      } else if (characters.length === 1) {
        // Single character selected - set as current character
        setCurrentCharacter(characters[0]);
        toast.success(`${characters[0].name} is now your active character!`, {
          description: "This character will be used for your next bet",
          icon: "⭐",
        });
      } else {
        // Multiple characters selected - randomly pick one to display
        const randomIndex = Math.floor(Math.random() * characters.length);
        const selectedCharacter = characters[randomIndex];
        setCurrentCharacter(selectedCharacter);
        toast.success(`${selectedCharacter.name} selected from your pool!`, {
          description: `${characters.length} characters available, randomly showing ${selectedCharacter.name}`,
          icon: "⭐",
        });
      }
    },
    [allCharacters]
  );

  // Get character for bet (NFT pool or regular)
  const getCharacterForBet = useCallback(() => {
    logger.ui.debug("[getCharacterForBet] Selected NFT characters:", selectedNFTCharacters);
    if (selectedNFTCharacters.length === 1) {
      // Single NFT character selected - should already be set as currentCharacter
      return currentCharacter;
    } else if (selectedNFTCharacters.length > 1) {
      // Multiple NFT characters - randomly pick from pool
      const randomIndex = Math.floor(Math.random() * selectedNFTCharacters.length);
      return selectedNFTCharacters[randomIndex];
    }
    return currentCharacter; // Fallback to default character
  }, [selectedNFTCharacters, currentCharacter]);

  // Initialize with random character when characters load (regular characters only, not NFT exclusive)
  useEffect(() => {
    if (allCharacters && allCharacters.length > 0 && !currentCharacter) {
      // Filter to only regular characters (no NFT collection requirement)
      const regularCharacters = allCharacters.filter(
        (char: { nftCollection: null | undefined }) =>
          !char.nftCollection || char.nftCollection === null || char.nftCollection === undefined
      );

      if (regularCharacters.length > 0) {
        const randomChar = regularCharacters[Math.floor(Math.random() * regularCharacters.length)];
        setCurrentCharacter(randomChar);
      }
    }
  }, [allCharacters, currentCharacter]);

  const handleReroll = () => {
    if (!allCharacters || allCharacters.length === 0) {
      toast.error("No characters available");
      return;
    }

    const availableCharacters = allCharacters.filter(
      (c: { _id: Id<"characters"> | undefined }) => c._id !== currentCharacter?._id
    );
    if (availableCharacters.length === 0) {
      toast.error("No other characters available");
      return;
    }

    const randomChar = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
    setCurrentCharacter(randomChar);
  };

  const handleQuickBet = (amount: number) => {
    setBetAmount(amount.toString());
  };

  const handlePlaceBet = useCallback(async () => {
    if (!connected || !publicKey || !playerData || !currentCharacter) {
      toast.error("Please wait for data to load");
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
    if (isNaN(amount) || amount < 0.1 || amount > 10) {
      toast.error("Bet amount must be between 0.1 and 10 SOL");
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
      // Calculate character skin ID (convert Convex ID to numeric index)
      // We'll use a simple hash of the character ID to get a consistent numeric value

      // Calculate spawn position based on current time for randomness
      // Use a circular layout pattern that will be overridden by server later if needed
      const now = Date.now();
      const angle = ((now % 1000) / 1000) * Math.PI * 2; // Random angle based on time
      const radius = 200;
      const centerX = 512;
      const centerY = 384;

      const spawnX = Math.floor(centerX + Math.cos(angle) * radius);
      const spawnY = Math.floor(centerY + Math.sin(angle) * radius);
      const position: [number, number] = [spawnX, spawnY];

      // Get character to use for bet (NFT pool or regular)
      const characterToUse = getCharacterForBet();

      if (!characterToUse) {
        toast.error("No character selected. Please select a character.");
        return;
      }

      logger.ui.debug("[CharacterSelection] Character data for bet:", {
        name: characterToUse.name,
        convexId: characterToUse._id,
        skinId: characterToUse.id,
        position,
        isNFTCharacter: selectedNFTCharacters.some((c) => c._id === characterToUse._id),
      });

      // Safety check: Ensure character has a blockchain ID
      if (characterToUse.id === undefined || characterToUse.id === null) {
        toast.error("Character is missing blockchain ID. Please contact support.");
        logger.ui.error("[CharacterSelection] Character missing blockchain ID:", characterToUse);
        return;
      }

      // SECURITY CHECK: Verify NFT ownership if character requires it
      const characterRequirements = allCharacters?.find(
        (c: { _id: Id<"characters"> }) => c._id === characterToUse._id
      );
      const requiresNFT =
        characterRequirements &&
        "nftCollection" in characterRequirements &&
        characterRequirements.nftCollection;

      if (requiresNFT) {
        if (!externalWalletAddress) {
          toast.error("NFT Character Requires External Wallet", {
            description: `${characterToUse.name} is an exclusive character. Please connect your NFT wallet.`,
          });
          return;
        }

        setIsVerifyingNFT(true);
        logger.ui.debug(
          "[CharacterSelection] Verifying NFT ownership for character:",
          characterToUse.name
        );

        try {
          const hasNFT = await verifyNFTOwnership({
            walletAddress: externalWalletAddress,
            collectionAddress: requiresNFT as string,
          });

          if (!hasNFT) {
            toast.error("NFT Verification Failed", {
              description: `You don't own the required NFT for ${characterToUse.name}. Please select a different character.`,
              duration: 5000,
            });
            logger.ui.error(
              "[CharacterSelection] NFT verification failed for character:",
              characterToUse.name
            );
            return;
          }

          logger.ui.debug(
            "[CharacterSelection] NFT verification successful for character:",
            characterToUse.name
          );
        } catch (error) {
          logger.ui.error("[CharacterSelection] NFT verification error:", error);
          toast.error("Failed to verify NFT ownership", {
            description: "Please try again or select a different character.",
          });
          return;
        } finally {
          setIsVerifyingNFT(false);
        }
      }

      // Select a random map for the game (only applies when creating a new game)
      let mapId = 0; // Default map ID
      if (allMaps && allMaps.length > 0) {
        const randomMap = allMaps[Math.floor(Math.random() * allMaps.length)];
        mapId = randomMap.id ?? 0; // Use map's blockchain ID
        logger.ui.debug("[CharacterSelection] Selected map:", randomMap.name, "ID:", mapId);
      }

      // Use the hook's placeBet function with character data (skin + position + map stored on-chain)
      const betResult = await placeBet(amount, characterToUse.id, position, mapId);
      const { signature: signatureHex, roundId, betIndex } = betResult;

      logger.ui.debug("[CharacterSelection] Transaction successful:", {
        signature: signatureHex,
        roundId,
        betIndex,
      });

      // Show different toast based on whether we have a real signature
      const hasRealSignature = signatureHex && !signatureHex.startsWith("transaction_");
      toast.success(`Bet placed! 🎲 Game starting!`, {
        description: hasRealSignature
          ? `Transaction: ${signatureHex.slice(0, 8)}...${signatureHex.slice(-8)}`
          : `Round ${roundId}, Bet ${betIndex}`,
        duration: 5000,
        action: hasRealSignature
          ? {
              label: "View",
              onClick: () => window.open(`https://solscan.io/tx/${signatureHex}`, "_blank"),
            }
          : undefined,
      });

      // Emit event for DemoScene to handle spawning (demo is client-side only)
      // Real game (Game.ts) will spawn characters from blockchain subscription
      const eventData = {
        characterId: characterToUse.id, // Use blockchain numeric ID
        characterName: characterToUse.name,
        position: position,
        betAmount: amount,
        roundId: roundId,
        betIndex: betIndex,
        walletAddress: publicKey.toString(),
      };

      logger.ui.debug("[CharacterSelection] 🎮 EMITTING player-bet-placed EVENT:", eventData);
      EventBus.emit("player-bet-placed", eventData);
      logger.ui.debug("[CharacterSelection] ✅ Event emitted successfully");

      setBetAmount("0.1");

      // Auto-reroll to a new character for the next participant
      if (selectedNFTCharacters.length === 1) {
        // Single NFT character selected - don't reroll, keep the same character
        logger.ui.debug(
          "[CharacterSelection] Single NFT character selected, keeping same character"
        );
      } else if (selectedNFTCharacters.length > 1) {
        // Multiple NFT characters selected - reroll from the selected NFT pool
        const availableNFTCharacters = selectedNFTCharacters.filter(
          (c: any) => c._id !== characterToUse._id
        );
        if (availableNFTCharacters.length > 0) {
          const randomChar =
            availableNFTCharacters[Math.floor(Math.random() * availableNFTCharacters.length)];
          setCurrentCharacter(randomChar);
          logger.ui.debug(
            "[CharacterSelection] Rerolled to another NFT character:",
            randomChar.name
          );
        } else {
          // All NFT characters exhausted, pick randomly from pool again
          const randomChar =
            selectedNFTCharacters[Math.floor(Math.random() * selectedNFTCharacters.length)];
          setCurrentCharacter(randomChar);
        }
      } else if (allCharacters && allCharacters.length > 0) {
        // No NFT characters selected - reroll from regular characters only
        const regularCharacters = allCharacters.filter(
          (char: any) =>
            !char.nftCollection || char.nftCollection === null || char.nftCollection === undefined
        );
        const availableCharacters = regularCharacters.filter(
          (c: any) => c._id !== characterToUse._id
        );
        if (availableCharacters.length > 0) {
          const randomChar =
            availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
          setCurrentCharacter(randomChar);
          logger.ui.debug(
            "[CharacterSelection] Rerolled to another regular character:",
            randomChar.name
          );
        }
      }

      onParticipantAdded?.();
    } catch (error) {
      logger.ui.error("Failed to place bet:", error);

      // Check if error is related to NFT verification
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes("nft") ||
        errorMessage.toLowerCase().includes("collection")
      ) {
        toast.error("NFT Character Error", {
          description: errorMessage,
          duration: 6000,
        });
      } else {
        toast.error(errorMessage || "Failed to place bet");
      }
    } finally {
      setIsSubmitting(false);
      setIsVerifyingNFT(false);
    }
  }, [
    connected,
    publicKey,
    playerData,
    currentCharacter,
    betAmount,
    canPlaceBet,
    activeGame,
    placeBet,
    validateBet,
    onParticipantAdded,
    allCharacters,
    getCharacterForBet,
    selectedNFTCharacters,
    verifyNFTOwnership,
    externalWalletAddress,
    allMaps,
  ]);

  // Don't render if not connected or no character
  // In demo mode (activeGame is null), always show the component
  if (!connected || !currentCharacter) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 w-72 z-50">
      <div className="bg-gradient-to-b from-amber-900/95 to-amber-950/95 backdrop-blur-sm rounded-lg border-2 border-amber-600/60 shadow-2xl shadow-amber-900/50">
        {/* Character Section */}
        <div className="p-3 border-b border-amber-700/50">
          {/* Player participant count indicator */}
          {playerParticipantCount > 0 && (
            <div className="mb-2 text-center">
              <span className="text-sm text-amber-400 uppercase tracking-wide">
                You have {playerParticipantCount} participant{playerParticipantCount > 1 ? "s" : ""}{" "}
                in this game
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Phaser character preview */}
              <div className="w-16 h-16 flex-shrink-0">
                <CharacterPreviewScene
                  characterId={currentCharacter._id}
                  characterName={currentCharacter.name}
                  isSpecial={!!currentCharacter.nftCollection}
                  width={64}
                  height={64}
                />
              </div>
              <div>
                <p className="text-amber-100 font-bold text-xl uppercase tracking-wide">
                  {currentCharacter.name}
                </p>
              </div>
            </div>

            {/* Reroll Button */}
            <button
              onClick={handleReroll}
              className="p-2 mr-1 bg-amber-800/50 hover:bg-amber-700/50 rounded-lg border border-amber-600/50 transition-colors"
              disabled={!allCharacters || allCharacters.length <= 1}
            >
              <Shuffle className="w-4 h-4 text-amber-300" />
            </button>

            <div className="flex items-center gap-2">
              {/* NFT Character Button */}

              {externalWalletAddress && (
                <button
                  onClick={() => setShowNFTModal(true)}
                  disabled={isLoadingNFTs}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${selectedNFTCharacters.length > 0 ? "border-purple-400/50" : "border-transparent"} transition-all shadow-lg ${isLoadingNFTs ? "opacity-70 cursor-wait bg-gray-700/40" : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/20"}`}
                  title="Select exclusive NFT characters"
                >
                  {selectedNFTCharacters.length === 0 && (
                    <Star className="w-4 h-4 fill-yellow-400" />
                  )}
                  {selectedNFTCharacters.length > 0 && (
                    <BadgeCheck className="w-4 h-4 fill-purple-600 text-yellow-400" />
                  )}
                  <span className="text-sm text-white font-bold">NFT</span>
                  {isLoadingNFTs && (
                    <span className="text-xs text-amber-200 ml-2">Checking...</span>
                  )}
                  {selectedNFTCharacters.length > 0 && (
                    <span className="bg-purple-900/50 px-2 py-0.5 rounded-full text-xs font-bold text-white">
                      {selectedNFTCharacters.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Betting Section */}
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between text-lg uppercase tracking-wide">
            <span className="text-amber-400">Your Balance</span>
            <span className="text-amber-300">
              {isLoadingBalance ? "Loading..." : `${solBalance.toFixed(4)} SOL`}
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Amount"
              min={0.1}
              max={10}
              className="w-full px-3 py-2 bg-black/30 border border-amber-700/50 rounded-lg text-amber-900 placeholder-amber-600 text-center text-lg font-bold focus:outline-none focus:border-amber-900"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm font-bold">
              Sol
            </span>
          </div>

          {/* Quick bet buttons */}
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => handleQuickBet(0.1)}
              className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded text-amber-300 text-lg font-bold transition-colors"
            >
              0.1 Sol
            </button>
            <button
              onClick={() => handleQuickBet(0.5)}
              className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded text-amber-300 text-lg font-bold transition-colors"
            >
              0.5 Sol
            </button>
            <button
              onClick={() => handleQuickBet(1)}
              className="cursor-pointer py-1.5 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded text-amber-300 text-lg font-bold transition-colors"
            >
              1 Sol
            </button>
          </div>

          {/* Place bet button */}
          <button
            onClick={() => void handlePlaceBet()}
            disabled={isSubmitting || isLoadingBalance || !canPlaceBet || isVerifyingNFT}
            className={`cursor-pointer flex justify-center items-center w-full  bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-bold text-white uppercase tracking-wider text-lg transition-all shadow-lg shadow-amber-900/50 disabled:opacity-50 ${styles.shineButton}`}
          >
            <img src="/assets/insert-coin.png" alt="Coin" className="h-8 cursor-pointer" />
            {isVerifyingNFT
              ? "Verifying NFT..."
              : isSubmitting
                ? "Inserting..."
                : isLoadingBalance
                  ? "Loading..."
                  : !canPlaceBet
                    ? "Betting closed"
                    : "Insert coin"}
          </button>
        </div>
      </div>

      {/* NFT Character Modal */}
      <NFTCharacterModal
        open={showNFTModal}
        onOpenChange={setShowNFTModal}
        selectedCharacters={selectedNFTCharacters}
        onSelectCharacters={setSelectedNFTCharacters}
        onNFTCharacterSelected={handleNFTCharacterSelected}
        unlockedCharacters={unlockedCharacters}
        isLoading={isLoadingNFTs}
        error={nftError}
        allExclusiveCharacters={allExclusiveChars || []}
      />
    </div>
  );
});

export { CharacterSelection };
