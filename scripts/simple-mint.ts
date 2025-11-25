import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const HELIUS_RPC_URL = 'https://devnet.helius-rpc.com/?api-key=0df32d0b-da4f-49b3-b154-deaceac254c0';

async function mintSimpleNFT(recipientAddress: string) {
  console.log('🎨 Minting simple NFT...');
  console.log('Recipient:', recipientAddress);

  // Load collection info
  const collectionInfoPath = path.join(__dirname, '../nft-collection/collection-info.json');
  const collectionInfo = JSON.parse(fs.readFileSync(collectionInfoPath, 'utf-8'));
  const authority = Keypair.fromSecretKey(new Uint8Array(collectionInfo.privateKey));

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const recipient = new PublicKey(recipientAddress);
  
  // Generate a new mint keypair for the NFT
  const mintKeypair = Keypair.generate();
  console.log('NFT Mint Address:', mintKeypair.publicKey.toString());

  try {
    // Get the minimum balance for rent exemption
    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    // Get associated token account address
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      recipient
    );

    const transaction = new Transaction().add(
      // Create mint account
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      // Initialize mint
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // decimals
        authority.publicKey, // mint authority
        authority.publicKey, // freeze authority
        TOKEN_PROGRAM_ID
      ),
      // Create associated token account
      createAssociatedTokenAccountInstruction(
        authority.publicKey, // payer
        associatedTokenAccount,
        recipient, // owner
        mintKeypair.publicKey, // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      // Mint 1 token to the recipient
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAccount,
        authority.publicKey,
        1, // amount
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Send transaction
    const signature = await connection.sendTransaction(transaction, [authority, mintKeypair]);
    await connection.confirmTransaction(signature);

    console.log('✅ NFT minted successfully!');
    console.log('Transaction signature:', signature);
    console.log('NFT Mint:', mintKeypair.publicKey.toString());
    console.log('Owner ATA:', associatedTokenAccount.toString());

    // Save NFT info
    const nftInfo = {
      mint: mintKeypair.publicKey.toString(),
      owner: recipientAddress,
      associatedTokenAccount: associatedTokenAccount.toString(),
      signature: signature,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, '../nft-collection/minted-nft.json'),
      JSON.stringify(nftInfo, null, 2)
    );

    return nftInfo;

  } catch (error) {
    console.error('❌ Error minting NFT:', error);
    throw error;
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: bun scripts/simple-mint.ts <recipient-address>');
    process.exit(1);
  }

  const [recipientAddress] = args;
  
  mintSimpleNFT(recipientAddress)
    .then(() => {
      console.log('🎉 Simple NFT minting completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Minting failed:', error);
      process.exit(1);
    });
}

export { mintSimpleNFT };