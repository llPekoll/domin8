const HELIUS_RPC = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';
const wallet = '3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A';
const collection = '2iyDLX4ZNFN48DD9PjVXFg1Ek3RfEFKM9NGR55zKcrUY';

async function test() {
  console.log('🔍 Testing NFT verification...');
  console.log('Wallet:', wallet);
  console.log('Looking for collection:', collection);
  
  const response = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'test',
      method: 'getAssetsByOwner',
      params: { ownerAddress: wallet }
    })
  });
  
  const data = await response.json();
  console.log('Total assets found:', data.result?.total || 0);
  
  if (data.result?.items) {
    for (const asset of data.result.items) {
      const collectionGrouping = asset.grouping?.find(g => g.group_key === 'collection');
      console.log(`Asset: ${asset.id.slice(0,8)}... | Collection: ${collectionGrouping?.group_value || 'none'}`);
      
      if (collectionGrouping?.group_value === collection) {
        console.log('✅ MATCH FOUND! You own an NFT from this collection');
        return true;
      }
    }
  }
  
  console.log('❌ No matching collection found');
  return false;
}

test().then(result => {
  console.log('\n🎯 Final verification result:', result ? 'VERIFIED ✅' : 'NOT VERIFIED ❌');
  if (result) {
    console.log('The sam and warrior characters should be unlocked!');
  } else {
    console.log('Characters will remain locked.');
  }
});