import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import type { Id } from '../../convex/_generated/dataModel';

interface Character {
  _id: Id<"characters">;
  name: string;
  description?: string;
  nftCollection?: string;
}

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
