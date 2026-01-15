const HELIUS_RPC = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';
const privyWallet = 'HBXNLCsEc6Bo2cFoDiqAd31fxhRFBw9JNxas4aWFYBy'; // Your Privy embedded wallet
const externalWallet = '3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A'; // Your external wallet
const collection = '2iyDLX4ZNFN48DD9PjVXFg1Ek3RfEFKM9NGR55zKcrUY';

async function testWallet(walletAddress, walletType) {
  console.log(`\n🔍 Testing ${walletType}: ${walletAddress}`);
  
  const response = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `test-${walletType}`,
      method: 'getAssetsByOwner',
      params: { ownerAddress: walletAddress }
    })
  });
  
  const data = await response.json();
  console.log(`Total assets in ${walletType}:`, data.result?.total || 0);
  
  if (data.result?.items) {
    let foundMatch = false;
    for (const asset of data.result.items) {
      const collectionGrouping = asset.grouping?.find(g => g.group_key === 'collection');
      console.log(`  Asset: ${asset.id.slice(0,8)}... | Collection: ${collectionGrouping?.group_value?.slice(0,8) || 'none'}...`);
      
      if (collectionGrouping?.group_value === collection) {
        console.log(`  ✅ COLLECTION MATCH FOUND in ${walletType}!`);
        foundMatch = true;
      }
    }
    if (!foundMatch) {
      console.log(`  ❌ No matching collection in ${walletType}`);
    }
    return foundMatch;
  }
  
  console.log(`  📭 No assets found in ${walletType}`);
  return false;
}

async function main() {
  console.log('🎯 Testing NFT verification for both wallets...');
  console.log('Looking for collection:', collection.slice(0,8) + '...');
  
  const privyHasNFTs = await testWallet(privyWallet, 'Privy Embedded');
  const externalHasNFTs = await testWallet(externalWallet, 'External Wallet');
  
  console.log('\n📊 SUMMARY:');
  console.log('Privy wallet has required NFTs:', privyHasNFTs ? '✅ YES' : '❌ NO');
  console.log('External wallet has required NFTs:', externalHasNFTs ? '✅ YES' : '❌ NO');
  
  if (externalHasNFTs && !privyHasNFTs) {
    console.log('\n💡 SOLUTION: The game needs to detect the external wallet to unlock characters');
  } else if (privyHasNFTs) {
    console.log('\n🎉 Characters should already be unlocked!');
  }
}

main().catch(console.error);