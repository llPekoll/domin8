# NFT Character Integration Plan

## Overview
This document outlines the complete implementation plan for NFT-gated character selection in the Royal Rumble game. Players who own specific NFTs can unlock exclusive characters and use them in their bets.

---

## Security Architecture: Preventing NFT Character Cheating

### The Problem
If we only check NFT ownership client-side, a malicious user could:
1. Modify their frontend code to fake NFT ownership
2. Select exclusive characters they don't actually own
3. Submit bets with unauthorized character IDs

### The Solution: Multi-Layer Verification

#### Layer 1: Client-Side Check (UX)
- **Purpose**: Fast feedback for legitimate users
- **Benefit**: Shows available characters immediately without blockchain delay
- **Security Level**: Low (can be bypassed)

#### Layer 2: Convex Server-Side Verification (CRITICAL)
```typescript
// convex/players.ts - Add new mutation
export const verifyAndPlaceBet = mutation({
  args: {
    walletAddress: v.string(),
    externalWalletAddress: v.optional(v.string()),
    characterId: v.id("characters"),
    betAmount: v.number(),
    // ... other bet data
  },
  handler: async (ctx, args) => {
    // 1. Get the character being used
    const character = await ctx.db.get(args.characterId);
    
    // 2. If character requires NFT, verify ownership
    if (character?.nftCollection) {
      if (!args.externalWalletAddress) {
        throw new Error("NFT character requires external wallet");
      }
      
      // 3. SERVER-SIDE NFT verification via Convex action
      const hasNFT = await ctx.runAction(internal.nft.verifyOwnership, {
        walletAddress: args.externalWalletAddress,
        collectionAddress: character.nftCollection,
      });
      
      if (!hasNFT) {
        throw new Error("You don't own the required NFT for this character");
      }
    }
    
    // 4. Proceed with bet only if verified
    // ... rest of bet logic
  }
});
```

#### Layer 3: Convex Action for RPC Calls
```typescript
// convex/nft.ts - Server-side NFT verification
import { action } from "./_generated/server";
import { v } from "convex/values";

export const verifyOwnership = action({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Make RPC call from Convex server (not client)
    // This prevents client manipulation
    const response = await fetch(
      process.env.SOLANA_RPC_URL!,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            args.walletAddress,
            { mint: args.collectionAddress },
            { encoding: 'jsonParsed' }
          ]
        })
      }
    );
    
    const data = await response.json();
    return data.result?.value?.length > 0;
  }
});
```

### Recommended Security Flow
```
1. User selects NFT character (client-side)
2. Frontend sends bet with characterId + externalWalletAddress
3. Convex verifies NFT ownership server-side
4. If verified → allow bet, else → reject with error
5. User cannot bypass this check without hacking Convex servers
```

---

## Feature Requirements

### User Experience Flow
1. **Regular Users**: Continue using default characters (unchanged)
2. **NFT Holders**: 
   - See a special "NFT" button in character selection
   - Click button to open exclusive character modal
   - Select multiple NFT characters for their bet pool
   - Selected characters are randomly used for each bet
3. **All Users**: Can see locked NFT characters to encourage purchases

### Design Requirements
- **Visual Style**: Modern, rounded shapes, maintaining pixel art theme
- **Character Cards**: Show character preview, name, NFT badge
- **Locked State**: Display locked characters with lock icon overlay
- **Selection Indicator**: Highlight selected characters with purple glow

### Technical Requirements
- **NFT Detection**: Use Metaplex SDK for battle-tested NFT queries
- **Verification Timing**: Check NFT ownership on wallet connection
- **Refresh Strategy**: No automatic refresh; users disconnect/reconnect to update
- **Multiple Selection**: Allow users to select multiple NFT characters
- **Random Assignment**: When multiple NFT characters selected, randomly pick one per bet

---

## Implementation Plan

### Phase 1: Dependencies & Setup

#### 1.1 Install Metaplex SDK
```bash
npm install @metaplex-foundation/js @metaplex-foundation/mpl-token-metadata
```

#### 1.2 Environment Variables
Add to `.env.local`:
```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Or use Helius/QuickNode for better performance
```

---

### Phase 2: Backend - NFT Verification

#### 2.1 Create NFT Service (`src/lib/nft-service.ts`)
```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

/**
 * Client-side NFT checking (for UX only, NOT security)
 * Shows users their unlocked characters immediately
 */
export async function getUserNFTCollections(
  walletAddress: string,
  connection: Connection
): Promise<string[]> {
  try {
    const metaplex = new Metaplex(connection);
    const publicKey = new PublicKey(walletAddress);
    
    const nfts = await metaplex
      .nfts()
      .findAllByOwner({ owner: publicKey });
    
    // Extract unique collection addresses
    const collections = new Set<string>();
    nfts.forEach(nft => {
      if (nft.collection?.address) {
        collections.add(nft.collection.address.toString());
      }
    });
    
    return Array.from(collections);
  } catch (error) {
    console.error('Failed to fetch NFT collections:', error);
    return [];
  }
}

/**
 * Get unlocked exclusive characters for a wallet
 */
export async function getUnlockedCharacters(
  walletAddress: string,
  connection: Connection,
  exclusiveCharacters: Character[]
): Promise<Character[]> {
  const ownedCollections = await getUserNFTCollections(walletAddress, connection);
  
  return exclusiveCharacters.filter(char => 
    char.nftCollection && ownedCollections.includes(char.nftCollection)
  );
}
```

#### 2.2 Create Convex NFT Action (`convex/nft.ts`)
```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Server-side NFT verification (SECURITY CRITICAL)
 * Cannot be bypassed by client-side manipulation
 */
export const verifyNFTOwnership = action({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    
    try {
      // Method 1: Check via token accounts (Metaplex NFTs)
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            args.walletAddress,
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' }
          ]
        })
      });
      
      const data = await response.json();
      const accounts = data.result?.value || [];
      
      // Check if any token account matches the collection
      for (const account of accounts) {
        const mintAddress = account.account.data.parsed.info.mint;
        
        // Fetch token metadata to check collection
        const metadataResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [
              mintAddress,
              { encoding: 'jsonParsed' }
            ]
          })
        });
        
        // Simplified check - in production, use Metaplex metadata parser
        // to verify collection field matches args.collectionAddress
      }
      
      return false; // Default to false if no match found
      
    } catch (error) {
      console.error('NFT verification error:', error);
      return false; // Fail closed - deny access on error
    }
  }
});
```

#### 2.3 Update Characters Query (`convex/characters.ts`)
Already implemented:
```typescript
// Get all characters with NFT collection requirement (exclusive characters)
export const getExclusiveCharacters = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .filter((q) => q.neq(q.field("nftCollection"), undefined))
      .collect();

    return characters;
  },
});
```

#### 2.4 Secure Bet Placement (`convex/game.ts` or relevant file)
```typescript
export const placeBetWithCharacter = mutation({
  args: {
    characterId: v.id("characters"),
    externalWalletAddress: v.optional(v.string()),
    betAmount: v.number(),
    skinId: v.number(),
    position: v.array(v.number()),
    // ... other args
  },
  handler: async (ctx, args) => {
    const character = await ctx.db.get(args.characterId);
    
    if (!character) {
      throw new Error("Character not found");
    }
    
    // SECURITY: Verify NFT ownership for exclusive characters
    if (character.nftCollection) {
      if (!args.externalWalletAddress) {
        throw new Error("External wallet required for NFT characters");
      }
      
      const verified = await ctx.runAction(api.nft.verifyNFTOwnership, {
        walletAddress: args.externalWalletAddress,
        collectionAddress: character.nftCollection,
      });
      
      if (!verified) {
        throw new Error(
          `You don't own an NFT from the ${character.name} collection. ` +
          `Required collection: ${character.nftCollection}`
        );
      }
    }
    
    // Proceed with bet placement...
    // Call your existing blockchain bet placement logic
  }
});
```

---

### Phase 3: Frontend Components

#### 3.1 Create Custom Hook (`src/hooks/useNFTCharacters.ts`)
```typescript
import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { Connection } from '@solana/web3.js';
import { api } from '../../convex/_generated/api';
import { getUserNFTCollections } from '../lib/nft-service';
import { getSolanaRpcUrl } from '../lib/utils';

export function useNFTCharacters(externalWalletAddress: string | null) {
  const [unlockedCharacters, setUnlockedCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get all exclusive characters from Convex
  const allExclusiveChars = useQuery(api.characters.getExclusiveCharacters);
  
  useEffect(() => {
    if (!externalWalletAddress || !allExclusiveChars) {
      setUnlockedCharacters([]);
      return;
    }
    
    const checkNFTs = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const connection = new Connection(getSolanaRpcUrl(), 'confirmed');
        const collections = await getUserNFTCollections(externalWalletAddress, connection);
        
        // Match owned collections with exclusive characters
        const unlocked = allExclusiveChars.filter(char => 
          char.nftCollection && collections.includes(char.nftCollection)
        );
        
        setUnlockedCharacters(unlocked);
      } catch (err) {
        console.error('Failed to check NFT ownership:', err);
        setError('Failed to load exclusive characters');
        setUnlockedCharacters([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkNFTs();
  }, [externalWalletAddress, allExclusiveChars]);
  
  return { unlockedCharacters, isLoading, error };
}
```

#### 3.2 Create NFT Character Card (`src/components/NFTCharacterCard.tsx`)
```typescript
import { Star, Lock } from 'lucide-react';
import { CharacterPreviewScene } from './CharacterPreviewScene';
import type { Id } from '../../convex/_generated/dataModel';

interface Character {
  _id: Id<"characters">;
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
```

#### 3.3 Create NFT Modal (`src/components/NFTCharacterModal.tsx`)
```typescript
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
  allExclusiveCharacters: Character[];
}

export function NFTCharacterModal({
  open,
  onOpenChange,
  selectedCharacters,
  onSelectCharacters,
  unlockedCharacters,
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
            Select multiple NFT characters for your bet pool. They'll be randomly used for each bet you place.
          </DialogDescription>
        </DialogHeader>
        
        {/* Unlocked Characters Grid */}
        {unlockedCharacters.length > 0 ? (
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
```

#### 3.4 Update CharacterSelection Component
Add to `src/components/CharacterSelection.tsx`:

```typescript
// Import new components
import { NFTCharacterModal } from './NFTCharacterModal';
import { useNFTCharacters } from '../hooks/useNFTCharacters';
import { Star } from 'lucide-react';

// Add state in the component
const [showNFTModal, setShowNFTModal] = useState(false);
const [selectedNFTCharacters, setSelectedNFTCharacters] = useState<Character[]>([]);

// Use the NFT hook
const { unlockedCharacters, isLoading: isLoadingNFTs } = useNFTCharacters(externalWalletAddress);

// Get all exclusive characters for modal
const allExclusiveChars = useQuery(api.characters.getExclusiveCharacters);

// Modified character selection logic for bets
const getCharacterForBet = () => {
  if (selectedNFTCharacters.length > 0) {
    // Randomly pick from selected NFT pool
    const randomIndex = Math.floor(Math.random() * selectedNFTCharacters.length);
    return selectedNFTCharacters[randomIndex];
  }
  return currentCharacter; // Fallback to default character
};

// Update handlePlaceBet to use getCharacterForBet()
const handlePlaceBet = useCallback(async () => {
  // ... existing validation code ...
  
  const characterToUse = getCharacterForBet();
  
  // Use characterToUse for the bet
  // Pass characterToUse.id and externalWalletAddress for server-side verification
  
  // ... rest of bet placement logic ...
}, [/* add dependencies */]);

// Add NFT button in the character display section (around line 293-319)
// Replace the existing character display section with:

<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    {/* Phaser character preview */}
    <div className="w-16 h-16 flex-shrink-0">
      <CharacterPreviewScene
        characterId={currentCharacter._id}
        characterName={currentCharacter.name}
        width={64}
        height={64}
      />
    </div>
    <div>
      <p className="text-amber-100 font-bold text-xl uppercase tracking-wide">
        {currentCharacter.name}
      </p>
      <p className="text-amber-400 text-base">
        {selectedNFTCharacters.length > 0 
          ? `Pool: ${selectedNFTCharacters.length} NFT chars` 
          : 'Ready for battle'
        }
      </p>
    </div>
  </div>
  
  <div className="flex items-center gap-2">
    {/* NFT Character Button - Only show if external wallet has unlocked characters */}
    {externalWalletAddress && unlockedCharacters.length > 0 && (
      <button
        onClick={() => setShowNFTModal(true)}
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg border border-purple-400/50 transition-all shadow-lg shadow-purple-500/20"
        title="Select exclusive NFT characters"
      >
        <Star className="w-4 h-4 fill-current" />
        <span className="text-sm font-bold">NFT</span>
        {selectedNFTCharacters.length > 0 && (
          <span className="bg-purple-900/50 px-2 py-0.5 rounded-full text-xs font-bold">
            {selectedNFTCharacters.length}
          </span>
        )}
      </button>
    )}
    
    {/* Reroll Button */}
    <button
      onClick={handleReroll}
      className="p-2 bg-amber-800/50 hover:bg-amber-700/50 rounded-lg border border-amber-600/50 transition-colors"
      disabled={!allCharacters || allCharacters.length <= 1}
    >
      <Shuffle className="w-4 h-4 text-amber-300" />
    </button>
  </div>
</div>

// Add the modal at the bottom of the return statement (before closing </div>)
<NFTCharacterModal
  open={showNFTModal}
  onOpenChange={setShowNFTModal}
  selectedCharacters={selectedNFTCharacters}
  onSelectCharacters={setSelectedNFTCharacters}
  unlockedCharacters={unlockedCharacters}
  allExclusiveCharacters={allExclusiveChars || []}
/>
```

---

### Phase 4: Styling & Polish

#### Visual Indicators
- **NFT Badge**: Purple/indigo gradient with star icon
- **Selected Character**: Purple glow effect and scale transformation
- **Locked Characters**: Black overlay with lock icon
- **Character Pool Indicator**: Show count of selected NFT characters

#### Loading States
- Skeleton loaders while checking NFT ownership
- Spinner in modal while loading characters
- Disabled state for buttons during loading

#### Error Handling
```typescript
// In useNFTCharacters hook
if (error) {
  toast.error('Failed to load exclusive characters', {
    description: 'Please check your wallet connection',
  });
}

// In bet placement
try {
  // ... place bet
} catch (error) {
  if (error.message.includes('NFT')) {
    toast.error('NFT Verification Failed', {
      description: 'You don\'t own the required NFT for this character',
    });
  }
}
```

---

### Phase 5: Testing & Optimization

#### Security Testing
1. **Test NFT character without ownership**
   - Modify client to select NFT character
   - Verify server rejects the bet
   - Confirm error message is clear

2. **Test with owned NFT**
   - Connect wallet with NFT
   - Verify character unlocks
   - Place bet successfully

#### Performance Optimization
- **Caching**: Consider localStorage for NFT check results (5-10 min TTL)
- **Lazy Loading**: Load modal content only when opened
- **Debouncing**: Debounce NFT checks if needed

#### Edge Cases
- No external wallet (email/social login)
- Wallet with no NFTs
- Multiple NFTs from same collection
- Network errors during NFT check

---

## File Structure

```
src/
├── components/
│   ├── CharacterSelection.tsx (updated)
│   ├── NFTCharacterModal.tsx (new)
│   └── NFTCharacterCard.tsx (new)
├── lib/
│   └── nft-service.ts (new)
└── hooks/
    └── useNFTCharacters.ts (new)

convex/
├── nft.ts (new - server-side verification)
├── characters.ts (already updated)
└── players.ts (update with NFT verification in bet placement)
```

---

## Implementation Checklist

### Phase 1: Setup ✅
- [x] Schema updated with `nftCollection` field
- [x] Convex queries for exclusive characters
- [ ] Install Metaplex SDK dependencies
- [ ] Add environment variables

### Phase 2: Backend ⏳
- [ ] Create `nft-service.ts` for client-side NFT checking
- [ ] Create `convex/nft.ts` for server-side verification
- [ ] Update bet placement with NFT verification
- [ ] Test server-side rejection of unauthorized characters

### Phase 3: Frontend ⏳
- [ ] Create `useNFTCharacters` hook
- [ ] Create `NFTCharacterCard` component
- [ ] Create `NFTCharacterModal` component
- [ ] Update `CharacterSelection` with NFT button
- [ ] Add character pool indicator

### Phase 4: Polish ⏳
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add animations and transitions
- [ ] Test responsive design

### Phase 5: Security & Testing ⏳
- [ ] Test NFT verification security
- [ ] Test with/without external wallet
- [ ] Test multiple NFT selections
- [ ] Performance optimization
- [ ] User acceptance testing

---

## Future Enhancements

### Phase 2 Features
- Real-time NFT ownership refresh (background polling)
- NFT marketplace links for locked characters
- Character rarity tiers (common, rare, legendary)
- Achievement system for collecting NFT characters
- Character preview animations in modal
- NFT character leaderboard

### Advanced Security
- Rate limiting on NFT verification calls
- Caching verified NFTs to reduce RPC costs
- Webhook-based NFT transfer detection

---

## Notes

- **NFT Detection**: Happens on wallet connection, not per-bet
- **Refresh Strategy**: Users disconnect/reconnect to refresh NFT ownership
- **Multiple Selection**: Users can select multiple NFT characters for random assignment
- **Regular Characters**: Always available to everyone as fallback
- **Locked Preview**: Show locked NFT characters to encourage purchases

