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
  forceSeed: string,
  connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.solana.debug("Building create_lobby transaction", {
      playerA: playerA.toString(),
      amount,
      characterA,
      mapId,
      forceSeed,
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
 * @param forceSeed - ORAO force seed (hex string)
 * @param connection - Solana connection
 * @returns Promise<VersionedTransaction>
 */
export async function buildJoinLobbyTransaction(
  playerB: PublicKey,
  lobbyId: number,
  characterB: number,
  lobbyPda: PublicKey,
  _forceSeed: string,
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

    // Fetch lobby account once (used for both amount and force seed)
    let lobbyAmount: number = 0;
    let forceSeed: Buffer;
    
    const lobbyAccountInfo = await connection.getAccountInfo(lobbyPda);
    if (!lobbyAccountInfo) {
      throw new Error(`Lobby account not found at ${lobbyPda.toString()}`);
    }

    logger.solana.debug("Lobby account info", {
      owner: lobbyAccountInfo.owner.toString(),
      dataLength: lobbyAccountInfo.data.length,
    });

    try {
      const data = lobbyAccountInfo.data;
      
      logger.solana.debug("Lobby account data info", {
        totalLength: data.length,
        first64Hex: data.slice(0, 64).toString("hex"),
      });

      // Domin81v1Lobby structure (Borsh encoded):
      // 0-7: discriminator (8 bytes)
      // 8-15: lobby_id (u64)
      // 16-47: player_a (Pubkey, 32 bytes)
      // 48: player_b discriminant (1 byte, 0=None, 1=Some)
      // 49-80: player_b value (32 bytes if Some, skip if None)
      // After player_b: amount (u64, 8 bytes)
      
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

      logger.solana.debug("Lobby structure analysis", {
        playerBDiscriminant,
        expectedAmountOffset: amountOffset,
      });

      // Read the amount at the calculated offset
      if (data.length < amountOffset + 8) {
        throw new Error(`Data too short for amount: ${data.length} bytes, need at least ${amountOffset + 8}`);
      }

      const amountBuffer = data.slice(amountOffset, amountOffset + 8);
      const amountBigInt = amountBuffer.readBigUInt64LE(0);
      lobbyAmount = Number(amountBigInt);

      // Validate it's a reasonable amount
      const MIN_AMOUNT = 10_000_000; // 0.01 SOL
      const MAX_AMOUNT = 100_000_000_000; // 100 SOL
      
      if (lobbyAmount < MIN_AMOUNT || lobbyAmount > MAX_AMOUNT) {
        logger.solana.error("Amount out of valid range", {
          amount: lobbyAmount,
          min: MIN_AMOUNT,
          max: MAX_AMOUNT,
          offset: amountOffset,
          hex: amountBuffer.toString("hex"),
        });
        throw new Error(`Amount ${lobbyAmount} is outside valid range [${MIN_AMOUNT}, ${MAX_AMOUNT}]`);
      }

      logger.solana.debug("Found lobby amount", { lobbyAmount, offset: amountOffset });

      // Parse force field - should be 32 bytes after the amount
      const forceStartOffset = amountOffset + 8;
      if (data.length < forceStartOffset + 32) {
        throw new Error(`Data too short for force field: ${data.length} bytes, need at least ${forceStartOffset + 32}`);
      }

      forceSeed = Buffer.from(data.slice(forceStartOffset, forceStartOffset + 32));
      logger.solana.debug("Parsed force seed", { 
        forceHex: forceSeed.toString("hex"),
        forceOffset: forceStartOffset
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

    // Import ORAO SDK for VRF account derivation
    const OraoModule = await import("@orao-network/solana-vrf");
    const { Orao, networkStateAccountAddress, randomnessAccountAddress } = OraoModule;
    const ORAO_VRF_ID = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
    
    // Initialize ORAO SDK
    const orao = new Orao(provider as any);
    
    // Derive VRF accounts using ORAO SDK
    const networkState = networkStateAccountAddress();
    const randomnessAccount = randomnessAccountAddress(forceSeed);
    
    // Get treasury from ORAO network state
    logger.solana.debug("Fetching ORAO network state...");
    const networkStateData = await orao.getNetworkState();
    logger.solana.debug("ORAO network state fetched", {
      treasuryRaw: String(networkStateData.config.treasury),
      treasuryType: typeof networkStateData.config.treasury,
    });
    
    let treasuryPubkey: PublicKey;
    const treasuryRaw = networkStateData.config.treasury;
    
    if (treasuryRaw instanceof PublicKey) {
      treasuryPubkey = treasuryRaw;
    } else if (typeof treasuryRaw === "string") {
      treasuryPubkey = new PublicKey(treasuryRaw);
    } else if (treasuryRaw && typeof treasuryRaw === "object") {
      // Try to convert buffer or other representations
      treasuryPubkey = new PublicKey(treasuryRaw as any);
    } else {
      throw new Error(`Invalid treasury type from ORAO: ${typeof treasuryRaw}, value: ${treasuryRaw}`);
    }

    logger.solana.debug("ORAO VRF accounts derived", {
      networkState: networkState.toString(),
      randomnessAccount: randomnessAccount.toString(),
      treasury: treasuryPubkey.toString(),
      oraoVrfId: ORAO_VRF_ID.toString(),
    });

    // Validate all accounts are valid PublicKeys
    const accountsToValidate: Record<string, unknown> = {
      config: configPda,
      lobby: lobbyPda,
      playerB: playerB,
      vrf: ORAO_VRF_ID,
      configAccount: networkState,
      treasury: treasuryPubkey,
      randomnessAccount: randomnessAccount,
      systemProgram: SystemProgram.programId,
    };

    for (const [name, addr] of Object.entries(accountsToValidate)) {
      if (!addr || !(addr instanceof PublicKey)) {
        logger.solana.error(`Invalid account address for ${name}`, { 
          value: String(addr),
          type: typeof addr,
        });
        throw new Error(`Invalid account address for ${name}: ${addr} (type: ${typeof addr})`);
      }
    }

    logger.solana.debug("All accounts validated");

    // Log all accounts before building instruction for debugging
    logger.solana.info("📋 Join Lobby Instruction Accounts", {
      config: configPda.toString(),
      lobby: lobbyPda.toString(), 
      playerB: playerB.toString(),
      vrf: ORAO_VRF_ID.toString(),
      configAccount: networkState.toString(),
      treasury: treasuryPubkey.toString(),
      randomnessAccount: randomnessAccount.toString(),
      systemProgram: SystemProgram.programId.toString(),
    });

    logger.solana.info("📋 Instruction Parameters", {
      amount: lobbyAmount.toString(),
      characterB,
      positionB: positionB.toString(),
    });

    // Build the join_lobby instruction with proper ORAO accounts
    // Use .instruction() to get the raw instruction
    logger.solana.debug("Building join_lobby instruction with Anchor...");
    let joinLobbyIx;
    
    try {
      joinLobbyIx = await program.methods
        .joinLobby(new BN(lobbyAmount), characterB, positionB)
        .accounts({
          config: configPda,
          lobby: lobbyPda,
          playerB,
          vrf: ORAO_VRF_ID,
          configAccount: networkState,
          treasury: treasuryPubkey,
          randomnessAccount: randomnessAccount,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();
      
      logger.solana.info("✅ Instruction built successfully");
    } catch (buildError) {
      logger.solana.error("❌ Failed to build instruction", {
        error: buildError instanceof Error ? buildError.message : String(buildError),
        stack: buildError instanceof Error ? buildError.stack : undefined,
      });
      
      // Check which account might be problematic - log their string values
      logger.solana.error("Account debug info:", {
        config: String(configPda),
        lobby: String(lobbyPda),
        playerB: String(playerB),
        vrf: String(ORAO_VRF_ID),
        configAccount: String(networkState),
        treasury: String(treasuryPubkey),
        randomnessAccount: String(randomnessAccount),
        systemProgram: String(SystemProgram.programId),
      });
      
      throw buildError;
    }

    logger.solana.debug("Built join_lobby instruction", {
      programId: joinLobbyIx.programId.toString(),
      keysCount: joinLobbyIx.keys.length,
      dataLength: joinLobbyIx.data.length,
    });

    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // HELIUS SIMULATION: Test transaction before signing
    logger.solana.info("🔍 Simulating transaction with Helius...");
    
    const simulationInstructions = [joinLobbyIx];
    const testMessage = new TransactionMessage({
      payerKey: playerB,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ...simulationInstructions,
      ],
    }).compileToV0Message();

    const testTx = new VersionedTransaction(testMessage);
    
    try {
      const simulation = await connection.simulateTransaction(testTx, {
        replaceRecentBlockhash: true,
        sigVerify: false,
      });

      if (simulation.value.err) {
        logger.solana.error("❌ Transaction simulation failed", {
          error: simulation.value.err,
          logs: simulation.value.logs,
        });
        throw new Error(`Simulation error: ${JSON.stringify(simulation.value.err)}`);
      }

      logger.solana.info("✅ Simulation successful", {
        unitsConsumed: simulation.value.unitsConsumed,
        logs: simulation.value.logs?.slice(-5), // Last 5 logs for context
      });

      // Apply buffer to simulated CU (Helius recommendation: 10% buffer)
      const simulatedCU = simulation.value.unitsConsumed || 100_000;
      const optimizedCU = Math.ceil(simulatedCU * 1.1);

      logger.solana.debug("Compute unit optimization", {
        simulated: simulatedCU,
        optimized: optimizedCU,
        buffer: "10%",
      });

      // Rebuild with optimized compute units
      const finalInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: optimizedCU }),
        joinLobbyIx,
      ];

      const finalMessage = new TransactionMessage({
        payerKey: playerB,
        recentBlockhash: blockhash,
        instructions: finalInstructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(finalMessage);
      logger.solana.debug("Built optimized join_lobby transaction", {
        computeUnitLimit: optimizedCU,
      });
      return transaction;

    } catch (simError) {
      logger.solana.warn("⚠️ Simulation error, proceeding with conservative CU estimate", {
        error: simError instanceof Error ? simError.message : String(simError),
      });

      // Fallback: Use conservative compute units
      const conservativeInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        joinLobbyIx,
      ];

      const messageV0 = new TransactionMessage({
        payerKey: playerB,
        recentBlockhash: blockhash,
        instructions: conservativeInstructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      logger.solana.debug("Built join_lobby transaction with fallback CU");
      return transaction;
    }
  } catch (error) {
    logger.solana.error("Failed to build join_lobby transaction:", error);
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
  _forceSeed: string,
  _connection: Connection
): Promise<VersionedTransaction> {
  try {
    logger.solana.debug("Building settle_lobby transaction", {
      signer: signer.toString(),
      lobbyId,
      lobbyPda: lobbyPda.toString(),
    });

    // Create a read-only provider for instruction building
    // (not used yet, but will be needed when settle_lobby is added)
    // const provider = new AnchorProvider(
    //   connection,
    //   {
    //     publicKey: signer,
    //   } as any,
    //   { commitment: "confirmed" }
    // );

    // Build the settle instruction
    // TODO: settle_lobby instruction not yet implemented in Anchor program
    // This is a temporary placeholder - the actual implementation will be:
    // const settleIx = await program.methods
    //   .settleLobby()
    //   .accounts({...})
    //   .instruction();
    
    throw new Error("settle_lobby instruction not yet available in IDL. Please rebuild the Anchor program with settle_lobby instruction.");

    // eslint-disable-next-line @typescript-eslint/no-unreachable
    return undefined as any;
  } catch (error) {
    logger.solana.error("Failed to build settle_lobby transaction:", error);
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
