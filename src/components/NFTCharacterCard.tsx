import { Star, Lock } from 'lucide-react';
import { CharacterPreviewScene } from './CharacterPreviewScene';
import type { Id } from '../../convex/_generated/dataModel';

interface Character {
  _id: Id<"characters">;
  id?: number;
  name: string;
  description?: string;
  nftCollection?: string;
}

interface NFTCharacterCardProps {
  character: Character;
  isSelected: boolean;
  onSelect: () => void;
  isLocked?: boolean;
}

export function NFTCharacterCard({ 
  character, 
  isSelected, 
  onSelect, 
  isLocked = false 
}: NFTCharacterCardProps) {
  return (
    <div 
      className={`
        relative rounded-xl border-2 transition-all duration-200
        ${isSelected 
          ? 'border-purple-400 bg-purple-900/30 shadow-lg shadow-purple-500/50 scale-105' 
          : 'border-amber-600/50 bg-amber-900/20 hover:border-purple-400/70 hover:shadow-md'
        }
        ${isLocked 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer hover:scale-102'
        }
      `}
      onClick={!isLocked ? onSelect : undefined}
    >
      {/* NFT Badge */}
      <div className="absolute top-2 right-2 z-10">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
          <Star className="w-3 h-3 fill-current" />
          <span>NFT</span>
        </div>
      </div>
      
      {/* Character Preview */}
      <div className="p-4">
        <div className="w-full h-32 mb-3 flex items-center justify-center bg-black/20 rounded-lg overflow-hidden">
          <CharacterPreviewScene
            characterId={character._id}
            characterName={character.name}
            width={128}
            height={128}
          />
        </div>
        
        {/* Character Info */}
        <div className="text-center">
          <h3 className="text-amber-100 font-bold text-lg uppercase tracking-wide">
            {character.name}
          </h3>
          {character.description && (
            <p className="text-amber-400 text-sm mt-1 line-clamp-2">
              {character.description}
            </p>
          )}
        </div>
        
        {/* Selection Indicator */}
        {isSelected && !isLocked && (
          <div className="mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold py-2 rounded-lg text-center shadow-lg">
            ✓ Selected
          </div>
        )}
        
        {/* Locked Overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="text-center">
              <Lock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-300 text-sm font-bold">NFT Required</p>
              <p className="text-gray-400 text-xs mt-1">Own this NFT to unlock</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
