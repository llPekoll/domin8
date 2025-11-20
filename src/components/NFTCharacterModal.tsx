import { useState } from "react";
import { Star, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { NFTCharacterCard } from "./NFTCharacterCard";
import type { Character } from "../types/character";

interface NFTCharacterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCharacters: Character[];
  onSelectCharacters: (characters: Character[]) => void;
  unlockedCharacters: Character[];
  isLoading?: boolean;
  error?: string | null;
  allExclusiveCharacters: Character[];
  onNFTCharacterSelected?: (characters: Character[]) => void;
  onRefreshNFTs?: () => Promise<void>;
  isRefreshing?: boolean;
}

export function NFTCharacterModal({
  open,
  onOpenChange,
  selectedCharacters,
  onSelectCharacters,
  unlockedCharacters,
  isLoading,
  error,
  allExclusiveCharacters,
  onNFTCharacterSelected,
  onRefreshNFTs,
  isRefreshing,
}: NFTCharacterModalProps) {
  const [tempSelected, setTempSelected] = useState<Character[]>(selectedCharacters);

  const toggleCharacter = (character: Character) => {
    setTempSelected((prev) => {
      const exists = prev.find((c) => c._id === character._id);
      if (exists) {
        return prev.filter((c) => c._id !== character._id);
      } else {
        return [...prev, character];
      }
    });
  };

  const handleSave = () => {
    onSelectCharacters(tempSelected);

    // Notify parent about character selection changes (all scenarios)
    if (onNFTCharacterSelected) {
      onNFTCharacterSelected(tempSelected);
    }

    onOpenChange(false);

    // Commented to avoid toast spam (as we already have one in CharacterSelection.tsx)
    // if (tempSelected.length > 0) {
    //   if (tempSelected.length === 1) {
    //     toast.success(`Exclusive character selected!`, {
    //       description: `${tempSelected[0].name} will be used for your next bet`,
    //       icon: '⭐',
    //     });
    //   } else {
    //     toast.success(`${tempSelected.length} exclusive characters selected!`, {
    //       description: 'These will be randomly used for your bets',
    //       icon: '⭐',
    //     });
    //   }
    // } else {
    //   toast.info('Using regular characters for bets');
    // }
  };

  const lockedCharacters = allExclusiveCharacters.filter(
    (c) => !unlockedCharacters.find((u) => u._id === c._id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lvw max-h-[85vh] overflow-y-auto bg-gradient-to-b from-amber-950/98 to-amber-900/98 border-1 border-purple-500/50 backdrop-blur-sm [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-amber-950/30 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-b [&::-webkit-scrollbar-thumb]:from-purple-600 [&::-webkit-scrollbar-thumb]:to-purple-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-purple-500/30 hover:[&::-webkit-scrollbar-thumb]:from-purple-500 hover:[&::-webkit-scrollbar-thumb]:to-purple-600 [&::-webkit-scrollbar-corner]:bg-amber-950/30">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-amber-100 flex items-center gap-2">
              <Star className="w-6 h-6 text-purple-400 fill-current" />
              Your Exclusive Characters
            </DialogTitle>
            {onRefreshNFTs && (
              <Button
                onClick={onRefreshNFTs}
                disabled={isRefreshing || isLoading}
                variant="outline"
                size="sm"
                className="border-purple-500 text-purple-300 hover:bg-purple-900/30 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh NFTs'}
              </Button>
            )}
          </div>
          <DialogDescription className="text-amber-300">
            Select characters for your exclusive pool. One character will be displayed and used for
            bets, or select none to use regular characters.
            {onRefreshNFTs && (
              <span className="block mt-2 text-sm text-amber-400">
                Just bought an NFT? Click "Refresh NFTs" to update your collection.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Unlocked Characters Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-amber-300">Checking your NFTs…</p>
            <p className="text-amber-500 text-sm mt-2">This may take a few seconds.</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-400">Failed to check NFTs</p>
            <p className="text-amber-400 text-sm mt-2">{error}</p>
          </div>
        ) : unlockedCharacters.length > 0 ? (
          <div>
            <h3 className="text-amber-200 font-bold mb-3 text-lg">
              Unlocked Characters ({unlockedCharacters.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {unlockedCharacters.map((character) => (
                <NFTCharacterCard
                  key={character._id}
                  character={character}
                  isSelected={tempSelected.some((c) => c._id === character._id)}
                  onSelect={() => toggleCharacter(character)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-amber-400">No exclusive characters unlocked yet</p>
            <p className="text-amber-500 text-sm mt-2">
              Own NFTs from partner collections to unlock exclusive characters!
            </p>
          </div>
        )}

        {/* Locked Characters Grid (preview to encourage purchases) */}
        {lockedCharacters.length > 0 && (
          <div className="mt-6 border-t border-amber-800/50 pt-6">
            <h3 className="text-gray-400 font-bold mb-3 text-lg">
              Locked Characters ({lockedCharacters.length})
            </h3>
            <p className="text-gray-500 text-sm mb-3">
              Own these NFT collections to unlock exclusive characters
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {lockedCharacters.map((character) => (
                <NFTCharacterCard
                  key={character._id}
                  character={character}
                  isSelected={false}
                  onSelect={() => {}}
                  isLocked
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-amber-600 text-amber-300 hover:bg-amber-900/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold"
          >
            Save Selection ({tempSelected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
