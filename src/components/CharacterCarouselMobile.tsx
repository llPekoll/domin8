import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { ChevronLeft, ChevronRight, Lock, Crown } from "lucide-react";
import { useAssets } from "../contexts/AssetsContext";
import { SpriteAnimator } from "./SpriteAnimator";
import type { Character } from "../types/character";

interface CharacterCarouselMobileProps {
  onCharacterSelected?: (character: Character | null) => void;
}

export function CharacterCarouselMobile({ onCharacterSelected }: CharacterCarouselMobileProps) {
  const { connected, externalWalletAddress, walletAddress } = usePrivyWallet();
  const { characters: allCharacters } = useAssets();

  const [currentCharacterIndex, setCurrentCharacterIndex] = useState<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { unlockedCharacters } = useNFTCharacters(externalWalletAddress, walletAddress);

  const availableCharacters = useMemo(() => {
    if (!allCharacters) return [];

    return [...allCharacters].sort((a, b) => {
      const aLocked = a.nftCollection && !unlockedCharacters?.some((c) => c._id === a._id);
      const bLocked = b.nftCollection && !unlockedCharacters?.some((c) => c._id === b._id);
      if (aLocked === bLocked) return 0;
      return aLocked ? 1 : -1;
    });
  }, [allCharacters, unlockedCharacters]);

  const isCharacterLocked = useCallback(
    (character: Character) => {
      if (!character.nftCollection) return false;
      if (unlockedCharacters?.some((c) => c._id === character._id)) return false;
      return true;
    },
    [unlockedCharacters]
  );

  const currentCharacter = useMemo(() => {
    if (availableCharacters.length === 0) return null;
    return availableCharacters[currentCharacterIndex] || availableCharacters[0];
  }, [availableCharacters, currentCharacterIndex]);

  const currentCharacterLocked = useMemo(() => {
    if (!currentCharacter) return false;
    return isCharacterLocked(currentCharacter);
  }, [currentCharacter, isCharacterLocked]);

  const goToPrevious = useCallback(() => {
    if (availableCharacters.length === 0) return;
    setCurrentCharacterIndex((prev) => (prev === 0 ? availableCharacters.length - 1 : prev - 1));
  }, [availableCharacters.length]);

  const goToNext = useCallback(() => {
    if (availableCharacters.length === 0) return;
    setCurrentCharacterIndex((prev) => (prev === availableCharacters.length - 1 ? 0 : prev + 1));
  }, [availableCharacters.length]);

  const selectCharacter = (index: number) => {
    setCurrentCharacterIndex(index);
  };

  // Notify parent when character changes
  useEffect(() => {
    if (currentCharacter && onCharacterSelected) {
      onCharacterSelected(currentCharacter);
    }
  }, [currentCharacter, onCharacterSelected]);

  // Initialize to first unlocked character
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (availableCharacters.length === 0 || hasInitialized.current) return;
    const firstUnlockedIndex = availableCharacters.findIndex((char) => !isCharacterLocked(char));
    if (firstUnlockedIndex !== -1) {
      setCurrentCharacterIndex(firstUnlockedIndex);
      hasInitialized.current = true;
    }
  }, [availableCharacters, isCharacterLocked]);

  // Scroll selected character into view
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const selectedElement = container.children[currentCharacterIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [currentCharacterIndex]);

  if (!connected || availableCharacters.length === 0) {
    return null;
  }

  return (
    <div className="flex-shrink-0 bg-black/40 border-y border-amber-500/20">
      <div className="flex items-center gap-2 px-2 py-2">
        {/* Left Arrow */}
        <button
          onClick={goToPrevious}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/50 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-amber-100" />
        </button>

        {/* Scrollable Character List */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {availableCharacters.map((character, index) => {
            const isSelected = index === currentCharacterIndex;
            const isLocked = isCharacterLocked(character);

            return (
              <button
                key={character._id}
                onClick={() => selectCharacter(index)}
                className={`
                  flex-shrink-0 relative w-14 h-14 rounded-lg border-2 transition-all overflow-hidden bg-black/30
                  ${isSelected ? "border-amber-400 ring-2 ring-amber-400/50" : "border-amber-600/30"}
                  ${isLocked ? "opacity-50 grayscale" : ""}
                `}
              >
                <SpriteAnimator
                  name={character.name.toLowerCase()}
                  animation="idle"
                  size={56}
                  scale={1.5}
                />

                {/* Lock overlay */}
                {isLocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Lock className="w-4 h-4 text-amber-400" />
                  </div>
                )}

                {/* NFT crown */}
                {character.nftCollection && !isLocked && (
                  <div className="absolute top-0 right-0">
                    <Crown className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Arrow */}
        <button
          onClick={goToNext}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/50 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-amber-100" />
        </button>
      </div>

      {/* Selected Character Name */}
      <div className="text-center pb-2">
        <span
          className={`text-sm font-semibold uppercase tracking-wide ${currentCharacterLocked ? "text-gray-400" : "text-amber-200"}`}
        >
          {currentCharacter?.name}
        </span>
        {currentCharacterLocked && (
          <span className="text-red-400 text-xs ml-2">(NFT Required)</span>
        )}
      </div>
    </div>
  );
}
