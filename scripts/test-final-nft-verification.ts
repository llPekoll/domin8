/**
 * Final NFT Verification Test - Production Ready
 *
 * Tests the exact logic used in Convex NFT verification:
 * - Dynamic pagination with early exit
 * - Mainnet RPC for NFT detection
 * - Support for all collection types (Metaplex, Mooar, etc.)
 * - Efficient for wallets of any size
 */


async function verifyNFTOwnership(walletAddress: string, collectionAddress: string): Promise<boolean> {
  console.log(`🔍 [NFT Verification] Checking wallet ${walletAddress} for collection ${collectionAddress}`);

  const startTime = Date.now();

  try {
    // Paginate through ALL NFTs until we find the collection OR reach the end
    // This handles wallets with 1000+ NFTs efficiently with early exit
    let page = 1;
    let totalAssetsChecked = 0;

    while (true) { // Continue until we find NFT or reach natural end
      console.log(`  📄 [Page ${page}] Fetching...`);

      // Use Helius's getAssetsByOwner method for comprehensive NFT collection detection
      // This works for both standard Metaplex and Mooar.com collections

      const response = await fetch(process.env.SOLANA_RPC_ENDPOINT!, {
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
        console.log(`  ❌ [Page ${page}] Helius API error:`, data.error);
        break;
      }

      if (data.result?.items && data.result.items.length > 0) {
        console.log(`  ✅ [Page ${page}] Found ${data.result.items.length} NFTs`);
        totalAssetsChecked += data.result.items.length;

        for (const asset of data.result.items) {
          // Method 1: Check grouping field (standard for Metaplex Core and Mooar collections)
          const collectionGrouping = asset.grouping?.find((g: any) => g.group_key === 'collection');
          if (collectionGrouping?.group_value === collectionAddress) {
            const duration = Date.now() - startTime;
            console.log(`  🎯 [FOUND] NFT: ${asset.content?.metadata?.name || 'Unknown'}`);
            console.log(`  🚀 [EARLY EXIT] After checking ${totalAssetsChecked} NFTs across ${page} page(s)`);
            console.log(`  ⏱️  [PERFORMANCE] Completed in ${duration}ms`);
            return true;
          }

          // Method 2: Check collection field directly (alternative format)
          if (asset.collection?.address === collectionAddress ||
            asset.collection?.key === collectionAddress) {
            const duration = Date.now() - startTime;
            console.log(`  🎯 [FOUND] NFT: ${asset.content?.metadata?.name || 'Unknown'}`);
            console.log(`  🚀 [EARLY EXIT] After checking ${totalAssetsChecked} NFTs across ${page} page(s)`);
            console.log(`  ⏱️  [PERFORMANCE] Completed in ${duration}ms`);
            return true;
          }

          // Method 3: Check if the asset ID itself matches (for master collection NFTs)
          if (asset.id === collectionAddress) {
            const duration = Date.now() - startTime;
            console.log(`  🎯 [FOUND] Collection master NFT: ${asset.content?.metadata?.name || 'Unknown'}`);
            console.log(`  🚀 [EARLY EXIT] After checking ${totalAssetsChecked} NFTs across ${page} page(s)`);
            console.log(`  ⏱️  [PERFORMANCE] Completed in ${duration}ms`);
            return true;
          }
        }

        // If we got fewer items than the limit, we've reached the natural end
        if (data.result.items.length < 1000) {
          console.log(`  📊 [END] Reached natural end on page ${page} (got ${data.result.items.length} items)`);
          break;
        }

        // Continue to next page
        page++;
      } else {
        // No more items - natural end
        console.log(`  📊 [END] No more NFTs found after page ${page - 1}`);
        break;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`  📊 [COMPLETE SCAN] Checked ${totalAssetsChecked} NFTs across ${page} page(s)`);
    console.log(`  ⏱️  [PERFORMANCE] Completed in ${duration}ms`);
    console.log(`  ❌ [NOT FOUND] No NFTs found from collection ${collectionAddress}`);
    return false;

  } catch (error) {
    console.log(`  💥 [ERROR] NFT verification failed:`, error);
    return false;
  }
}

// Test cases covering different scenarios
// const testCases = [
//   {
//     name: "HMS Collection (Large Wallet - Should find on page 8)",
//     wallet: "9foaU2xYTeA172RMyXS4Wj8KpiReM35HrcHtFkx4BuwE",
//     collection: "AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy",
//     expected: true
//   },
//   {
//     name: "SMB Gen3 Collection (Medium Wallet)",
//     wallet: "B2ZojDkpLwCgM2nUYpR8NzFPwjf8enMLNyJpqeyPnfvy",
//     collection: "8Rt3Ayqth4DAiPnW9MDFi63TiQJHmohfTWLMQFHi4KZH",
//     expected: true
//   },
//   {
//     name: "Nomu OG Collection (Medium Wallet)",
//     wallet: "B2ZojDkpLwCgM2nUYpR8NzFPwjf8enMLNyJpqeyPnfvy",
//     collection: "DsNoUoX6txsJkrsg1hnKA5CpCi575Tw13YgbqiYUzzvU",
//     expected: true
//   },
//   {
//     name: "Non-existent Collection (Should fail quickly)",
//     wallet: "B2ZojDkpLwCgM2nUYpR8NzFPwjf8enMLNyJpqeyPnfvy",
//     collection: "1111111111111111111111111111111111111111111",
//     expected: false
//   },
//   {
//     name: "Empty Wallet (Should fail immediately)",
//     wallet: "3HBjgocwMDGiKq7x1D7XoT7Wg2ex5xgstPnCyJfbqC5A",
//     collection: "AMdMcYA1fFpjPQ3jwB5gAjKTMSJPVH651RtYZn74eQoy",
//     expected: false
//   }
// ];

async function runTests() {
  console.log('🚀 Starting Final NFT Verification Tests');
  console.log('=' + '='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${i + 1}. ${testCase.name}`);
    console.log('-'.repeat(50));

    const result = await verifyNFTOwnership(testCase.wallet, testCase.collection);

    if (result === testCase.expected) {
      console.log(`✅ PASS: Expected ${testCase.expected}, got ${result}`);
      passed++;
    } else {
      console.log(`❌ FAIL: Expected ${testCase.expected}, got ${result}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST RESULTS:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Production ready! 🚀');
  } else {
    console.log('\n⚠️  Some tests failed. Check implementation.');
  }
}

// Run the tests
runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
