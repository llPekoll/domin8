import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { Connection } from '@solana/web3.js';
import { api } from '../../convex/_generated/api';
import { getUserNFTCollections } from '../lib/nft-service';
import { getSolanaRpcUrl } from '../lib/utils';
import type { Id } from '../../convex/_generated/dataModel';

interface Character {
  _id: Id<"characters">;
  id?: number;
  name: string;
  description?: string;
  nftCollection?: string;
  assetPath: string;
  isActive: boolean;
}

/**
 * Hook to check NFT ownership and return unlocked exclusive characters
 * 
 * @param externalWalletAddress - The user's external wallet address (e.g., Phantom)
 * @returns Object containing unlocked characters, loading state, and any errors
 */
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
