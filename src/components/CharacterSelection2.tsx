import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useQuery } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { BadgeCheck, Star, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [selectedNFTCharacters, setSelectedNFTCharacters] = useState<Character[]>([]);

  // Get all available characters from assets context (shared across app)

  // NFT character checking
  const {
    unlockedCharacters,
    isLoading: isLoadingNFTs,
    error: nftError,
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

  // Determine available characters based on NFT selection
  const availableCharacters = useMemo(() => {
    if (selectedNFTCharacters.length > 0) {
      return selectedNFTCharacters;
    }

    // Return only regular characters (no NFT requirement)
    if (allCharacters && allCharacters.length > 0) {
      return allCharacters.filter(
        (char: { nftCollection: null | undefined }) =>
          !char.nftCollection || char.nftCollection === null || char.nftCollection === undefined
      );
    }

    return [];
  }, [selectedNFTCharacters, allCharacters]);

  // Get current character based on index
  const currentCharacter = useMemo(() => {
    if (availableCharacters.length === 0) return null;
    return availableCharacters[currentCharacterIndex] || availableCharacters[0];
  }, [availableCharacters, currentCharacterIndex]);

  // Handle NFT character selection changes
  const handleNFTCharacterSelected = useCallback((characters: Character[]) => {
    // Reset carousel to first character
    setCurrentCharacterIndex(0);

    if (characters.length === 0) {
      toast.info("Switched back to regular characters", {
        description: `Browse using the arrows below`,
      });
    } else if (characters.length === 1) {
      toast.success(`${characters[0].name} is now your active character!`, {
        description: "This character will be used for your next bet",
        icon: "⭐",
      });
    } else {
      toast.success(`${characters.length} NFT characters unlocked!`, {
        description: `Browse your exclusive collection`,
        icon: "⭐",
      });
    }
  }, []);

  // Carousel navigation functions
  const goToPrevious = useCallback(() => {
    setCurrentCharacterIndex((prevIndex) => {
      const newIndex = prevIndex === 0 ? availableCharacters.length - 1 : prevIndex - 1;
      return newIndex;
    });
  }, [availableCharacters.length]);

  const goToNext = useCallback(() => {
    setCurrentCharacterIndex((prevIndex) => {
      const newIndex = prevIndex === availableCharacters.length - 1 ? 0 : prevIndex + 1;
      return newIndex;
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

  // Notify parent when character changes
  useEffect(() => {
    if (currentCharacter && onCharacterSelected) {
      onCharacterSelected(currentCharacter);
    }
  }, [currentCharacter, onCharacterSelected]);

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
            backgroundImage: "url(/assets/hud/charSelect.png)",
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
          }}
        >
          <div>
            {/* Character Preview - Center */}
            <div className="flex-1 flex flex-col items-center justify-start ">
              <div>
                <CharacterPreviewScene
                  characterId={currentCharacter._id}
                  characterName={currentCharacter.name}
                  isSpecial={!!currentCharacter.nftCollection}
                />
              </div>

              {/* Character Name */}
              <div className="text-center">
                <p className="text-amber-100 font-bold text-lg uppercase tracking-wider drop-shadow-lg">
                  {currentCharacter.name}
                </p>
                {/* Character Index */}
                <p className="text-amber-300/70 -mt-2 ">
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
              className={`absolute flex-col items-center gap-1 px-2 py-1.5 ml-40 mt-1 border-2 transition-all ${selectedNFTCharacters.length > 0 ? "border-purple-400 bg-purple-700 hover:bg-purple-600 active:bg-purple-800" : "border-amber-600 bg-amber-800 hover:bg-amber-700 active:bg-amber-900"} ${isLoadingNFTs ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
              style={{
                imageRendering: "pixelated",
                boxShadow:
                  selectedNFTCharacters.length > 0
                    ? "inset -2px -2px 0px rgba(139, 92, 246, 0.5), inset 2px 2px 0px rgba(216, 180, 254, 0.3)"
                    : "inset -2px -2px 0px rgba(120, 53, 15, 0.8), inset 2px 2px 0px rgba(251, 191, 36, 0.3)",
              }}
              title="Select exclusive NFT characters"
            >
              {selectedNFTCharacters.length === 0 && <Star className="w-4 h-4 fill-yellow-400" />}
              {selectedNFTCharacters.length > 0 && (
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
        selectedCharacters={selectedNFTCharacters}
        onSelectCharacters={setSelectedNFTCharacters}
        onNFTCharacterSelected={handleNFTCharacterSelected}
        unlockedCharacters={unlockedCharacters}
        isLoading={isLoadingNFTs}
        error={nftError}
        allExclusiveCharacters={(allExclusiveChars || []) as Character[]}
      />
    </>
  );
});

export { CharacterSelection2 };
