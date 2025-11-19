import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";

/**
 * Server-side NFT verification (SECURITY CRITICAL)
 * Cannot be bypassed by client-side manipulation
 *
 * This action verifies that a wallet owns an NFT from a specific collection.
 * It runs on the Convex server, preventing client-side manipulation.
 *
 * Exported as both public action (for frontend) and internal action (for mutations)
 */
export const verifyNFTOwnership = action({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // reference ctx to avoid unused variable TypeScript error
    void ctx;
    return await verifyOwnership(args);
  }
});

export const verifyNFTOwnershipInternal = internalAction({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // reference ctx to avoid unused variable TypeScript error
    void ctx;
    return await verifyOwnership(args);
  }
});

// Shared verification logic
async function verifyOwnership(
  args: { walletAddress: string; collectionAddress: string }
): Promise<boolean> {
  console.log(`[NFT Verification] Checking wallet ${args.walletAddress} for collection ${args.collectionAddress}`);

  try {
    // Use the Helius RPC URL from environment (same as client uses)
    // This supports the Digital Asset Standard (DAS) API for NFT metadata
    const heliusRpcUrl = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL;
    
    if (heliusRpcUrl && heliusRpcUrl.includes('helius')) {
      console.log('[NFT Verification] Using Helius enhanced RPC');
      
      try {
        // Use Helius's getAssetsByOwner method for proper NFT collection detection
        const response = await fetch(heliusRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'nft-check',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: args.walletAddress,
              page: 1,
              limit: 1000,
              displayOptions: {
                showCollectionMetadata: true
              }
            }
          })
        });
        
        const data = await response.json();
        
        if (data.error) {
          console.log('[NFT Verification] Helius API error:', data.error);
        }
        
        if (data.result?.items) {
          console.log(`[NFT Verification] Found ${data.result.items.length} assets via Helius`);
          
          for (const asset of data.result.items) {
            // Check multiple possible collection fields
            // 1. Check grouping field (standard Metaplex)
            const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
            if (collectionGrouping?.group_value === args.collectionAddress) {
              console.log(`[NFT Verification] ✅ Found NFT from collection (via grouping)!`);
              return true;
            }
            
            // 2. Check collection field directly
            if (asset.collection?.address === args.collectionAddress ||
                asset.collection?.key === args.collectionAddress) {
              console.log(`[NFT Verification] ✅ Found NFT from collection (via collection field)!`);
              return true;
            }
            
            // 3. Check if the asset ID itself matches (for single-NFT collections)
            if (asset.id === args.collectionAddress) {
              console.log(`[NFT Verification] ✅ Found NFT matching collection address directly!`);
              return true;
            }
          }
          
          console.log(`[NFT Verification] No NFTs found from collection ${args.collectionAddress}`);
        } else {
          console.log('[NFT Verification] No assets found for wallet');
        }
      } catch (error) {
        console.log('[NFT Verification] Helius API request failed:', error);
      }
    }

    // Fallback: Use standard RPC to get token accounts
    const fallbackRpcUrl = heliusRpcUrl || "https://api.devnet.solana.com";
    console.log('[NFT Verification] Using standard RPC fallback method');
    
    const tokenAccountsResponse = await fetch(fallbackRpcUrl, {
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

    const tokenData = await tokenAccountsResponse.json();

    if (!tokenData.result?.value || tokenData.result.value.length === 0) {
      console.log('[NFT Verification] No token accounts found');
      return false;
    }

    // Filter for NFTs (amount = 1, decimals = 0)
    const nftMints: string[] = [];
    for (const account of tokenData.result.value) {
      try {
        const info = account.account.data.parsed.info;
        const tokenAmount = info.tokenAmount;

        if (
          tokenAmount.uiAmount === 1 &&
          tokenAmount.decimals === 0 &&
          tokenAmount.amount === '1'
        ) {
          nftMints.push(info.mint);
        }
      } catch (err) {
        continue;
      }
    }

    console.log(`[NFT Verification] Found ${nftMints.length} NFTs`);

    // Without proper metadata parsing, we can only do basic checks:
    // 1. Check if the collection address itself is owned as an NFT
    if (nftMints.includes(args.collectionAddress)) {
      console.log('[NFT Verification] ✅ Found exact mint match');
      return true;
    }

    // 2. For development/testing: Check against known collection NFTs
    // You would need to populate this with actual NFT mint addresses from the collection
    const knownCollectionNFTs: { [key: string]: string[] } = {
      // Example for the Pepe collection address from your seed data:
      '6v8wpUjNMkdSf5q1xK4Yjjhjy1cy6FPfCXi9qMduuSG1': [
        // Add known NFT mint addresses from this collection here
        // e.g., 'ABC123...', 'DEF456...'
      ]
    };

    if (knownCollectionNFTs[args.collectionAddress]) {
      for (const mint of nftMints) {
        if (knownCollectionNFTs[args.collectionAddress].includes(mint)) {
          console.log('[NFT Verification] ✅ Found NFT from known collection mapping');
          return true;
        }
      }
    }

    console.log('[NFT Verification] ❌ No NFT found from collection');
    return false;

  } catch (error) {
    console.error('[NFT Verification] Error:', error);
    // Fail closed - deny access on error for security
    return false;
  }
}
