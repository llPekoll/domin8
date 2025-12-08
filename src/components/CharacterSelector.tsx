import { useCallback, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { ChevronLeft, ChevronRight, Heart, Package, Crown, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { CharacterCard } from "./CharacterCard";
import { EvolutionCard } from "./EvolutionCard";
import type { Character } from "../types/character";

interface CharacterSelectorProps {
  selectedCharacterId: string | null;
  onCharacterSelected: (character: Character) => void;
}

/**
 * Character selector with horizontal scroll sections:
 * - Favorites (if any)
 * - Free Champions (evolution characters with star selectors)
 * - Lootbox Champions
 * - NFT Champions
 */
export function CharacterSelector({
  selectedCharacterId,
  onCharacterSelected,
}: CharacterSelectorProps) {
  const { walletAddress } = usePrivyWallet();

  // Get grouped characters with unlock status and favorites
  const groupedData = useQuery(
    api.characters.getCharactersGrouped,
    walletAddress ? { walletAddress } : "skip"
  );

  // Toggle favorite mutation
  const toggleFavorite = useMutation(api.favorites.toggleFavorite);

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(
    async (characterId: number) => {
      if (!walletAddress) return;
      await toggleFavorite({ walletAddress, characterId });
    },
    [walletAddress, toggleFavorite]
  );

  if (!groupedData) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-pulse text-indigo-400">Loading characters...</div>
      </div>
    );
  }

  const { favorites, evolution, lootbox, nft } = groupedData;

  return (
    <div className="space-y-6 overflow-y-auto max-h-[450px] pr-2">
      {/* Header */}
      <div>
        <h3 className="text-indigo-100 text-xl font-semibold mb-1">Select Character</h3>
        <p className="text-indigo-400/70 text-sm">Choose your fighter for battle</p>
      </div>

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <CharacterSection
          title="Favorites"
          icon={<Heart className="w-4 h-4 text-red-400 fill-red-400" />}
          count={favorites.length}
        >
          {favorites.map((char) => (
            <CharacterCard
              key={char._id}
              character={char as Character & { isUnlocked?: boolean; isFavorite?: boolean }}
              isSelected={selectedCharacterId === char._id}
              onSelect={() => char.isUnlocked && onCharacterSelected(char as Character)}
              onToggleFavorite={() => handleToggleFavorite(char.id)}
              showStars={char.characterType === "free"}
              size="md"
            />
          ))}
        </CharacterSection>
      )}

      {/* Free Champions (Evolution) Section - TFT Style */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-green-400" />
          <h4 className="text-indigo-200 font-medium">Free Champions</h4>
          <span className="text-indigo-500 text-xs">5 evolution lines</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {evolution.map((evoLine) => (
            <EvolutionCard
              key={evoLine.line}
              characters={evoLine.characters as (Character & { isUnlocked?: boolean; isFavorite?: boolean })[]}
              wins={evoLine.progress?.wins ?? 0}
              unlockedLevel={evoLine.progress?.unlockedLevel ?? 0}
              selectedCharacterId={selectedCharacterId}
              onSelect={onCharacterSelected}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      </div>

      {/* Lootbox Champions Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-400" />
          <h4 className="text-indigo-200 font-medium">Lootbox Champions</h4>
          <span className="text-indigo-500 text-xs">{lootbox.owned}/{lootbox.total} owned</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {lootbox.characters.map((char) => (
            <CharacterCard
              key={char._id}
              character={char as Character & { isUnlocked?: boolean; isFavorite?: boolean }}
              isSelected={selectedCharacterId === char._id}
              onSelect={() => char.isUnlocked && onCharacterSelected(char as Character)}
              onToggleFavorite={() => handleToggleFavorite(char.id)}
              size="md"
            />
          ))}
        </div>
      </div>

      {/* NFT Champions Section */}
      {nft.characters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-400" />
            <h4 className="text-indigo-200 font-medium">NFT Champions</h4>
            <span className="text-indigo-500 text-xs">{nft.characters.filter((c) => c.isUnlocked).length}/{nft.characters.length} owned</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {nft.characters.map((char) => (
              <CharacterCard
                key={char._id}
                character={char as Character & { isUnlocked?: boolean; isFavorite?: boolean }}
                isSelected={selectedCharacterId === char._id}
                onSelect={() => char.isUnlocked && onCharacterSelected(char as Character)}
                onToggleFavorite={() => handleToggleFavorite(char.id)}
                size="md"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Section wrapper with title and horizontal scroll
 */
function CharacterSection({
  title,
  icon,
  count,
  total,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  total?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-indigo-200 font-medium">{title}</h4>
        {count !== undefined && (
          <span className="text-indigo-500 text-xs">
            {count}{total !== undefined ? `/${total}` : ""} owned
          </span>
        )}
      </div>
      <HorizontalScroll>{children}</HorizontalScroll>
    </div>
  );
}

/**
 * Horizontal scrollable container with arrow buttons
 */
function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative group">
      {/* Left Arrow */}
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-indigo-500/30"
      >
        <ChevronLeft className="w-4 h-4 text-indigo-300" />
      </button>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-1 py-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>

      {/* Right Arrow */}
      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-indigo-500/30"
      >
        <ChevronRight className="w-4 h-4 text-indigo-300" />
      </button>
    </div>
  );
}
