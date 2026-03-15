/**
 * NFT scanning functions for collection holder verification
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { nftCollectionHolders, nftRefreshLimits, characters } from "../db/schema.js";
import { config } from "../config.js";
import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Verify NFT ownership in real-time using DAS API (Helius)
 */
export async function verifyNFTOwnershipRealtime(
  walletAddress: string,
  collectionAddress: string
): Promise<{ owns: boolean; count: number }> {
  try {
    // Check cache first
    const [cached] = await db
      .select()
      .from(nftCollectionHolders)
      .where(
        and(
          eq(nftCollectionHolders.collectionAddress, collectionAddress),
          eq(nftCollectionHolders.walletAddress, walletAddress)
        )
      )
      .limit(1);

    if (cached) {
      return { owns: cached.nftCount > 0, count: cached.nftCount };
    }

    // If not cached and RPC supports DAS API, try real-time check
    try {
      const response = await fetch(config.solanaRpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "nft-check",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 100,
            displayOptions: { showCollectionMetadata: true },
          },
        }),
      });

      const data = await response.json();
      const items = data?.result?.items || [];
      const matchingNfts = items.filter(
        (item: any) =>
          item.grouping?.some(
            (g: any) =>
              g.group_key === "collection" && g.group_value === collectionAddress
          )
      );

      const count = matchingNfts.length;

      // Cache the result
      if (count > 0) {
        await db
          .insert(nftCollectionHolders)
          .values({
            collectionAddress,
            walletAddress,
            nftCount: count,
            lastVerified: Math.floor(Date.now() / 1000),
            addedBy: "realtime",
          })
          .onConflictDoUpdate({
            target: [nftCollectionHolders.collectionAddress, nftCollectionHolders.walletAddress],
            set: {
              nftCount: count,
              lastVerified: Math.floor(Date.now() / 1000),
            },
          });
      }

      return { owns: count > 0, count };
    } catch {
      // DAS API not available
      return { owns: false, count: 0 };
    }
  } catch (error) {
    console.error("[NFTScanner] Error verifying ownership:", error);
    return { owns: false, count: 0 };
  }
}

/**
 * Get all NFT holders for a list of wallets
 */
export async function getAllNFTHoldersForWallets(walletAddresses: string[]) {
  const allHolders: Array<{ collectionAddress: string; walletAddress: string; nftCount: number }> = [];

  for (const wallet of walletAddresses) {
    const holders = await db
      .select()
      .from(nftCollectionHolders)
      .where(eq(nftCollectionHolders.walletAddress, wallet));

    for (const h of holders) {
      allHolders.push({
        collectionAddress: h.collectionAddress,
        walletAddress: h.walletAddress,
        nftCount: h.nftCount,
      });
    }
  }

  return allHolders;
}

/**
 * Manual NFT refresh with rate limiting
 */
export async function manualRefreshNFT(
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  // Check rate limit (5 min cooldown)
  const [rateLimit] = await db
    .select()
    .from(nftRefreshLimits)
    .where(eq(nftRefreshLimits.walletAddress, walletAddress))
    .limit(1);

  const now = Math.floor(Date.now() / 1000);
  if (rateLimit && now - rateLimit.lastRefreshAt < 300) {
    const remaining = 300 - (now - rateLimit.lastRefreshAt);
    return { success: false, error: `Rate limited. Try again in ${remaining}s` };
  }

  // Get all NFT collections from characters
  const nftCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.isActive, true));

  const collections = nftCharacters
    .filter((c) => c.nftCollection)
    .map((c) => c.nftCollection!);

  // Check each collection
  for (const collection of collections) {
    await verifyNFTOwnershipRealtime(walletAddress, collection);
  }

  // Update rate limit
  if (rateLimit) {
    await db
      .update(nftRefreshLimits)
      .set({ lastRefreshAt: now, refreshCount: rateLimit.refreshCount + 1 })
      .where(eq(nftRefreshLimits.id, rateLimit.id));
  } else {
    await db.insert(nftRefreshLimits).values({
      walletAddress,
      lastRefreshAt: now,
      refreshCount: 1,
    });
  }

  return { success: true };
}
