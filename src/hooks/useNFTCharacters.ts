import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { Connection } from "@solana/web3.js";
import { api } from "../../convex/_generated/api";
import { getUserNFTCollections } from "../lib/nft-service";
import { getSolanaRpcUrl } from "../lib/utils";
import type { Character } from "../types/character";

/**
 * Hook to check NFT ownership and return unlocked exclusive characters
 *
 * @param externalWalletAddress - The user's external wallet address (e.g., Phantom)
 * @returns Object containing unlocked characters, loading state, and any errors
 */
export function useNFTCharacters(externalWalletAddress: string | null, embeddedWalletAddress?: string | null) {
  const [unlockedCharacters, setUnlockedCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get all exclusive characters from Convex
  const allExclusiveChars = useQuery(api.characters.getExclusiveCharacters);

  useEffect(() => {
    // Check if we have any wallet address to work with
    const walletsToCheck = [
      externalWalletAddress,
      embeddedWalletAddress
    ].filter((addr): addr is string => Boolean(addr));
    
    console.log('[useNFTCharacters] Checking wallets:', walletsToCheck);
    
    if (walletsToCheck.length === 0 || !allExclusiveChars) {
      console.log('[useNFTCharacters] No wallets to check or no exclusive chars');
      setUnlockedCharacters([]);
      return;
    }

    const checkNFTs = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const connection = new Connection(getSolanaRpcUrl(), "confirmed");
        
        // Check all available wallets for NFTs
        let allCollections: string[] = [];
        
        for (const walletAddr of walletsToCheck) {
          console.log(`[useNFTCharacters] Checking wallet: ${walletAddr}`);
          try {
            const collections = await getUserNFTCollections(walletAddr, connection);
            console.log(`[useNFTCharacters] Collections in ${walletAddr.slice(0,8)}...:`, collections);
            allCollections = [...allCollections, ...collections];
          } catch (err) {
            console.log(`[useNFTCharacters] Error checking ${walletAddr}:`, err);
          }
        }
        
        // Remove duplicates
        const uniqueCollections = [...new Set(allCollections)];
        console.log('[useNFTCharacters] All unique collections found:', uniqueCollections);
        console.log('[useNFTCharacters] Exclusive chars needed:', allExclusiveChars.map(c => ({ 
          name: c.name, 
          collection: c.nftCollection 
        })));

        // Match owned collections with exclusive characters
        const unlocked = allExclusiveChars.filter(char =>
          char.nftCollection && uniqueCollections.includes(char.nftCollection)
        );

        console.log('[useNFTCharacters] Unlocked characters:', unlocked.map(c => c.name));
        setUnlockedCharacters(unlocked as Character[]);
      } catch (err) {
        console.error("Failed to check NFT ownership:", err);
        setError("Failed to load exclusive characters");
        setUnlockedCharacters([]);
      } finally {
        setIsLoading(false);
      }
    };

    void checkNFTs();
  }, [externalWalletAddress, embeddedWalletAddress, allExclusiveChars]);

  return { unlockedCharacters, isLoading, error };
}
