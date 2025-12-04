import { useCallback } from "react";
import { Lock, Check, Crown } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { useAssets } from "../contexts/AssetsContext";
import type { Character } from "../types/character";

interface CharacterSelectorProps {
  selectedCharacterId: string | null;
  onCharacterSelected: (character: Character) => void;
}

export function CharacterSelector({
  selectedCharacterId,
  onCharacterSelected,
}: CharacterSelectorProps) {
  const { walletAddress, externalWalletAddress } = usePrivyWallet();
  const { characters: allCharacters } = useAssets();
  const { unlockedCharacters } = useNFTCharacters(externalWalletAddress, walletAddress);

  // Check if a character is locked (NFT-gated but user doesn't own)
  const isCharacterLocked = useCallback(
    (character: Character) => {
      if (!character.nftCollection) return false;
      if (unlockedCharacters?.some((c) => c._id === character._id)) return false;
      return true;
    },
    [unlockedCharacters]
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-indigo-100 text-xl font-semibold mb-1">Select Character</h3>
        <p className="text-indigo-400/70 text-sm">Choose your fighter for battle</p>
      </div>

      {/* Character Grid */}
      <div className="grid grid-cols-4 gap-3">
        {allCharacters?.map((character) => {
          const isSelected = selectedCharacterId === character._id;
          const isLocked = isCharacterLocked(character);
          const isNFTCharacter = !!character.nftCollection;

          return (
            <button
              key={character._id}
              onClick={() => !isLocked && onCharacterSelected(character)}
              disabled={isLocked}
              className={`relative p-2 rounded-lg border-2 transition-all ${
                isSelected
                  ? "border-indigo-400 bg-indigo-600/30"
                  : isLocked
                    ? "border-gray-600 bg-gray-900/50 opacity-50 cursor-not-allowed"
                    : "border-indigo-500/30 bg-black/30 hover:border-indigo-400/60 hover:bg-indigo-900/20"
              }`}
            >
              {/* Character Preview */}
              <div className="w-full aspect-square flex items-center justify-center overflow-hidden">
                <img
                  src={`/assets/characters/${character.name}Splash.gif`}
                  alt={character.name}
                  className={`w-16 h-16 object-contain ${isLocked ? "grayscale" : ""}`}
                  style={{ imageRendering: "pixelated" }}
                />
              </div>

              {/* Character Name */}
              <p className="text-xs text-center text-indigo-200 mt-1 truncate">{character.name}</p>

              {/* NFT Badge - Crown for NFT chars (yellow if owned, gray if locked) */}
              {isNFTCharacter && (
                <div className="absolute top-1 right-1">
                  <Crown className={`w-4 h-4 ${isLocked ? "text-gray-500" : "text-yellow-500"}`} />
                </div>
              )}

              {/* Lock overlay for locked characters */}
              {isLocked && (
                <div className="absolute top-1 left-1">
                  <Lock className="w-4 h-4 text-gray-400" />
                </div>
              )}

              {/* Selected Check */}
              {isSelected && !isLocked && (
                <div className="absolute top-1 left-1 bg-indigo-500 rounded-full p-0.5">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
