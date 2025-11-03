import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { NFTCharacterCard } from './NFTCharacterCard';
import type { Id } from '../../convex/_generated/dataModel';

interface Character {
  _id: Id<"characters">;
  id?: number;
  name: string;
  description?: string;
  nftCollection?: string;
}

interface NFTCharacterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCharacters: Character[];
  onSelectCharacters: (characters: Character[]) => void;
  unlockedCharacters: Character[];
  isLoading?: boolean;
  error?: string | null;
  allExclusiveCharacters: Character[];
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
}: NFTCharacterModalProps) {
  const [tempSelected, setTempSelected] = useState<Character[]>(selectedCharacters);
  
  const toggleCharacter = (character: Character) => {
    setTempSelected(prev => {
      const exists = prev.find(c => c._id === character._id);
      if (exists) {
        return prev.filter(c => c._id !== character._id);
      } else {
        return [...prev, character];
      }
    });
  };
  
  const handleSave = () => {
    onSelectCharacters(tempSelected);
    onOpenChange(false);
    
    if (tempSelected.length > 0) {
      toast.success(`${tempSelected.length} exclusive character(s) selected!`, {
        description: 'These will be randomly used for your bets',
        icon: '⭐',
      });
    } else {
      toast.info('Using regular characters for bets');
    }
  };
  
  const lockedCharacters = allExclusiveCharacters.filter(
    c => !unlockedCharacters.find(u => u._id === c._id)
  );
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-gradient-to-b from-amber-950/98 to-amber-900/98 border-2 border-purple-500/50 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-amber-100 flex items-center gap-2">
            <Star className="w-6 h-6 text-purple-400 fill-current" />
            Your Exclusive Characters
          </DialogTitle>
          <DialogDescription className="text-amber-300">
            Select one or multiple NFT characters for your bet pool. They'll be randomly used for each bet you place.
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
              {unlockedCharacters.map(character => (
                <NFTCharacterCard
                  key={character._id}
                  character={character}
                  isSelected={tempSelected.some(c => c._id === character._id)}
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
              {lockedCharacters.map(character => (
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
