/**
 * NFT Collection Holder Scanner
 *
 * Replaces real-time NFT verification with cached holder lists.
 * Scans all holders of NFT collections every 12 hours + manual refresh backup.
 */

import { internalAction, internalMutation, internalQuery, query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Main cron job: Scan all active NFT collections and cache their holders
 * Called every 12 hours by the cron scheduler
 */
export const scanAllCollectionHolders = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log('[NFT Holder Scanner] Starting 12-hour collection scan...');
    const startTime = Date.now();

    // Get all active characters with NFT collections
    const characters = await ctx.runQuery(internal.nftHolderScanner.getActiveNFTCollections);

    if (characters.length === 0) {
      console.log('[NFT Holder Scanner] No NFT-gated characters found, skipping scan');
      return { success: true, collectionsScanned: 0, totalHolders: 0 };
    }

    console.log(`[NFT Holder Scanner] Found ${characters.length} NFT-gated characters to scan`);

    let totalCollections = 0;
    let totalHolders = 0;

    for (const character of characters) {
      if (!character.nftCollection) continue;

      try {
        console.log(`[NFT Holder Scanner] Scanning collection: ${character.nftCollectionName} (${character.nftCollection})`);

        const result = await scanSingleCollection(character.nftCollection);

        if (result.success) {
          // Store all holders in database
          await ctx.runMutation(internal.nftHolderScanner.updateCollectionHolders, {
            collectionAddress: character.nftCollection,
            holders: result.holders,
            scanStats: {
              duration: result.scanDuration,
              totalHolders: result.holders.length,
              totalNfts: result.totalNfts
            }
          });

          totalCollections++;
          totalHolders += result.holders.length;
          console.log(`[NFT Holder Scanner] ✅ ${character.nftCollectionName}: ${result.holders.length} holders, ${result.totalNfts} NFTs`);
        } else {
          console.log(`[NFT Holder Scanner] ❌ ${character.nftCollectionName}: ${result.error}`);
        }

      } catch (error) {
        console.error(`[NFT Holder Scanner] Error scanning ${character.nftCollectionName}:`, error);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[NFT Holder Scanner] Scan completed in ${totalDuration}ms`);
    console.log(`[NFT Holder Scanner] ${totalCollections} collections, ${totalHolders} total holders`);

    return {
      success: true,
      collectionsScanned: totalCollections,
      totalHolders,
      duration: totalDuration
    };
  }
});

/**
 * Scan a single collection to get all holder addresses
 * Uses getAssetsByGroup to get ALL NFTs from the collection
 */
async function scanSingleCollection(collectionAddress: string): Promise<{
  success: boolean;
  holders: Array<{ walletAddress: string; nftCount: number }>;
  totalNfts: number;
  scanDuration: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const heliusRpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    if (!heliusRpcUrl) {
      throw new Error('SOLANA_RPC_ENDPOINT environment variable is not set');
    }
    const mainnetHeliusRpcUrl = heliusRpcUrl.replace('devnet', 'mainnet');

    // Track unique holders and their NFT counts
    const holderMap = new Map<string, number>();
    let page = 1;
    let totalNfts = 0;

    while (true) {
      console.log(`  [Collection Scan] Page ${page}...`);

      // Use Helius getAssetsByGroup to get ALL NFTs from this collection
      const response = await fetch(mainnetHeliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `collection-scan-${page}`,
          method: 'getAssetsByGroup',
          params: {
            groupKey: 'collection',
            groupValue: collectionAddress,
            page: page,
            limit: 1000
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        console.log(`  [Collection Scan] API error on page ${page}:`, data.error);
        break;
      }

      if (data.result?.items && data.result.items.length > 0) {
        console.log(`  [Collection Scan] Page ${page}: ${data.result.items.length} NFTs`);

        // Count NFTs per owner
        for (const asset of data.result.items) {
          if (asset.ownership?.owner) {
            const owner = asset.ownership.owner;
            holderMap.set(owner, (holderMap.get(owner) || 0) + 1);
            totalNfts++;
          }
        }

        // Check if we've reached the end
        if (data.result.items.length < 1000) {
          console.log(`  [Collection Scan] Reached end on page ${page}`);
          break;
        }

        page++;
      } else {
        console.log(`  [Collection Scan] No more assets on page ${page}`);
        break;
      }
    }

    // Convert map to array
    const holders = Array.from(holderMap.entries()).map(([walletAddress, nftCount]) => ({
      walletAddress,
      nftCount
    }));

    const scanDuration = Date.now() - startTime;

    return {
      success: true,
      holders,
      totalNfts,
      scanDuration
    };

  } catch (error) {
    return {
      success: false,
      holders: [],
      totalNfts: 0,
      scanDuration: Date.now() - startTime,
      error: String(error)
    };
  }
}

/**
 * Get all active characters that have NFT collection requirements (internal)
 */
export const getActiveNFTCollections = internalQuery({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db
      .query("characters")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .filter((q) => q.neq(q.field("nftCollection"), undefined))
      .collect();

    return characters;
  }
});

/**
 * Update the holder cache for a collection (replace all previous data)
 */
export const updateCollectionHolders = internalMutation({
  args: {
    collectionAddress: v.string(),
    holders: v.array(v.object({
      walletAddress: v.string(),
      nftCount: v.number()
    })),
    scanStats: v.object({
      duration: v.number(),
      totalHolders: v.number(),
      totalNfts: v.number()
    })
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete all previous entries for this collection
    const existingHolders = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_collection", (q) => q.eq("collectionAddress", args.collectionAddress))
      .collect();

    for (const holder of existingHolders) {
      await ctx.db.delete(holder._id);
    }

    // Insert new holder data
    for (const holder of args.holders) {
      await ctx.db.insert("nftCollectionHolders", {
        collectionAddress: args.collectionAddress,
        walletAddress: holder.walletAddress,
        nftCount: holder.nftCount,
        lastVerified: now,
        addedBy: "cron"
      });
    }

    console.log(`[NFT Holder Scanner] Updated cache for ${args.collectionAddress}: ${args.holders.length} holders`);
  }
});

/**
 * Check if a wallet owns NFTs from a collection (using cache)
 * This replaces the old real-time API verification
 */
export const checkCachedOwnership = query({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string()
  },
  handler: async (ctx, args) => {
    const holder = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_collection_and_wallet", (q) =>
        q.eq("collectionAddress", args.collectionAddress)
          .eq("walletAddress", args.walletAddress)
      )
      .first();

    return {
      hasNFT: !!holder,
      nftCount: holder?.nftCount || 0,
      lastVerified: holder?.lastVerified,
      addedBy: holder?.addedBy
    };
  }
});

/**
 * Get all holder records for specific wallet addresses
 * Used by frontend to efficiently check all collections at once
 */
export const getAllHoldersForWallets = query({
  args: {
    walletAddresses: v.array(v.string())
  },
  handler: async (ctx, args) => {
    if (args.walletAddresses.length === 0) {
      return [];
    }

    const allHolders = [];

    for (const walletAddress of args.walletAddresses) {
      const holders = await ctx.db
        .query("nftCollectionHolders")
        .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
        .collect();

      allHolders.push(...holders);
    }

    return allHolders;
  }
});

/**
 * Manual refresh: Check a specific wallet's NFT ownership and update cache
 * Rate-limited to prevent abuse (5-minute cooldown)
 */
export const manualRefreshWalletNFTs = action({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check rate limit
    const lastRefresh = await ctx.runQuery(internal.nftHolderScanner.getLastRefreshTimeInternal, {
      walletAddress: args.walletAddress
    });

    if (lastRefresh && now - lastRefresh < 5 * 60 * 1000) { // 5 minutes
      const remainingTime = Math.ceil((5 * 60 * 1000 - (now - lastRefresh)) / 1000);
      return {
        success: false,
        error: `Rate limited. Try again in ${remainingTime} seconds.`,
        rateLimited: true
      };
    }

    // Do real-time verification using the same logic as before
    const hasNFT = await verifyNFTOwnershipRealtime(args.walletAddress, args.collectionAddress);

    // Update cache and rate limit
    await ctx.runMutation(internal.nftHolderScanner.updateManualRefresh, {
      walletAddress: args.walletAddress,
      collectionAddress: args.collectionAddress,
      hasNFT,
      refreshTime: now
    });

    return {
      success: true,
      hasNFT,
      updatedAt: now
    };
  }
});

/**
 * Real-time NFT verification (used only for manual refresh)
 * Copy of the logic from the old nft.ts file
 */
async function verifyNFTOwnershipRealtime(walletAddress: string, collectionAddress: string): Promise<boolean> {
  try {
    const heliusRpcUrl = process.env.SOLANA_RPC_ENDPOINT;
    if (!heliusRpcUrl) {
      throw new Error('SOLANA_RPC_ENDPOINT environment variable is not set');
    }
    const mainnetHeliusRpcUrl = heliusRpcUrl.replace('devnet', 'mainnet');

    let page = 1;
    let totalAssetsChecked = 0;

    while (true) {
      const response = await fetch(mainnetHeliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `nft-check-page-${page}`,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress,
            page: page,
            limit: 1000,
            displayOptions: {
              showCollectionMetadata: true
            }
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        console.log(`[Manual NFT Verification] API error on page ${page}:`, data.error);
        break;
      }

      if (data.result?.items && data.result.items.length > 0) {
        totalAssetsChecked += data.result.items.length;

        for (const asset of data.result.items) {
          // Method 1: Check grouping field
          const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
          if (collectionGrouping?.group_value === collectionAddress) {
            console.log(`[Manual NFT Verification] ✅ Found NFT from collection: ${asset.content?.metadata?.name || 'Unknown'}`);
            return true;
          }

          // Method 2: Check collection field directly
          if (asset.collection?.address === collectionAddress ||
            asset.collection?.key === collectionAddress) {
            console.log(`[Manual NFT Verification] ✅ Found NFT from collection: ${asset.content?.metadata?.name || 'Unknown'}`);
            return true;
          }

          // Method 3: Check if the asset ID itself matches
          if (asset.id === collectionAddress) {
            console.log(`[Manual NFT Verification] ✅ Found collection master NFT: ${asset.content?.metadata?.name || 'Unknown'}`);
            return true;
          }
        }

        if (data.result.items.length < 1000) {
          break;
        }

        page++;
      } else {
        break;
      }
    }

    console.log(`[Manual NFT Verification] ❌ No NFTs found from collection ${collectionAddress}`);
    return false;

  } catch (error) {
    console.error('[Manual NFT Verification] Error:', error);
    return false;
  }
}

/**
 * Get the last refresh time for rate limiting
 */
export const getLastRefreshTime = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const limit = await ctx.db
      .query("nftRefreshLimits")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    return limit?.lastRefreshAt;
  }
});

/**
 * Internal version of getLastRefreshTime for internal actions
 */
export const getLastRefreshTimeInternal = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const limit = await ctx.db
      .query("nftRefreshLimits")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    return limit?.lastRefreshAt;
  }
});

/**
 * Update cache after manual refresh and track rate limiting
 */
export const updateManualRefresh = internalMutation({
  args: {
    walletAddress: v.string(),
    collectionAddress: v.string(),
    hasNFT: v.boolean(),
    refreshTime: v.number()
  },
  handler: async (ctx, args) => {
    // Update rate limit tracking
    const existingLimit = await ctx.db
      .query("nftRefreshLimits")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    if (existingLimit) {
      await ctx.db.patch(existingLimit._id, {
        lastRefreshAt: args.refreshTime,
        refreshCount: existingLimit.refreshCount + 1
      });
    } else {
      await ctx.db.insert("nftRefreshLimits", {
        walletAddress: args.walletAddress,
        lastRefreshAt: args.refreshTime,
        refreshCount: 1
      });
    }

    // Update holder cache
    const existingHolder = await ctx.db
      .query("nftCollectionHolders")
      .withIndex("by_collection_and_wallet", (q) =>
        q.eq("collectionAddress", args.collectionAddress)
          .eq("walletAddress", args.walletAddress)
      )
      .first();

    if (args.hasNFT) {
      if (existingHolder) {
        // Update existing entry
        await ctx.db.patch(existingHolder._id, {
          lastVerified: args.refreshTime,
          addedBy: "manual"
        });
      } else {
        // Add new holder
        await ctx.db.insert("nftCollectionHolders", {
          collectionAddress: args.collectionAddress,
          walletAddress: args.walletAddress,
          nftCount: 1, // We don't know exact count from manual refresh
          lastVerified: args.refreshTime,
          addedBy: "manual"
        });
      }
    } else if (existingHolder) {
      // Remove from cache if they don't own NFTs anymore
      await ctx.db.delete(existingHolder._id);
    }
  }
});
