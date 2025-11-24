/**
 * Solana 1v1 Lobby Transaction Builder
 * 
 * Utilities for building, signing, and sending 1v1 lobby transactions
 * Works with Privy wallet integration for transaction signing
 */

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import type { Domin81v1Prgm } from "../../target/types/domin8_1v1_prgm";
import IDL from "../../target/idl/domin8_1v1_prgm.json";
import { logger } from "./logger";

// Extract Program ID from IDL
const PROGRAM_ID = new PublicKey((IDL as any).address);

// PDA Seeds for 1v1 program
const PDA_SEEDS_1V1 = {
  CONFIG: Buffer.from("domin8_1v1_config"),
  LOBBY: Buffer.from("domin8_1v1_lobby"),
} as const;

/**
 * Helper to get Config PDA
 */
function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], PROGRAM_ID);
}

/**
 * Helper to get Lobby PDA by ID
 */
function getLobbyPDA(lobbyId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS_1V1.LOBBY, new BN(lobbyId).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

/**
 * Build a create_lobby transaction
 * 
 * @param playerA - Player A's public key
 * @param amount - Bet amount in lamports
 * @param characterA - Character ID (0-255)
 * @param mapId - Map ID (0-255)
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildCreateLobbyTransaction(
  playerA: PublicKey,
  amount: number,
  characterA: number,
  mapId: number,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.solana.debug("Building create_lobby transaction", {
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

    // Fetch the config account to get the current lobby count
    const configAccount = await connection.getAccountInfo(configPda);
    if (!configAccount) {
      throw new Error("Config account not found. Make sure initialize_config has been called.");
    }

    // Decode the config account manually
    // The Domin81v1Config structure (from Rust):
    // 8-byte discriminator
    // 32 bytes: admin (Pubkey)
    // 32 bytes: treasury (Pubkey)
    // 2 bytes: house_fee_bps (u16)
    // 8 bytes: lobby_count (u64) <- this is what we need
    const discriminatorLength = 8;
    const adminOffset = discriminatorLength; // 8
    const treasuryOffset = adminOffset + 32; // 40
    const houseFeeOffset = treasuryOffset + 32; // 72
    const lobbyCountOffset = houseFeeOffset + 2; // 74
    
    // Validate buffer has enough data
    if (configAccount.data.length < lobbyCountOffset + 8) {
      throw new Error(
        `Config account data too small. Expected at least ${lobbyCountOffset + 8} bytes, got ${configAccount.data.length}`
      );
    }
    
    // Read u64 (8 bytes) for lobby_count at the correct offset using little-endian
    const lobbyCountBuffer = configAccount.data.slice(lobbyCountOffset, lobbyCountOffset + 8);
    let currentLobbyCount: number;
    
    try {
      const bigintValue = lobbyCountBuffer.readBigUInt64LE(0);
      currentLobbyCount = Number(bigintValue);
      
      // Validate the count is a safe integer
      if (!Number.isSafeInteger(currentLobbyCount)) {
        throw new Error(`Lobby count ${bigintValue} is not a safe integer`);
      }
    } catch (parseError) {
      logger.solana.error("Failed to parse lobby count from config", {
        error: parseError,
        bufferLength: lobbyCountBuffer.length,
        bufferHex: lobbyCountBuffer.toString("hex"),
        configDataLength: configAccount.data.length,
        offset: lobbyCountOffset,
      });
      throw new Error(`Failed to parse lobby count: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    logger.solana.debug("Fetched lobby count from config", { currentLobbyCount, offset: lobbyCountOffset });

    // Derive lobby PDA using the current lobby count from config
    const [lobbyPda] = getLobbyPDA(currentLobbyCount);

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerA,
      } as any,
      { commitment: "confirmed" }
    );
    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Default position for simplicity: [0, 0]
    const positionA = [0, 0] as [number, number];

    // Build the create_lobby instruction
    const createLobbyIx = await program.methods
      .createLobby(new BN(amount), characterA, positionA, mapId)
      .accounts({
        config: configPda,
        lobby: lobbyPda,
        playerA,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // Compile message
    const messageV0 = new TransactionMessage({
      payerKey: playerA,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        createLobbyIx,
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    logger.solana.debug("Created create_lobby transaction");
    return transaction;
  } catch (error) {
    logger.solana.error("Failed to build create_lobby transaction:", error);
    throw error;
  }
}

/**
 * Build a join_lobby transaction
 * 
 * @param playerB - Player B's public key
 * @param lobbyId - Lobby ID to join
 * @param characterB - Character ID (0-255)
 * @param lobbyPda - Lobby PDA address
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildJoinLobbyTransaction(
  playerB: PublicKey,
  lobbyId: number,
  characterB: number,
  lobbyPda: PublicKey,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.solana.debug("Building join_lobby transaction", {
      playerB: playerB.toString(),
      lobbyId,
      characterB,
      lobbyPda: lobbyPda.toString(),
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerB,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Fetch lobby account once (used for both amount and player_a)
    let lobbyAmount: number = 0;
    let playerA: PublicKey;
    
    const lobbyAccountInfo = await connection.getAccountInfo(lobbyPda);
    if (!lobbyAccountInfo) {
      throw new Error(`Lobby account not found at ${lobbyPda.toString()}`);
    }

    try {
      const data = lobbyAccountInfo.data;
      
      // Domin81v1Lobby structure (Borsh encoded):
      // 0-7: discriminator (8 bytes)
      // 8-15: lobby_id (u64)
      // 16-47: player_a (Pubkey, 32 bytes)
      // ...
      
      // Read player_a
      if (data.length < 48) {
        throw new Error(`Data too short for player_a: ${data.length} bytes`);
      }
      playerA = new PublicKey(data.slice(16, 48));
      
      // Check if player_b is Some (discriminant at offset 48)
      const playerBDiscriminant = data[48];
      let amountOffset: number;
      
      if (playerBDiscriminant === 0) {
        // player_b is None, so amount is right after the discriminant
        amountOffset = 49;
      } else if (playerBDiscriminant === 1) {
        // player_b is Some, skip 32 bytes for the pubkey
        amountOffset = 49 + 32; // = 81
      } else {
        throw new Error(`Invalid player_b discriminant: ${playerBDiscriminant}`);
      }

      // Read the amount at the calculated offset
      if (data.length < amountOffset + 8) {
        throw new Error(`Data too short for amount: ${data.length} bytes, need at least ${amountOffset + 8}`);
      }

      const amountBuffer = data.slice(amountOffset, amountOffset + 8);
      const amountBigInt = amountBuffer.readBigUInt64LE(0);
      lobbyAmount = Number(amountBigInt);

      logger.solana.debug("Parsed lobby data", { 
        playerA: playerA.toString(),
        lobbyAmount 
      });

    } catch (parseError) {
      logger.solana.error("Failed to parse lobby account", {
        error: parseError,
        lobbyPda: lobbyPda.toString(),
      });
      throw new Error(`Failed to parse lobby account: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Default position for simplicity: [0, 0]
    const positionB = [0, 0] as [number, number];

    // MagicBlock Oracle Queue (Devnet)
    // TODO: Make this configurable based on cluster
    const ORACLE_QUEUE = new PublicKey("uPeRMDfPmrPqgRWSrjAnAkH78ZG3ktNQ8M6yDUhpACp");

    // Build the join_lobby instruction
    logger.solana.debug("Building join_lobby instruction...");
    
    const joinLobbyIx = await program.methods
      .joinLobby(new BN(lobbyAmount), characterB, positionB)
      .accounts({
        config: configPda,
        lobby: lobbyPda,
        playerB,
        playerA, // Needed for callback metas
        oracleQueue: ORACLE_QUEUE,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // Compile message
    const messageV0 = new TransactionMessage({
      payerKey: playerB,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        joinLobbyIx,
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    logger.solana.debug("Built join_lobby transaction");
    return transaction;

  } catch (error) {
    logger.solana.error("Failed to build join_lobby transaction:", error);
    throw error;
  }
}

/**
 * Build a cancel_lobby transaction
 * 
 * @param playerA - Player A's public key (must be the creator)
 * @param lobbyPda - Lobby PDA address
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildCancelLobbyTransaction(
  playerA: PublicKey,
  lobbyPda: PublicKey,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.solana.debug("Building cancel_lobby transaction", {
      playerA: playerA.toString(),
      lobbyPda: lobbyPda.toString(),
    });

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: playerA,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Build the cancel_lobby instruction
    const cancelLobbyIx = await program.methods
      .cancelLobby()
      .accounts({
        lobby: lobbyPda,
        playerA,
      } as any)
      .instruction();

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // Compile message
    const messageV0 = new TransactionMessage({
      payerKey: playerA,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        cancelLobbyIx,
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    logger.solana.debug("Created cancel_lobby transaction");
    return transaction;
  } catch (error) {
    logger.solana.error("Failed to build cancel_lobby transaction:", error);
    throw error;
  }
}

/**
 * Send a signed transaction and wait for confirmation
 * 
 * @param connection - Solana connection
 * @param signature - Transaction signature (base58 encoded)
 * @param timeout - Timeout in milliseconds (default: 30 seconds)
 * @returns Promise<boolean> - True if confirmed, false if timeout
 */
export async function waitForTransactionConfirmation(
  connection: Connection,
  signature: string,
  timeout: number = 30_000
): Promise<boolean> {
  try {
    logger.solana.debug("Waiting for transaction confirmation", { signature, timeout });

    const startTime = Date.now();
    const pollInterval = 1_000; // 1 second

    while (Date.now() - startTime < timeout) {
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
        logger.solana.debug("Transaction confirmed", { signature });
        return true;
      }

      if (status.value?.err) {
        logger.solana.error("Transaction failed", { signature, error: status.value.err });
        return false;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    logger.solana.warn("Transaction confirmation timeout", { signature });
    return false;
  } catch (error) {
    logger.solana.error("Error waiting for confirmation:", error);
    throw error;
  }
}

/**
 * Get the Program ID for the 1v1 program
 */
export function get1v1ProgramId(): PublicKey {
  return PROGRAM_ID;
}

/**
 * Get the Lobby PDA for a given lobby ID
 */
export function get1v1LobbyPDA(lobbyId: number): PublicKey {
  const [pda] = getLobbyPDA(lobbyId);
  return pda;
}

/**
 * Get the Config PDA
 */
export function get1v1ConfigPDA(): PublicKey {
  const [pda] = getConfigPDA();
  return pda;
}
