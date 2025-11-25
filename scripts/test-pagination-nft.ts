import { Connection } from '@solana/web3.js';

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function checkHMSWithPagination(walletAddress: string, collectionAddress: string) {
  console.log('🔍 Testing NFT verification with PAGINATION...');
  console.log('Wallet:', walletAddress);
  console.log('Collection:', collectionAddress);
  console.log('=' + '='.repeat(60));

  try {
    // Paginate through ALL NFTs until we find the collection OR reach the end
    let page = 1;
    let totalAssetsChecked = 0;
    const foundHMSNFTs: any[] = [];
    
    while (true) { // Continue until we find NFT or reach natural end
      console.log(`\n📄 Fetching page ${page}...`);
      
      const response = await fetch(HELIUS_RPC_URL, {
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
        console.log(`❌ Helius API error on page ${page}:`, data.error);
        break;
      }
      
      if (data.result?.items && data.result.items.length > 0) {
        console.log(`✅ Page ${page}: Found ${data.result.items.length} NFTs`);
        totalAssetsChecked += data.result.items.length;
        
        // Check each NFT for HMS collection
        for (const asset of data.result.items) {
          // Check grouping field (standard for Metaplex and Mooar)
          const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
          if (collectionGrouping?.group_value === collectionAddress) {
            foundHMSNFTs.push({
              name: asset.content?.metadata?.name || 'Unknown',
              id: asset.id
            });
            console.log(`  🎯 FOUND HMS NFT: ${asset.content?.metadata?.name || 'Unknown'}`);
            
            // EARLY EXIT: Found what we're looking for!
            console.log(`\n🚀 EARLY EXIT: Found HMS NFT on page ${page}!`);
            console.log('\n' + '='.repeat(60));
            console.log('📊 PAGINATION SUMMARY (EARLY EXIT):');
            console.log(`  Pages checked: ${page}`);
            console.log(`  NFTs checked: ${totalAssetsChecked}`);
            console.log(`  HMS NFTs found: ${foundHMSNFTs.length}`);
            return true;
          }
        }
        
        // If we got fewer items than the limit, we've reached the natural end
        if (data.result.items.length < 1000) {
          console.log(`📊 Reached natural end on page ${page} (got ${data.result.items.length} items)`);
          break;
        }
        
        // Continue to next page
        page++;
      } else {
        // No more items - natural end
        console.log(`📊 No more NFTs found after page ${page - 1}`);
        break;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PAGINATION SUMMARY:');
    console.log(`  Total pages checked: ${page}`);
    console.log(`  Total NFTs checked: ${totalAssetsChecked}`);
    console.log(`  HMS NFTs found: ${foundHMSNFTs.length}`);
    
    if (foundHMSNFTs.length > 0) {
      console.log('\n🎯 HMS COLLECTION NFTs FOUND:');
      foundHMSNFTs.forEach((nft, i) => {
        console.log(`  ${i + 1}. ${nft.name}`);
      });
      return true;
    } else {
      console.log('\n❌ No HMS NFTs found in this wallet');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Error:', error);
    return false;
  }
}

// Test the wallet that should have HMS NFTs
const walletAddress = '9foaU2xYTeA172RMyXS4Wj8KpiReM35HrcHtFkx4BuwE';
const collectionAddress = 'AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy';

checkHMSWithPagination(walletAddress, collectionAddress)
  .then((found) => {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 FINAL RESULT:', found ? 'HMS NFTs FOUND!' : 'NO HMS NFTs FOUND');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });