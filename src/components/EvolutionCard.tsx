import { memo, useState } from "react";
import { Lock, Heart, Star } from "lucide-react";
import type { Character } from "../types/character";

interface EvolutionCharacter extends Character {
  isUnlocked?: boolean;
  isFavorite?: boolean;
}

interface EvolutionCardProps {
  /** All 3 evolution levels for this line (sorted by level 0, 1, 2) */
  characters: EvolutionCharacter[];
  /** Current wins for this evolution line */
  wins: number;
  /** Currently unlocked level (0, 1, or 2) */
  unlockedLevel: number;
  /** Currently selected character ID */
  selectedCharacterId?: string | null;
  /** Called when a character is selected */
  onSelect?: (character: Character) => void;
  /** Called when favorite is toggled */
  onToggleFavorite?: (characterId: number) => void;
}

/**
 * Evolution card with star selector (TFT-style)
 * - Shows one card per evolution line
 * - Star buttons (★ ★★ ★★★) to switch between levels
 * - Locked stars are greyed out
 * - Character preview changes when switching stars
 */
export const EvolutionCard = memo(function EvolutionCard({
  characters,
  wins,
  unlockedLevel,
  selectedCharacterId,
  onSelect,
  onToggleFavorite,
}: EvolutionCardProps) {
  // Sort characters by evolution level
  const sortedChars = [...characters].sort(
    (a, b) => (a.evolutionLevel ?? 0) - (b.evolutionLevel ?? 0)
  );

  // Default to highest unlocked level
  const [viewingLevel, setViewingLevel] = useState(unlockedLevel);

  // Get the character for the current viewing level
  const currentChar = sortedChars[viewingLevel] || sortedChars[0];
  if (!currentChar) return null;

  const isSelected = selectedCharacterId === currentChar._id;
  const isFavorite = currentChar.isFavorite ?? false;

  // Get image path
  const getImageSrc = () => {
    if (currentChar.assetVersion === "v1" || !currentChar.assetVersion) {
      return `/assets/characters/${currentChar.name}Splash.gif`;
    }
    return `/assets${currentChar.assetPath}`;
  };

  // Win requirements for each level
  const winsRequired = [0, 20, 50];

  return (
    <div
      className={`
        relative flex flex-col items-center p-2 rounded-xl border-2 transition-all
        ${
          isSelected
            ? "border-amber-400 bg-amber-900/30 shadow-lg shadow-amber-500/20"
            : "border-indigo-500/40 bg-black/50 hover:border-indigo-400/60 hover:bg-indigo-900/20"
        }
      `}
    >
      {/* Favorite Heart Button */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(currentChar.id);
          }}
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full hover:bg-black/40 transition-colors"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              isFavorite ? "fill-red-500 text-red-500" : "text-gray-500 hover:text-red-400"
            }`}
          />
        </button>
      )}

      {/* Character Image */}
      <button
        onClick={() => viewingLevel <= unlockedLevel && onSelect?.(currentChar)}
        disabled={viewingLevel > unlockedLevel}
        className="relative w-20 h-20 flex items-center justify-center overflow-hidden rounded-lg bg-black/30 cursor-pointer hover:bg-black/20 transition-colors"
      >
        <img
          src={getImageSrc()}
          alt={currentChar.displayName || currentChar.name}
          className={`w-full h-full object-contain ${viewingLevel > unlockedLevel ? "grayscale opacity-50" : ""}`}
          style={{ imageRendering: "pixelated" }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (!target.src.includes("Splash.gif")) {
              target.src = `/assets/characters/${currentChar.name}Splash.gif`;
            }
          }}
        />

        {/* Lock Overlay for locked levels */}
        {viewingLevel > unlockedLevel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <Lock className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </button>

      {/* Character Name */}
      <p
        className={`text-xs text-center mt-1.5 font-medium truncate w-full ${
          viewingLevel > unlockedLevel ? "text-gray-500" : "text-indigo-100"
        }`}
      >
        {currentChar.displayName || currentChar.name}
      </p>

      {/* Win Progress */}
      <p className="text-[10px] text-indigo-400/70 mt-0.5">{wins} wins</p>

      {/* Star Selector - 3 stars in a row */}
      <div className="flex items-center justify-center gap-1 mt-2">
        {[0, 1, 2].map((level) => {
          const isUnlocked = level <= unlockedLevel;
          const isViewing = level === viewingLevel;
          const needWins = winsRequired[level];

          return (
            <button
              key={level}
              onClick={() => setViewingLevel(level)}
              title={isUnlocked ? `Level ${level + 1}` : `Need ${needWins} wins`}
              className={`
                p-1 rounded transition-all
                ${
                  isViewing
                    ? "bg-amber-500/40 scale-110"
                    : isUnlocked
                      ? "hover:bg-amber-500/20"
                      : "opacity-40 cursor-not-allowed"
                }
              `}
            >
              <Star
                className={`w-5 h-5 ${
                  isUnlocked ? "fill-amber-400 text-amber-500" : "fill-gray-600 text-gray-500"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
});
