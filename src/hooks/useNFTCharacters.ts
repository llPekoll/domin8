import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Character } from "../types/character";
import { useState } from "react";

/**
 * Hook to check NFT ownership and return unlocked exclusive characters
 * Now uses cached holder data for instant verification!
 *
 * @param externalWalletAddress - The user's external wallet address (e.g., Phantom)
 * @param embeddedWalletAddress - The user's embedded wallet address (Privy)
 * @returns Object containing unlocked characters, loading state, and any errors
 */
export function useNFTCharacters(externalWalletAddress: string | null, embeddedWalletAddress?: string | null) {
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Get all exclusive characters from Convex
  const allExclusiveChars = useQuery(api.characters.getExclusiveCharacters);
  
  // Get all holder data for all collections at once
  const allHolders = useQuery(api.nftHolderScanner.getAllHoldersForWallets, {
    walletAddresses: [externalWalletAddress, embeddedWalletAddress].filter(Boolean) as string[]
  });
  
  // Manual refresh action
  const manualRefresh = useAction(api.nftHolderScanner.manualRefreshWalletNFTs);

  // Calculate unlocked characters based on cached data
  const unlockedCharacters: Character[] = [];
  const isLoading = !allExclusiveChars || !allHolders;
  
  if (allExclusiveChars && allHolders) {
    console.log('[useNFTCharacters] Checking holders:', allHolders);
    
    for (const character of allExclusiveChars) {
      if (!character.nftCollection) continue;
      
      // Check if any of the user's wallets own NFTs from this collection
      const ownsNFT = allHolders.some(holder => 
        holder.collectionAddress === character.nftCollection
      );
      
      if (ownsNFT) {
        console.log(`[useNFTCharacters] ✅ Unlocked ${character.name}`);
        unlockedCharacters.push(character as Character);
      }
    }
  }

  /**
   * Manual refresh function for users who just bought NFTs
   * Rate-limited to once every 5 minutes per wallet
   */
  const refreshNFTStatus = async () => {
    const walletsToCheck = [
      externalWalletAddress,
      embeddedWalletAddress
    ].filter((addr): addr is string => Boolean(addr));
    
    if (walletsToCheck.length === 0 || !allExclusiveChars) {
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      let refreshSuccess = false;
      
      // Refresh each wallet for each collection
      for (const walletAddr of walletsToCheck) {
        for (const character of allExclusiveChars) {
          if (!character.nftCollection) continue;
          
          try {
            console.log(`[useNFTCharacters] Manual refresh: ${walletAddr.slice(0,8)}... for ${character.name}`);
            
            const result = await manualRefresh({
              walletAddress: walletAddr,
              collectionAddress: character.nftCollection
            });
            
            if (result.success) {
              refreshSuccess = true;
              console.log(`[useNFTCharacters] Refresh result: ${result.hasNFT ? 'HAS NFT' : 'NO NFT'}`);
            } else if (result.rateLimited) {
              console.log(`[useNFTCharacters] Rate limited: ${result.error}`);
              setError(result.error);
              break;
            }
          } catch (err) {
            console.log(`[useNFTCharacters] Manual refresh error:`, err);
          }
        }
      }
      
      if (refreshSuccess) {
        console.log('[useNFTCharacters] Manual refresh completed, cache will update automatically');
      }
      
    } catch (err) {
      console.error("Manual refresh failed:", err);
      setError("Failed to refresh NFT status");
    } finally {
      setRefreshing(false);
    }
  };

  return { 
    unlockedCharacters, 
    isLoading, 
    error,
    refreshNFTStatus,
    refreshing
  };
}
