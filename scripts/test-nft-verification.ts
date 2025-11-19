import { Connection } from '@solana/web3.js';

const HELIUS_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function testNFTVerification(walletAddress: string, collectionAddress: string) {
  console.log('🔍 Testing NFT verification...');
  console.log('Wallet:', walletAddress);
  console.log('Collection:', collectionAddress);

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

  try {
    // Test 1: Check if Helius enhanced API works
    console.log('\n1️⃣ Testing Helius enhanced RPC...');
    
    const heliusResponse = await fetch(HELIUS_RPC_URL, {
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

    const heliusData = await heliusResponse.json();
    console.log('Helius response:', JSON.stringify(heliusData, null, 2));

    if (heliusData.result?.items) {
      console.log(`Found ${heliusData.result.items.length} assets via Helius`);
      
      for (const asset of heliusData.result.items) {
        console.log('\nAsset:', {
          id: asset.id,
          collection: asset.collection,
          grouping: asset.grouping
        });
        
        // Check collection field
        const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
        if (collectionGrouping?.group_value === collectionAddress) {
          console.log('✅ Found matching collection via grouping!');
          return true;
        }
        
        if (asset.collection?.address === collectionAddress) {
          console.log('✅ Found matching collection via collection field!');
          return true;
        }
        
        if (asset.id === collectionAddress) {
          console.log('✅ Found matching collection via asset ID!');
          return true;
        }
      }
    }

    // Test 2: Standard RPC fallback
    console.log('\n2️⃣ Testing standard RPC fallback...');
    
    const tokenAccountsResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const tokenData = await tokenAccountsResponse.json();
    console.log('Token accounts response:', JSON.stringify(tokenData, null, 2));

    if (tokenData.result?.value) {
      const nftMints: string[] = [];
      for (const account of tokenData.result.value) {
        const info = account.account.data.parsed.info;
        const tokenAmount = info.tokenAmount;

        if (
          tokenAmount.uiAmount === 1 &&
          tokenAmount.decimals === 0 &&
          tokenAmount.amount === '1'
        ) {
          nftMints.push(info.mint);
        }
      }

      console.log('Found NFT mints:', nftMints);
      
      if (nftMints.includes(collectionAddress)) {
        console.log('✅ Found direct mint match!');
        return true;
      }
    }

    console.log('❌ No matching NFTs found');
    return false;

  } catch (error) {
    console.error('💥 Error testing NFT verification:', error);
    return false;
  }
}

// Test with your wallet and the collection you actually own
const walletAddress = '3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A';
const collectionAddress = '2iyDLX4ZNFN48DD9PjVXFg1Ek3RfEFKM9NGR55zKcrUY'; // Legder Collection you own

testNFTVerification(walletAddress, collectionAddress)
  .then((result) => {
    console.log(`\n🎯 Final result: ${result ? 'VERIFIED' : 'NOT VERIFIED'}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });