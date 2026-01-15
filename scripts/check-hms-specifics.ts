import { Connection } from '@solana/web3.js';

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function checkHMSSpecifics(walletAddress: string, collectionAddress: string) {
  console.log('🔍 Checking HMS collection specifics...');
  console.log('Wallet:', walletAddress);
  console.log('Collection:', collectionAddress);
  console.log('=' + '='.repeat(60));

  try {
    // Get all NFTs from wallet
    console.log('\n📦 Fetching all NFTs from wallet...\n');
    
    const walletResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'wallet-nfts',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000
        }
      })
    });

    const walletData = await walletResponse.json();
    
    if (walletData.result?.items) {
      console.log(`Found ${walletData.result.items.length} total NFTs in wallet\n`);
      
      // Filter for HMS collection NFTs
      const hmsNFTs = walletData.result.items.filter((nft: any) => {
        const collectionGrouping = nft.grouping?.find((g: any) => g.group_key === 'collection');
        return collectionGrouping?.group_value === collectionAddress;
      });
      
      if (hmsNFTs.length > 0) {
        console.log('🎯 HMS COLLECTION NFTs FOUND:');
        console.log('-'.repeat(60));
        
        // Get collection name from first NFT
        let collectionName = 'Unknown';
        if (hmsNFTs[0].grouping?.[0]?.collection_metadata?.name) {
          collectionName = hmsNFTs[0].grouping[0].collection_metadata.name;
        }
        
        console.log(`✅ Collection Name: "${collectionName}"`);
        console.log(`✅ Collection Address: ${collectionAddress}`);
        console.log(`✅ Total HMS NFTs owned: ${hmsNFTs.length}`);
        
        console.log('\n📋 SPECIFIC HMS NFTs OWNED:');
        console.log('-'.repeat(60));
        
        hmsNFTs.forEach((nft: any, index: number) => {
          const name = nft.content?.metadata?.name || 'Unknown';
          const id = nft.id;
          console.log(`${index + 1}. ${name}`);
          console.log(`   ID: ${id}`);
        });
        
        // Check for specific numbers mentioned
        const specificNumbers = ['#16', '#460', '#14', '#18', '#17'];
        console.log('\n🔍 CHECKING FOR SPECIFIC NUMBERS:');
        console.log('-'.repeat(60));
        
        specificNumbers.forEach(num => {
          const found = hmsNFTs.find((nft: any) => 
            nft.content?.metadata?.name?.includes(num)
          );
          if (found) {
            console.log(`✅ ${num} - FOUND: ${found.content.metadata.name}`);
          } else {
            console.log(`❌ ${num} - NOT FOUND`);
          }
        });
        
        return { found: true, count: hmsNFTs.length, collectionName, nfts: hmsNFTs };
      } else {
        console.log('❌ NO HMS NFTs found in this wallet');
        
        // Show a sample of other NFTs for debugging
        console.log('\n🔍 Sample of other NFTs in wallet:');
        walletData.result.items.slice(0, 5).forEach((nft: any) => {
          console.log(`- ${nft.content?.metadata?.name || 'Unknown'}`);
          const collection = nft.grouping?.find((g: any) => g.group_key === 'collection');
          if (collection) {
            console.log(`  Collection: ${collection.group_value}`);
          }
        });
        
        return { found: false, count: 0, collectionName: 'Unknown', nfts: [] };
      }
    } else {
      console.log('❌ No NFTs found in wallet');
      return { found: false, count: 0, collectionName: 'Unknown', nfts: [] };
    }

  } catch (error) {
    console.error('💥 Error checking HMS collection:', error);
    return { found: false, count: 0, collectionName: 'Unknown', nfts: [] };
  }
}

// Test the specific wallet
const walletAddress = '3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A';
const collectionAddress = 'AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy';

checkHMSSpecifics(walletAddress, collectionAddress)
  .then((result) => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY:');
    console.log(`Collection Name: "${result.collectionName}"`);
    console.log(`HMS NFTs Found: ${result.found ? 'YES' : 'NO'}`);
    console.log(`Total Count: ${result.count}`);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });