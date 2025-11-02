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
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  
  try {
    // Get all token accounts owned by the wallet
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
    
    if (!data.result?.value) {
      console.error('No token accounts found for wallet:', args.walletAddress);
      return false;
    }
    
    const accounts = data.result.value;
    
    // Check each token account to see if it matches our collection
    for (const account of accounts) {
      try {
        const tokenAmount = account.account.data.parsed.info.tokenAmount;
        
        // Skip if balance is 0 (no tokens)
        if (tokenAmount.uiAmount === 0) {
          continue;
        }
        
        const mintAddress = account.account.data.parsed.info.mint;
        
        // For now, we do a simple mint address comparison
        // In production, you should use Metaplex metadata parser to verify
        // the collection field in the token's metadata
        if (mintAddress === args.collectionAddress) {
          return true;
        }
        
        // TODO: Fetch and parse Metaplex metadata to check collection field
        // This would involve:
        // 1. Derive metadata PDA from mint address
        // 2. Fetch metadata account
        // 3. Parse metadata to check collection.key field
        // For now, we're using direct mint comparison as a simplified approach
        
      } catch (parseError) {
        console.error('Error parsing token account:', parseError);
        continue;
      }
    }
    
    return false; // No matching NFT found
    
  } catch (error) {
    console.error('NFT verification error:', error);
    // Fail closed - deny access on error
    return false;
  }
}
