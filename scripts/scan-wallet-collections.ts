import { Connection } from '@solana/web3.js';

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function scanWalletCollections(walletAddress: string) {
  console.log('🔍 Scanning wallet for all NFT collections...');
  console.log('Wallet:', walletAddress);
  console.log('=' + '='.repeat(60));

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

  try {
    // Use Helius enhanced API to get all NFTs
    console.log('\n📦 Fetching all NFTs from wallet...\n');
    
    const heliusResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'nft-scan',
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

    const heliusData = await heliusResponse.json();
    
    if (heliusData.result?.items) {
      console.log(`Found ${heliusData.result.items.length} NFT(s) in wallet\n`);
      
      const collections = new Map<string, any>();
      const standalone: any[] = [];
      
      for (const asset of heliusData.result.items) {
        // Check for collection in grouping field
        const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
        
        if (collectionGrouping?.group_value) {
          const collectionId = collectionGrouping.group_value;
          if (!collections.has(collectionId)) {
            collections.set(collectionId, {
              address: collectionId,
              name: collectionGrouping.collection_metadata?.name || 'Unknown',
              symbol: collectionGrouping.collection_metadata?.symbol || '',
              description: collectionGrouping.collection_metadata?.description || '',
              nfts: []
            });
          }
          collections.get(collectionId)?.nfts.push({
            id: asset.id,
            name: asset.content?.metadata?.name || 'Unknown NFT'
          });
        } else {
          // NFT without collection
          standalone.push({
            id: asset.id,
            name: asset.content?.metadata?.name || 'Unknown NFT',
            symbol: asset.content?.metadata?.symbol || ''
          });
        }
      }
      
      // Display collections
      if (collections.size > 0) {
        console.log('📚 NFT COLLECTIONS FOUND:');
        console.log('-'.repeat(60));
        
        for (const [address, collection] of collections) {
          console.log(`\n✅ Collection: ${collection.name}`);
          console.log(`   Address: ${address}`);
          console.log(`   Symbol: ${collection.symbol || 'N/A'}`);
          console.log(`   NFTs in this collection: ${collection.nfts.length}`);
          
          // List first few NFTs
          const preview = collection.nfts.slice(0, 3);
          preview.forEach((nft: any) => {
            console.log(`   • ${nft.name}`);
          });
          if (collection.nfts.length > 3) {
            console.log(`   ... and ${collection.nfts.length - 3} more`);
          }
        }
      }
      
      // Display standalone NFTs
      if (standalone.length > 0) {
        console.log('\n📄 STANDALONE NFTs (no collection):');
        console.log('-'.repeat(60));
        standalone.forEach(nft => {
          console.log(`• ${nft.name} (${nft.id})`);
        });
      }
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 SUMMARY:');
      console.log(`   Total NFTs: ${heliusData.result.items.length}`);
      console.log(`   Collections: ${collections.size}`);
      console.log(`   Standalone NFTs: ${standalone.length}`);
      
      // Return collection addresses for easy copying
      console.log('\n📋 COLLECTION ADDRESSES (for easy copying):');
      console.log('-'.repeat(60));
      for (const [address] of collections) {
        console.log(address);
      }
      
      return Array.from(collections.keys());
    } else {
      console.log('❌ No NFTs found in this wallet');
      return [];
    }

  } catch (error) {
    console.error('💥 Error scanning wallet:', error);
    return [];
  }
}

// Wallet to check for HMS NFTs
const walletAddress = '9foaU2xYTeA172RMyXS4Wj8KpiReM35HrcHtFkx4BuwE';
const targetCollection = 'AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy';

scanWalletCollections(walletAddress)
  .then((collections) => {
    console.log('\n✅ Scan complete');
    
    // Check for target collection
    console.log('\n🎯 TARGET COLLECTION CHECK:');
    console.log('-'.repeat(60));
    console.log(`Looking for: ${targetCollection}`);
    
    if (collections.includes(targetCollection)) {
      console.log('✅ TARGET COLLECTION FOUND! Wallet owns NFTs from this collection.');
    } else {
      console.log('❌ Target collection NOT found in this wallet.');
    }
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('Scan failed:', error);
    process.exit(1);
  });