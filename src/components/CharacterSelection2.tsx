import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { useQuery } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { BadgeCheck, Star, ChevronLeft, ChevronRight, Lock, Crown } from "lucide-react";
import { CharacterPreviewScene } from "./CharacterPreviewScene";
import { NFTCharacterModal } from "./NFTCharacterModal";
import { useAssets } from "../contexts/AssetsContext";
import type { Character } from "../types/character";

interface CharacterSelectionProps {
  onCharacterSelected?: (character: Character | null) => void;
}

const CharacterSelection2 = memo(function CharacterSelection({
  onCharacterSelected,
}: CharacterSelectionProps) {
  const { connected, externalWalletAddress, walletAddress } = usePrivyWallet();
  const { characters: allCharacters } = useAssets();

  // Carousel state
  const [currentCharacterIndex, setCurrentCharacterIndex] = useState<number>(0);

  // NFT character selection state
  const [showNFTModal, setShowNFTModal] = useState(false);

  // Get all available characters from assets context (shared across app)

  // NFT character checking
  const {
    unlockedCharacters,
    isLoading: isLoadingNFTs,
    error: nftError,
    refreshNFTStatus,
    refreshing,
  } = useNFTCharacters(externalWalletAddress, walletAddress);

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

  // Show ALL characters (both regular and NFT-gated)
  // Sort: unlocked characters first, locked characters at the end
  const availableCharacters = useMemo(() => {
    if (!allCharacters) return [];

    const sorted = [...allCharacters].sort((a, b) => {
      const aLocked = a.nftCollection && !unlockedCharacters?.some((c) => c._id === a._id);
      const bLocked = b.nftCollection && !unlockedCharacters?.some((c) => c._id === b._id);

      // Unlocked (false) comes before locked (true)
      if (aLocked === bLocked) return 0;
      return aLocked ? 1 : -1;
    });

    return sorted;
  }, [allCharacters, unlockedCharacters]);

  // Check if current character is locked (NFT-gated but user doesn't own)
  const isCharacterLocked = useCallback(
    (character: Character) => {
      // If character has no NFT requirement, it's unlocked
      if (!character.nftCollection) return false;

      // If user has unlocked this character via NFT, it's unlocked
      if (unlockedCharacters && unlockedCharacters.some((c) => c._id === character._id)) {
        return false;
      }

      // Otherwise, it's locked
      return true;
    },
    [unlockedCharacters]
  );

  // Get current character based on index
  const currentCharacter = useMemo(() => {
    if (availableCharacters.length === 0) return null;
    return availableCharacters[currentCharacterIndex] || availableCharacters[0];
  }, [availableCharacters, currentCharacterIndex]);

  // Check if current character is locked
  const currentCharacterLocked = useMemo(() => {
    if (!currentCharacter) return false;
    return isCharacterLocked(currentCharacter);
  }, [currentCharacter, isCharacterLocked]);

  // Carousel navigation functions - show ALL characters (including locked ones)
  const goToPrevious = useCallback(() => {
    if (availableCharacters.length === 0) return;

    setCurrentCharacterIndex((prevIndex) => {
      return prevIndex === 0 ? availableCharacters.length - 1 : prevIndex - 1;
    });
  }, [availableCharacters.length]);

  const goToNext = useCallback(() => {
    if (availableCharacters.length === 0) return;

    setCurrentCharacterIndex((prevIndex) => {
      return prevIndex === availableCharacters.length - 1 ? 0 : prevIndex + 1;
    });
  }, [availableCharacters.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [goToPrevious, goToNext]);

  // Notify parent when character changes (always send character, even if locked)
  useEffect(() => {
    if (currentCharacter && onCharacterSelected) {
      onCharacterSelected(currentCharacter);
    }
  }, [currentCharacter, onCharacterSelected]);

  // On mount, ensure we start on an unlocked character (only once on load)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (availableCharacters.length === 0 || hasInitialized.current) return;

    // Find first unlocked character
    const firstUnlockedIndex = availableCharacters.findIndex((char) => !isCharacterLocked(char));

    if (firstUnlockedIndex !== -1) {
      setCurrentCharacterIndex(firstUnlockedIndex);
      hasInitialized.current = true;
    }
  }, [availableCharacters, isCharacterLocked]);

  // Don't render if not connected or no character
  if (!connected || !currentCharacter) {
    return null;
  }

  return (
    <>
      {/* Character Selection Carousel - Fixed Bottom Left */}
      <div className="fixed bottom-0 left-0 z-50">
        {/* Container with charSelect.png background */}
        <div
          className="relative w-[220px] h-[280px] flex flex-row items-start justify-between p-4 pl-1"
          style={{
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
          }}
        >
          <div>
            {/* Character Preview - Center */}
            <div className="flex-1 flex flex-col items-center justify-start ">
              <div className="relative">
                <div
                  className={currentCharacterLocked ? "opacity-30 grayscale" : ""}
                  style={{
                    filter: currentCharacterLocked ? "grayscale(100%)" : "none",
                  }}
                >
                  <CharacterPreviewScene
                    characterId={currentCharacter._id}
                    characterName={currentCharacter.name}
                    isSpecial={!!currentCharacter.nftCollection}
                  />
                </div>

                {/* Star Icon - Top Right (for unlocked NFT characters) */}
                {currentCharacter.nftCollection && !currentCharacterLocked && (
                  <div className="absolute top-2 right-1">
                    <Crown className="w-7 h-7 fill-yellow-400 text-yellow-500 drop-shadow-lg" />
                  </div>
                )}

                {/* Lock Icon Overlay */}
                {currentCharacterLocked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/60 rounded-full p-3 border-2 border-amber-600">
                      <Lock className="w-8 h-8 text-amber-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Character Name */}
              <div className="text-center">
                <p
                  className={`font-bold text-lg uppercase tracking-wider drop-shadow-lg ${currentCharacterLocked ? "text-gray-400" : "text-amber-100"}`}
                >
                  {currentCharacter.name}
                </p>
                {/* Character Index */}
                <p className="text-amber-300/70 -mt-1 text-sm">
                  {currentCharacterIndex + 1} / {availableCharacters.length}
                </p>
              </div>
            </div>

            {/* Navigation Arrows - Bottom */}
            <div className="flex items-center justify-center gap-8 mb-4">
              <button
                onClick={goToPrevious}
                disabled={availableCharacters.length <= 1}
                className="w-10 h-10 flex items-center justify-center bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-gray-700/30 disabled:opacity-50 border-2 border-amber-600/50 rounded-lg transition-all shadow-lg disabled:cursor-not-allowed"
                title="Previous character (Arrow Left)"
              >
                <ChevronLeft className="w-6 h-6 text-amber-100" />
              </button>

              <button
                onClick={goToNext}
                disabled={availableCharacters.length <= 1}
                className="w-10 h-10 flex items-center justify-center bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-gray-700/30 disabled:opacity-50 border-2 border-amber-600/50 rounded-lg transition-all shadow-lg disabled:cursor-not-allowed"
                title="Next character (Arrow Right)"
              >
                <ChevronRight className="w-6 h-6 text-amber-100" />
              </button>
            </div>
          </div>

          {/* NFT Button - Top Right */}
          {externalWalletAddress && (
            <button
              onClick={() => setShowNFTModal(true)}
              disabled={isLoadingNFTs}
              className={`absolute flex-col items-center gap-1 px-2 py-1.5 ml-40 mt-1 border-2 transition-all ${unlockedCharacters && unlockedCharacters.length > 0 ? "border-purple-400 bg-purple-700 hover:bg-purple-600 active:bg-purple-800" : "border-amber-600 bg-amber-800 hover:bg-amber-700 active:bg-amber-900"} ${isLoadingNFTs ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
              style={{
                imageRendering: "pixelated",
                boxShadow:
                  unlockedCharacters && unlockedCharacters.length > 0
                    ? "inset -2px -2px 0px rgba(139, 92, 246, 0.5), inset 2px 2px 0px rgba(216, 180, 254, 0.3)"
                    : "inset -2px -2px 0px rgba(120, 53, 15, 0.8), inset 2px 2px 0px rgba(251, 191, 36, 0.3)",
              }}
              title="View NFT characters"
            >
              {(!unlockedCharacters || unlockedCharacters.length === 0) && (
                <Star className="w-4 h-4 fill-yellow-400" />
              )}
              {unlockedCharacters && unlockedCharacters.length > 0 && (
                <BadgeCheck className="w-4 h-4 fill-purple-600 text-yellow-400" />
              )}
              <span
                className="text-xs text-white font-bold uppercase"
                style={{ textShadow: "1px 1px 0px rgba(0,0,0,0.8)" }}
              >
                NFT
              </span>
            </button>
          )}
        </div>
      </div>

      {/* NFT Character Modal */}
      <NFTCharacterModal
        open={showNFTModal}
        onOpenChange={setShowNFTModal}
        selectedCharacters={[]}
        onSelectCharacters={() => {}}
        onNFTCharacterSelected={() => {}}
        unlockedCharacters={unlockedCharacters}
        isLoading={isLoadingNFTs}
        error={nftError}
        allExclusiveCharacters={(allExclusiveChars || []) as Character[]}
        onRefreshNFTs={refreshNFTStatus}
        isRefreshing={refreshing}
      />
    </>
  );
});

export { CharacterSelection2 };
