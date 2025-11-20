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
import { Orao } from "@orao-network/solana-vrf";
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
    [PDA_SEEDS_1V1.LOBBY, new BN(lobbyId).toBuffer("le", 8)],
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
    logger.ui.debug("Building create_lobby transaction", {
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

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
    logger.ui.debug("Created create_lobby transaction");
    return transaction;
  } catch (error) {
    logger.ui.error("Failed to build create_lobby transaction:", error);
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
 * @param forceSeed - ORAO force seed (hex string)
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildJoinLobbyTransaction(
  playerB: PublicKey,
  lobbyId: number,
  characterB: number,
  lobbyPda: PublicKey,
  forceSeed: string,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.ui.debug("Building join_lobby transaction", {
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

    // Fetch lobby to get amount
    const lobbyAccount = await program.account.domin81v1Lobby.fetch(lobbyPda);

    // Default position for simplicity: [0, 0]
    const positionB = [0, 0] as [number, number];

    // ORAO Setup
    const orao = new Orao(connection);
    const vrf = orao.programId;
    const configAccount = orao.getNetworkStatePda();
    const treasury = orao.getTreasuryPda();
    const randomnessAccount = orao.getRandomnessPda(Buffer.from(forceSeed, 'hex'));

    // Build the join_lobby instruction
    const joinLobbyIx = await program.methods
      .joinLobby(new BN(lobbyAccount.amount), characterB, positionB)
      .accounts({
        config: configPda,
        lobby: lobbyPda,
        playerB,
        vrf,
        configAccount,
        treasury,
        randomnessAccount,
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
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        joinLobbyIx,
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    logger.ui.debug("Created join_lobby transaction");
    return transaction;
  } catch (error) {
    logger.ui.error("Failed to build join_lobby transaction:", error);
    throw error;
  }
}

/**
 * Build a settle_lobby transaction
 * 
 * @param signer - Signer's public key (can be anyone)
 * @param lobbyId - Lobby ID to settle
 * @param lobbyPda - Lobby PDA address
 * @param forceSeed - ORAO force seed (hex string)
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildSettleLobbyTransaction(
  signer: PublicKey,
  lobbyId: number,
  lobbyPda: PublicKey,
  forceSeed: string,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.ui.debug("Building settle_lobby transaction", {
      signer: signer.toString(),
      lobbyId,
      lobbyPda: lobbyPda.toString(),
    });

    // Get Config PDA
    const [configPda] = getConfigPDA();

    // Create a read-only provider for instruction building
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: signer,
      } as any,
      { commitment: "confirmed" }
    );

    const program = new Program<Domin81v1Prgm>(IDL as any, provider);

    // Fetch lobby to get players
    const lobbyAccount = await program.account.domin81v1Lobby.fetch(lobbyPda);
    const configAccount = await program.account.domin81v1Config.fetch(configPda);

    // ORAO Setup
    const orao = new Orao(connection);
    const randomnessAccount = orao.getRandomnessPda(Buffer.from(forceSeed, 'hex'));

    // Build the settle_lobby instruction
    const settleLobbyIx = await program.methods
      .settleLobby()
      .accounts({
        config: configPda,
        lobby: lobbyPda,
        randomnessAccount,
        playerA: lobbyAccount.playerA,
        playerB: lobbyAccount.playerB,
        treasury: configAccount.treasury,
        signer,
      } as any)
      .instruction();

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // Compile message
    const messageV0 = new TransactionMessage({
      payerKey: signer,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        settleLobbyIx,
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    logger.ui.debug("Created settle_lobby transaction");
    return transaction;
  } catch (error) {
    logger.ui.error("Failed to build settle_lobby transaction:", error);
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
    logger.ui.debug("Building cancel_lobby transaction", {
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
    logger.ui.debug("Created cancel_lobby transaction");
    return transaction;
  } catch (error) {
    logger.ui.error("Failed to build cancel_lobby transaction:", error);
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
    logger.ui.debug("Waiting for transaction confirmation", { signature, timeout });

    const startTime = Date.now();
    const pollInterval = 1_000; // 1 second

    while (Date.now() - startTime < timeout) {
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
        logger.ui.debug("Transaction confirmed", { signature });
        return true;
      }

      if (status.value?.err) {
        logger.ui.error("Transaction failed", { signature, error: status.value.err });
        return false;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    logger.ui.warn("Transaction confirmation timeout", { signature });
    return false;
  } catch (error) {
    logger.ui.error("Error waiting for confirmation:", error);
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
