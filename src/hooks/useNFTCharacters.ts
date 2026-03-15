import { useState, useEffect, useCallback } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import type { Character } from "../types/character";

/**
 * Hook to check NFT ownership and return unlocked exclusive characters
 * Now uses cached holder data for instant verification!
 *
 * @param externalWalletAddress - The user's external wallet address (e.g., Phantom)
 * @param embeddedWalletAddress - The user's embedded wallet address (Privy)
 * @returns Object containing unlocked characters, loading state, and any errors
 */
export function useNFTCharacters(
  externalWalletAddress: string | null,
  embeddedWalletAddress?: string | null
) {
  const { socket } = useSocket();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [allExclusiveChars, setAllExclusiveChars] = useState<any[] | null>(null);
  const [allHolders, setAllHolders] = useState<any[] | null>(null);

  const walletAddresses = [externalWalletAddress, embeddedWalletAddress].filter(Boolean) as string[];

  // Fetch exclusive characters
  useEffect(() => {
    if (!socket) return;

    socketRequest(socket, "get-exclusive-characters").then((res) => {
      if (res.success) {
        setAllExclusiveChars(res.data ?? []);
      }
    });
  }, [socket]);

  // Fetch holder data for wallets
  useEffect(() => {
    if (!socket || walletAddresses.length === 0) {
      setAllHolders([]);
      return;
    }

    socketRequest(socket, "get-all-holders-for-wallets", {
      walletAddresses,
    }).then((res) => {
      if (res.success) {
        setAllHolders(res.data ?? []);
      }
    });
  }, [socket, externalWalletAddress, embeddedWalletAddress]);

  // Calculate unlocked characters based on cached data
  const unlockedCharacters: Character[] = [];
  const isLoading = !allExclusiveChars || !allHolders;

  if (allExclusiveChars && allHolders) {
    for (const character of allExclusiveChars) {
      if (!character.nftCollection) continue;

      // Check if any of the user's wallets own NFTs from this collection
      const ownsNFT = allHolders.some(
        (holder: any) => holder.collectionAddress === character.nftCollection
      );

      if (ownsNFT) {
        unlockedCharacters.push(character as Character);
      }
    }
  }

  /**
   * Manual refresh function for users who just bought NFTs
   * Rate-limited to once every 5 minutes per wallet
   */
  const refreshNFTStatus = useCallback(async () => {
    if (!socket || walletAddresses.length === 0 || !allExclusiveChars) {
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      // Refresh each wallet for each collection
      for (const walletAddr of walletAddresses) {
        for (const character of allExclusiveChars) {
          if (!character.nftCollection) continue;

          try {
            const res = await socketRequest(socket, "manual-refresh-wallet-nfts", {
              walletAddress: walletAddr,
              collectionAddress: character.nftCollection,
            });

            if (res.success && res.data?.rateLimited) {
              console.log(`[useNFTCharacters] Rate limited: ${res.data.error}`);
              setError(res.data.error);
              break;
            }
          } catch (err) {
            console.log(`[useNFTCharacters] Manual refresh error:`, err);
          }
        }
      }

      // Re-fetch holder data after refresh
      const holdersRes = await socketRequest(socket, "get-all-holders-for-wallets", {
        walletAddresses,
      });
      if (holdersRes.success) {
        setAllHolders(holdersRes.data ?? []);
      }
    } catch (err) {
      console.error("Manual refresh failed:", err);
      setError("Failed to refresh NFT status");
    } finally {
      setRefreshing(false);
    }
  }, [socket, walletAddresses, allExclusiveChars]);

  return {
    unlockedCharacters,
    isLoading,
    error,
    refreshNFTStatus,
    refreshing,
  };
}
