import { memo } from "react";
import { Lock, Heart, Crown, Star } from "lucide-react";
import type { Character } from "../types/character";

interface CharacterCardProps {
  character: Character & {
    isUnlocked?: boolean;
    isFavorite?: boolean;
  };
  isSelected?: boolean;
  onSelect?: () => void;
  onToggleFavorite?: () => void;
  showStars?: boolean; // Show evolution stars
  evolutionLevel?: number; // 0, 1, 2
  size?: "sm" | "md" | "lg";
}

/**
 * Character card component with:
 * - Evolution stars (1-3 based on level)
 * - Lock overlay for locked characters
 * - Favorite heart icon
 * - Rarity glow for lootbox characters
 */
export const CharacterCard = memo(function CharacterCard({
  character,
  isSelected = false,
  onSelect,
  onToggleFavorite,
  showStars = false,
  evolutionLevel,
  size = "md",
}: CharacterCardProps) {
  const isLocked = character.isUnlocked === false;
  const isFavorite = character.isFavorite ?? false;
  const isNFT = character.characterType === "nft";
  const isEvolution = character.characterType === "free";
  const rarity = character.rarity;

  // Size classes - removed fixed width to allow grid to control
  const sizeClasses = {
    sm: "min-h-20",
    md: "min-h-24",
    lg: "min-h-28",
  };

  const imgSizeClasses = {
    sm: "w-12 h-12",
    md: "w-14 h-14",
    lg: "w-16 h-16",
  };

  // Rarity glow colors
  const rarityGlow = {
    common: "",
    rare: "ring-2 ring-blue-400/50 shadow-blue-400/30",
    legendary: "ring-2 ring-amber-400/50 shadow-amber-400/30 shadow-lg",
  };

  // Get image path - handle v1 splash gifs vs v2 spritesheets
  const getImageSrc = () => {
    if (character.assetVersion === "v1" || !character.assetVersion) {
      // V1 characters use splash gifs
      return `/assets/characters/${character.name}Splash.gif`;
    } else {
      // V2 characters - use the spritesheet png
      // assetPath is like "/characters/v2/bear.png"
      return `/assets${character.assetPath}`;
    }
  };

  // Render stars for evolution characters
  const renderStars = () => {
    if (!showStars || !isEvolution) return null;

    const level = evolutionLevel ?? character.evolutionLevel ?? 0;
    const totalStars = 3;

    return (
      <div className="flex gap-0.5 justify-center mt-1">
        {Array.from({ length: totalStars }).map((_, i) => (
          <Star
            key={i}
            className={`w-3 h-3 ${
              i <= level
                ? "fill-yellow-400 text-yellow-500"
                : "fill-gray-600 text-gray-500"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <button
      onClick={() => !isLocked && onSelect?.()}
      disabled={isLocked}
      className={`
        relative flex flex-col items-center p-1.5 rounded-lg border-2 transition-all
        ${sizeClasses[size]}
        ${isSelected
          ? "border-indigo-400 bg-indigo-600/40 scale-105"
          : isLocked
            ? "border-gray-700 bg-gray-900/60 opacity-60 cursor-not-allowed"
            : "border-indigo-500/30 bg-black/40 hover:border-indigo-400/60 hover:bg-indigo-900/30 cursor-pointer"
        }
        ${rarity && !isLocked ? rarityGlow[rarity] : ""}
      `}
    >
      {/* Favorite Heart Button */}
      {onToggleFavorite && !isLocked && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded-full hover:bg-black/30 transition-colors"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors ${
              isFavorite
                ? "fill-red-500 text-red-500"
                : "text-gray-400 hover:text-red-400"
            }`}
          />
        </button>
      )}

      {/* NFT Crown Badge */}
      {isNFT && (
        <div className="absolute top-0.5 left-0.5">
          <Crown
            className={`w-4 h-4 ${
              isLocked ? "text-gray-500" : "text-yellow-500 fill-yellow-400"
            }`}
          />
        </div>
      )}

      {/* Character Image */}
      <div className={`relative ${imgSizeClasses[size]} flex items-center justify-center overflow-hidden`}>
        <img
          src={getImageSrc()}
          alt={character.displayName || character.name}
          className={`w-full h-full object-contain ${isLocked ? "grayscale" : ""}`}
          style={{ imageRendering: "pixelated" }}
          onError={(e) => {
            // Fallback to v1 splash if v2 fails
            const target = e.target as HTMLImageElement;
            if (!target.src.includes("Splash.gif")) {
              target.src = `/assets/characters/${character.name}Splash.gif`;
            }
          }}
        />

        {/* Lock Overlay */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
            <Lock className="w-5 h-5 text-gray-400" />
          </div>
        )}
      </div>

      {/* Character Name */}
      <p className={`text-[10px] text-center truncate w-full mt-0.5 ${
        isLocked ? "text-gray-500" : "text-indigo-200"
      }`}>
        {character.displayName || character.name}
      </p>

      {/* Evolution Stars */}
      {renderStars()}
    </button>
  );
});
