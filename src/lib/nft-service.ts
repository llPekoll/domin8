import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import type { Character } from '../types/character';

/**
 * Client-side NFT checking (for UX only, NOT security)
 * Shows users their unlocked characters immediately
 */
export async function getUserNFTCollections(
  walletAddress: string,
  connection: Connection
): Promise<string[]> {
  try {
    console.log(`[NFT Service] Checking collections for wallet: ${walletAddress}`);
    
    // Use Helius RPC URL for enhanced NFT support
    const rpcUrl = connection.rpcEndpoint;
    console.log(`[NFT Service] Using RPC: ${rpcUrl}`);
    
    // Check if we're using Helius (supports getAssetsByOwner)
    if (rpcUrl.includes('helius')) {
      console.log('[NFT Service] Using Helius enhanced API');
      
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'nft-check',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 1000,
            displayOptions: {
              showCollectionMetadata: true
            }
          }
        })
      });
      
      const data = await response.json();
      console.log(`[NFT Service] Helius response:`, data);
      
      if (data.result?.items) {
        const collections = new Set<string>();
        
        for (const asset of data.result.items) {
          // Check grouping field (standard for Metaplex Core)
          const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
          if (collectionGrouping?.group_value) {
            collections.add(collectionGrouping.group_value);
            console.log(`[NFT Service] Found collection: ${collectionGrouping.group_value}`);
          }
          
          // Also check direct collection field
          if (asset.collection?.address) {
            collections.add(asset.collection.address);
            console.log(`[NFT Service] Found collection (direct): ${asset.collection.address}`);
          }
        }
        
        const result = Array.from(collections);
        console.log(`[NFT Service] Total unique collections found: ${result.length}`, result);
        return result;
      }
    }
    
    // Fallback to old Metaplex SDK for non-Helius RPCs
    console.log('[NFT Service] Using fallback Metaplex SDK');
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
    
    const result = Array.from(collections);
    console.log(`[NFT Service] Fallback found ${result.length} collections:`, result);
    return result;
    
  } catch (error) {
    console.error('[NFT Service] Failed to fetch NFT collections:', error);
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
