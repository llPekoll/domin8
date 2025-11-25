import { Connection } from '@solana/web3.js';

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function investigateMooarCollection(collectionMint: string, walletAddress: string) {
  console.log('🔍 Investigating Mooar Collection Structure...');
  console.log('Collection Mint:', collectionMint);
  console.log('Wallet to check:', walletAddress);
  console.log('=' + '='.repeat(60));

  try {
    // 1. Get collection mint metadata
    console.log('\n1️⃣ Getting collection mint metadata...');
    
    const collectionResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'collection-check',
        method: 'getAsset',
        params: {
          id: collectionMint
        }
      })
    });

    const collectionData = await collectionResponse.json();
    
    if (collectionData.result) {
      console.log('✅ Collection mint found:');
      console.log('Name:', collectionData.result.content?.metadata?.name);
      console.log('Symbol:', collectionData.result.content?.metadata?.symbol);
      console.log('Owner:', collectionData.result.ownership?.owner);
      console.log('Update Authority:', collectionData.result.authorities?.[0]?.address);
      console.log('Collection field:', collectionData.result.collection);
      console.log('Grouping:', collectionData.result.grouping);
    }

    // 2. Search for NFTs that reference this collection
    console.log('\n2️⃣ Searching for NFTs that reference this collection...');
    
    // Try searching by collection in metadata
    const searchResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'collection-search',
        method: 'searchAssets',
        params: {
          grouping: ['collection', collectionMint],
          page: 1,
          limit: 10
        }
      })
    });

    const searchData = await searchResponse.json();
    console.log('Search by grouping result:', searchData);

    // 3. Try alternative search by creator
    if (collectionData.result?.creators?.[0]?.address) {
      console.log('\n3️⃣ Searching by creator address...');
      const creator = collectionData.result.creators[0].address;
      
      const creatorSearchResponse = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'creator-search',
          method: 'searchAssets',
          params: {
            creatorAddress: creator,
            page: 1,
            limit: 10
          }
        })
      });

      const creatorSearchData = await creatorSearchResponse.json();
      console.log('Search by creator result:', creatorSearchData);
    }

    // 4. Check if wallet has any NFTs with this collection as metadata reference
    console.log('\n4️⃣ Checking wallet NFTs for collection references...');
    
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
          limit: 100
        }
      })
    });

    const walletData = await walletResponse.json();
    
    if (walletData.result?.items) {
      console.log(`Found ${walletData.result.items.length} NFTs in wallet`);
      
      // Look for any NFTs that might reference our collection
      const potentialMatches = walletData.result.items.filter((nft: any) => {
        // Check various ways the collection might be referenced
        return (
          nft.collection?.address === collectionMint ||
          nft.content?.metadata?.collection?.name?.includes('HMS') ||
          nft.content?.json_uri?.includes(collectionMint) ||
          nft.grouping?.some((g: any) => g.group_value === collectionMint) ||
          JSON.stringify(nft).includes(collectionMint)
        );
      });
      
      if (potentialMatches.length > 0) {
        console.log(`\n🎯 Found ${potentialMatches.length} potential matches:`);
        potentialMatches.forEach((match: any, i: number) => {
          console.log(`\nMatch ${i + 1}:`);
          console.log('  Name:', match.content?.metadata?.name);
          console.log('  ID:', match.id);
          console.log('  Collection:', match.collection);
          console.log('  Grouping:', match.grouping);
        });
        return true;
      } else {
        console.log('❌ No NFTs found that reference this collection');
      }
    }

    // 5. Alternative: Check if the collection mint itself is owned by wallet
    console.log('\n5️⃣ Checking if wallet owns the collection mint directly...');
    
    const tokenResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'token-check',
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: collectionMint },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.result?.value && tokenData.result.value.length > 0) {
      const account = tokenData.result.value[0];
      const amount = account.account.data.parsed.info.tokenAmount.amount;
      if (amount > 0) {
        console.log('✅ Wallet owns the collection mint directly!');
        console.log('Amount:', amount);
        return true;
      }
    }

    return false;

  } catch (error) {
    console.error('💥 Error investigating collection:', error);
    return false;
  }
}

// Test with HMS collection and the wallet
const collectionMint = 'AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy';
const walletAddress = '9foaU2xYTeA172RMyXS4Wj8KpiReM35HrcHtFkx4BuwE';

investigateMooarCollection(collectionMint, walletAddress)
  .then((hasAccess) => {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 FINAL RESULT:', hasAccess ? 'WALLET HAS ACCESS' : 'WALLET DOES NOT HAVE ACCESS');
  })
  .catch((error) => {
    console.error('Investigation failed:', error);
    process.exit(1);
  });