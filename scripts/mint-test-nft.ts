import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import fs from 'fs';
import path from 'path';

const HELIUS_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function mintNFT(collectionAddress: string, recipientAddress: string) {
  console.log('🎨 Minting test NFT...');
  console.log('Collection:', collectionAddress);
  console.log('Recipient:', recipientAddress);

  // Load collection info
  const collectionInfoPath = path.join(__dirname, '../nft-collection/collection-info.json');
  if (!fs.existsSync(collectionInfoPath)) {
    throw new Error('Collection info not found. Please create collection first.');
  }

  const collectionInfo = JSON.parse(fs.readFileSync(collectionInfoPath, 'utf-8'));
  const authority = Keypair.fromSecretKey(new Uint8Array(collectionInfo.privateKey));

  // Create connection and Metaplex instance
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(authority));

  try {
    // Mint an NFT from the collection
    const { nft } = await metaplex.nfts().create({
      uri: 'https://arweave.net/placeholder-nft', // Placeholder metadata
      name: 'Domin8 Test NFT #1',
      description: 'A test NFT from the Domin8 collection for character verification',
      symbol: 'D8NFT',
      sellerFeeBasisPoints: 500,
      creators: [
        {
          address: authority.publicKey,
          verified: true,
          share: 100,
        },
      ],
      collection: {
        address: new PublicKey(collectionAddress),
        verified: true,
      },
      // Mint to the specified recipient
      tokenOwner: new PublicKey(recipientAddress),
    });

    console.log('✅ NFT minted successfully!');
    console.log('NFT Address:', nft.address.toString());
    console.log('Mint Address:', nft.mint.address.toString());

    // Save NFT info
    const nftInfo = {
      address: nft.address.toString(),
      mint: nft.mint.address.toString(),
      collection: collectionAddress,
      owner: recipientAddress,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, '../nft-collection/test-nft.json'),
      JSON.stringify(nftInfo, null, 2)
    );

    return nft;

  } catch (error) {
    console.error('❌ Error minting NFT:', error);
    throw error;
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: bun scripts/mint-test-nft.ts <collection-address> <recipient-address>');
    process.exit(1);
  }

  const [collectionAddress, recipientAddress] = args;
  
  mintNFT(collectionAddress, recipientAddress)
    .then(() => {
      console.log('🎉 Minting completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Minting failed:', error);
      process.exit(1);
    });
}

export { mintNFT };