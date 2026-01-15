import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import fs from 'fs';
import path from 'path';

// Load environment variables
const HELIUS_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function main() {
  console.log('🚀 Creating Domin8 Test NFT Collection on Devnet...');

  // Create connection to devnet
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  
  // Generate a new keypair for the collection authority
  // In production, you'd use your actual wallet
  const authority = Keypair.generate();
  console.log('Authority public key:', authority.publicKey.toString());
  
  // Initialize Metaplex
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(authority));

  try {
    // First, we need to airdrop some SOL to the authority for transaction fees
    console.log('💰 Requesting SOL airdrop...');
    const airdropSignature = await connection.requestAirdrop(
      authority.publicKey,
      2_000_000_000 // 2 SOL
    );
    await connection.confirmTransaction(airdropSignature);
    console.log('✅ Airdrop successful');

    // Create the collection
    console.log('🎨 Creating NFT collection...');
    const { nft: collection } = await metaplex.nfts().create({
      uri: 'https://arweave.net/placeholder', // We'll upload metadata to Arweave/IPFS later
      name: 'Domin8 Test Collection',
      description: 'A test NFT collection for Domin8 battle game character verification',
      symbol: 'D8TEST',
      sellerFeeBasisPoints: 500, // 5% royalty
      isCollection: true,
      creators: [
        {
          address: authority.publicKey,
          verified: true,
          share: 100,
        },
      ],
    });

    console.log('✅ Collection created!');
    console.log('Collection Address:', collection.address.toString());
    
    // Save collection info
    const collectionInfo = {
      address: collection.address.toString(),
      authority: authority.publicKey.toString(),
      privateKey: Array.from(authority.secretKey),
      name: 'Domin8 Test Collection',
      symbol: 'D8TEST',
      network: 'devnet',
      rpcUrl: HELIUS_RPC_URL,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, '../nft-collection/collection-info.json'),
      JSON.stringify(collectionInfo, null, 2)
    );

    console.log('📝 Collection info saved to nft-collection/collection-info.json');
    console.log('\n🎯 Next step: Use this collection address in your character configuration:');
    console.log(collection.address.toString());

    return collection.address.toString();

  } catch (error) {
    console.error('❌ Error creating collection:', error);
    throw error;
  }
}

// Run the script
main()
  .then((collectionAddress) => {
    console.log('\n🎉 Success! Collection deployed at:', collectionAddress);
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed to create collection:', error);
    process.exit(1);
  });