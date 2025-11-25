// Solana integration layer for querying the 1v1 Lobby program
"use node";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";

// Import the 1v1 IDL type
import type { Domin81v1Prgm } from "../../target/types/domin8_1v1_prgm";
import IDL from "../../target/idl/domin8_1v1_prgm.json";
import bs58 from "bs58";

// PDA seeds for 1v1 program
export const PDA_SEEDS_1V1 = {
  CONFIG: Buffer.from("domin8_1v1_config"),
  LOBBY: Buffer.from("domin8_1v1_lobby"),
} as const;

// Simple NodeWallet implementation for server-side use
class NodeWallet implements anchor.Wallet {
  constructor(readonly payer: Keypair) {}

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
    } else {
      // VersionedTransaction needs different signing
      tx.sign([this.payer]);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map((tx) => {
      if (tx instanceof Transaction) {
        tx.partialSign(this.payer);
      } else {
        tx.sign([this.payer]);
      }
      return tx;
    });
  }

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}

/**
 * Query-only client for the 1v1 Lobby Solana program
 * Used by Convex backend to fetch blockchain state for syncing
 */
export class Solana1v1QueryClient {
  private connection: Connection;
  private program: anchor.Program<Domin81v1Prgm>;
  private programId: PublicKey;

  constructor(rpcEndpoint: string) {
    // Initialize connection
    this.connection = new Connection(rpcEndpoint, "confirmed");

    // Extract program ID from IDL
    this.programId = new PublicKey((IDL as any).address);

    // Create read-only provider (no wallet needed)
    const provider = new anchor.AnchorProvider(
      this.connection,
      {
        publicKey: PublicKey.default,
      } as any,
      { commitment: "confirmed" }
    );

    // Initialize program with 1v1 IDL
    this.program = new anchor.Program<Domin81v1Prgm>(IDL as any, provider);
  }

  /**
   * Get the Config PDA for the 1v1 program
   */
  private getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], this.programId);
  }

  /**
   * Get a Lobby PDA by ID
   */
  private getLobbyPDA(lobbyId: number): [PublicKey, number] {
    try {
      // Convert lobbyId to buffer (little-endian u64)
      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(lobbyId), 0);
      
      return PublicKey.findProgramAddressSync(
        [PDA_SEEDS_1V1.LOBBY, idBuffer],
        this.programId
      );
    } catch (error) {
      throw new Error(
        `Failed to derive lobby PDA for ID ${lobbyId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch a lobby account from the blockchain
   */
  async getLobbyAccount(lobbyPda: PublicKey): Promise<any> {
    try {
      // Try using account namespace with different naming conventions
      try {
        return await (this.program.account as any).domin81v1Lobby.fetch(lobbyPda);
      } catch (e1) {
        try {
          return await (this.program.account as any).Domin81v1Lobby.fetch(lobbyPda);
        } catch (e2) {
          // Fallback to raw account data fetch
          // console.warn("[QueryClient] Anchor fetch failed for lobby, using raw account fetch");
          const accountInfo = await this.connection.getAccountInfo(lobbyPda);
          
          if (!accountInfo || !accountInfo.data) {
            throw new Error("Lobby account not found or empty");
          }

          // Parse the lobby account data manually
          // Account structure from state.rs (Rust's Anchor serialization):
          // discriminator(8) + lobby_id(8) + player_a(32) + player_b(33) + amount(8) + randomness_account(32) + 
          // status(1) + winner(33) + created_at(8) + skin_a(1) + skin_b(2) + 
          // position_a(4) + position_b(5) + map(1) = 176 bytes total
          const data = accountInfo.data;
          
          // console.log(`[QueryClient] Raw account data length: ${data.length} bytes`);
          
          if (data.length < 176) {
            throw new Error(`Lobby account data too short: ${data.length} bytes, expected 176`);
          }

          let offset = 8; // Skip discriminator

          // Parse fields
          const lobbyId = Number(data.readBigUInt64LE(offset));
          offset += 8;

          const playerA = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;

          // player_b: Option<Pubkey> - 1 byte discriminant + 32 bytes ONLY if Some
          const playerBOption = data[offset];
          offset += 1;
          const playerB = playerBOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
          if (playerBOption === 1) {
            offset += 32;
          }

          const amount = Number(data.readBigUInt64LE(offset));
          offset += 8;

          const forceBuffer = data.slice(offset, offset + 32);
          const force = forceBuffer.toString('hex');
          offset += 32;

          const status = data[offset];
          offset += 1;

          // winner: Option<Pubkey> - 1 byte discriminant + 32 bytes ONLY if Some
          const winnerOption = data[offset];
          offset += 1;
          const winner = winnerOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
          if (winnerOption === 1) {
            offset += 32;
          }

          const createdAt = Number(data.readBigInt64LE(offset));
          offset += 8;

          const skinA = data[offset];
          offset += 1;

          // skin_b: Option<u8> - 1 byte discriminant + 1 byte ONLY if Some
          const skinBOption = data[offset];
          offset += 1;
          const skinB = skinBOption === 1 ? data[offset] : null;
          if (skinBOption === 1) {
            offset += 1;
          }

          const positionA: [number, number] = [
            data.readUInt16LE(offset),
            data.readUInt16LE(offset + 2),
          ];
          offset += 4;

          // position_b: Option<[u16; 2]> - 1 byte discriminant + 4 bytes ONLY if Some
          const positionBOption = data[offset];
          offset += 1;
          let positionB: [number, number] | null = null;
          if (positionBOption === 1) {
            positionB = [
              data.readUInt16LE(offset),
              data.readUInt16LE(offset + 2),
            ];
            offset += 4;
          }

          const map = data[offset];
          // console.log(`[QueryClient] offset=${offset}, map=${map}`);
          // console.log(`[QueryClient] Final offset: ${offset + 1}, total length: ${data.length}`);

          return {
            lobbyId: { toNumber: () => lobbyId },
            playerA,
            playerB,
            amount: { toNumber: () => amount },
            force,
            status,
            winner,
            createdAt: { toNumber: () => createdAt },
            skinA,
            skinB,
            positionA,
            positionB,
            map,
          };
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch the config account from the blockchain
   */
  async getConfigAccount(): Promise<any> {
    try {
      const [configPda] = this.getConfigPDA();
      
      // Try using Anchor account fetch with different naming conventions
      try {
        return await (this.program.account as any).domin81v1Config.fetch(configPda);
      } catch (e1) {
        try {
          return await (this.program.account as any).Domin81v1Config.fetch(configPda);
        } catch (e2) {
          // Fallback: Use raw account data fetch
          // console.warn("[QueryClient] Anchor fetch failed for config, using raw account fetch");
          const accountInfo = await this.connection.getAccountInfo(configPda);
          
          if (!accountInfo || !accountInfo.data) {
            throw new Error("Config account not found or empty");
          }

          // Parse the account data manually
          // The account structure is: discriminator(8) + admin(32) + treasury(32) + house_fee_bps(2) + lobby_count(8) = 82 bytes
          const data = accountInfo.data;
          
          if (data.length < 82) {
            throw new Error(`Config account data too short: ${data.length} bytes`);
          }

          // Skip discriminator (first 8 bytes)
          const lobbyCountOffset = 8 + 32 + 32 + 2; // admin + treasury + house_fee_bps
          const lobbyCountBuffer = data.slice(lobbyCountOffset, lobbyCountOffset + 8);
          
          // Read as little-endian u64
          const lobbyCount = Number(
            lobbyCountBuffer.readBigUInt64LE(0)
          );

          // console.log(`[QueryClient] Parsed config from raw data: lobbyCount = ${lobbyCount}`);

          return {
            lobbyCount: { toNumber: () => lobbyCount },
            admin: new PublicKey(data.slice(8, 40)),
            treasury: new PublicKey(data.slice(40, 72)),
            houseFee: data.readUInt16LE(72),
          };
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the next lobby ID (from current config.lobby_count)
   */
  async getNextLobbyId(): Promise<number> {
    const config = await this.getConfigAccount();
    return config.lobbyCount.toNumber();
  }

  /**
   * Get a lobby PDA address for a given lobby ID
   */
  getLobbyPdaForId(lobbyId: number): PublicKey {
    const [pda] = this.getLobbyPDA(lobbyId);
    return pda;
  }

  /**
   * Get program ID
   */
  getProgramId(): PublicKey {
    return this.programId;
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.connection;
  }
}

/**
 * Signing client for 1v1 Lobby - can execute instructions on-chain
 * Used by Convex scheduler/crank to call settle_lobby instruction
 */
export class Solana1v1Client {
  private connection: Connection;
  private program: anchor.Program<Domin81v1Prgm>;
  private provider: anchor.AnchorProvider;
  private authority: Keypair;
  private programId: PublicKey;

  constructor(rpcEndpoint: string, authorityPrivateKey: string) {
    // Initialize connection
    this.connection = new Connection(rpcEndpoint, "confirmed");

    // Extract program ID from IDL
    this.programId = new PublicKey((IDL as any).address);

    // Create authority keypair from private key
    let privateKeyBytes: Uint8Array;
    try {
      const trimmed = authorityPrivateKey.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        privateKeyBytes = new Uint8Array(JSON.parse(trimmed));
      } else {
        // Base58 format
        privateKeyBytes = bs58.decode(trimmed);
        if (privateKeyBytes.length !== 64) {
          throw new Error(`Invalid key length: ${privateKeyBytes.length} bytes (expected 64)`);
        }
      }
      this.authority = Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      throw new Error(
        `Failed to parse CRANK_AUTHORITY_PRIVATE_KEY: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Create provider with NodeWallet
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new NodeWallet(this.authority),
      { commitment: "confirmed" }
    );

    // Initialize program with 1v1 IDL
    this.program = new anchor.Program<Domin81v1Prgm>(IDL as any, this.provider);
  }

  /**
   * Get a Lobby PDA by ID
   */
  private getLobbyPDA(lobbyId: number): [PublicKey, number] {
    try {
      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(lobbyId), 0);
      
      return PublicKey.findProgramAddressSync(
        [PDA_SEEDS_1V1.LOBBY, idBuffer],
        this.programId
      );
    } catch (error) {
      throw new Error(
        `Failed to derive lobby PDA for ID ${lobbyId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the Config PDA for the 1v1 program
   */
  private getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], this.programId);
  }

  /**
   * Fetch a lobby account from the blockchain
   */
  async getLobbyAccount(lobbyPda: PublicKey): Promise<any> {
    try {
      try {
        return await (this.program.account as any).domin81v1Lobby.fetch(lobbyPda);
      } catch (e1) {
        try {
          return await (this.program.account as any).Domin81v1Lobby.fetch(lobbyPda);
        } catch (e2) {
          console.warn("[1v1Client] Anchor fetch failed for lobby, using raw account fetch");
          const accountInfo = await this.connection.getAccountInfo(lobbyPda);
          
          if (!accountInfo || !accountInfo.data) {
            throw new Error("Lobby account not found or empty");
          }

          const data = accountInfo.data;
          if (data.length < 176) {
            throw new Error(`Lobby account data too short: ${data.length} bytes, expected 176`);
          }

          let offset = 8;
          const lobbyId = Number(data.readBigUInt64LE(offset));
          offset += 8;

          const playerA = new PublicKey(data.slice(offset, offset + 32));
          offset += 32;

          const playerBOption = data[offset];
          offset += 1;
          const playerB = playerBOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
          if (playerBOption === 1) {
            offset += 32;
          }

          const amount = Number(data.readBigUInt64LE(offset));
          offset += 8;

          const forceBuffer = data.slice(offset, offset + 32);
          const force = forceBuffer.toString('hex');
          offset += 32;

          const status = data[offset];
          offset += 1;

          const winnerOption = data[offset];
          offset += 1;
          const winner = winnerOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
          if (winnerOption === 1) {
            offset += 32;
          }

          const createdAt = Number(data.readBigInt64LE(offset));
          offset += 8;

          const skinA = data[offset];
          offset += 1;

          const skinBOption = data[offset];
          offset += 1;
          const skinB = skinBOption === 1 ? data[offset] : null;
          if (skinBOption === 1) {
            offset += 1;
          }

          const positionA: [number, number] = [
            data.readUInt16LE(offset),
            data.readUInt16LE(offset + 2),
          ];
          offset += 4;

          const positionBOption = data[offset];
          offset += 1;
          let positionB: [number, number] | null = null;
          if (positionBOption === 1) {
            positionB = [
              data.readUInt16LE(offset),
              data.readUInt16LE(offset + 2),
            ];
            offset += 4;
          }

          const map = data[offset];

          return {
            lobbyId: { toNumber: () => lobbyId },
            playerA,
            playerB,
            amount: { toNumber: () => amount },
            force,
            status,
            winner,
            createdAt: { toNumber: () => createdAt },
            skinA,
            skinB,
            positionA,
            positionB,
            map,
          };
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch the config account from the blockchain
   */
  async getConfigAccount(): Promise<any> {
    try {
      const [configPda] = this.getConfigPDA();
      
      try {
        return await (this.program.account as any).domin81v1Config.fetch(configPda);
      } catch (e1) {
        try {
          return await (this.program.account as any).Domin81v1Config.fetch(configPda);
        } catch (e2) {
          console.warn("[1v1Client] Anchor fetch failed for config, using raw account fetch");
          const accountInfo = await this.connection.getAccountInfo(configPda);
          
          if (!accountInfo || !accountInfo.data) {
            throw new Error("Config account not found or empty");
          }

          const data = accountInfo.data;
          if (data.length < 82) {
            throw new Error(`Config account data too short: ${data.length} bytes`);
          }

          const lobbyCountOffset = 8 + 32 + 32 + 2;
          const lobbyCountBuffer = data.slice(lobbyCountOffset, lobbyCountOffset + 8);
          const lobbyCount = Number(lobbyCountBuffer.readBigUInt64LE(0));

          return {
            lobbyCount: { toNumber: () => lobbyCount },
            admin: new PublicKey(data.slice(8, 40)),
            treasury: new PublicKey(data.slice(40, 72)),
            houseFee: data.readUInt16LE(72),
          };
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get a lobby PDA address for a given lobby ID
   */
  getLobbyPdaForId(lobbyId: number): PublicKey {
    const [pda] = this.getLobbyPDA(lobbyId);
    return pda;
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Call settle_lobby instruction on-chain
   * 
   * With the new VRF flow, settle_lobby is a permissionless crank instruction
   * that can be called by anyone after VRF callback has stored randomness.
   * It reads randomness from the lobby account and distributes funds.
   */
  async settleLobby(lobbyId: number): Promise<string> {
    try {
      console.log(`[1v1 Crank] Calling settle_lobby for lobby ${lobbyId}...`);

      const [lobbyPda] = this.getLobbyPDA(lobbyId);

      // Get the config PDA
      const [configPda] = this.getConfigPDA();

      // Get lobby account to fetch player addresses
      const lobbyAccount = await this.getLobbyAccount(lobbyPda);
      if (!lobbyAccount) {
        throw new Error("Lobby not found on-chain");
      }

      // Verify lobby is at status 2 (VRF_RECEIVED)
      if (lobbyAccount.status !== 2) {
        throw new Error(`Lobby status is ${lobbyAccount.status}, expected 2 (VRF_RECEIVED)`);
      }

      const playerA = new PublicKey(lobbyAccount.playerA);
      const playerB = new PublicKey(lobbyAccount.playerB);

      // Get treasury from config
      const config = await this.getConfigAccount();
      const treasury = new PublicKey(config.treasury?.toString() || "0");

      console.log(`[1v1 Crank] Lobby ${lobbyId}: playerA=${playerA.toBase58().slice(0,8)}..., playerB=${playerB.toBase58().slice(0,8)}...`);

      // Build the instruction accounts array
      // settle_lobby is now a permissionless crank - no VRF identity required
      const accounts = [
        { pubkey: configPda, isSigner: false, isWritable: true },           // config
        { pubkey: lobbyPda, isSigner: false, isWritable: true },            // lobby
        { pubkey: playerA, isSigner: false, isWritable: true },             // player_a
        { pubkey: playerB, isSigner: false, isWritable: true },             // player_b
        { pubkey: treasury, isSigner: false, isWritable: true },            // treasury
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
      ];

      // Get the settle_lobby instruction discriminator
      // This discriminator is generated by Anchor from the function name
      const instruction = new anchor.web3.TransactionInstruction({
        programId: this.programId,
        keys: accounts,
        data: Buffer.from([207, 75, 50, 251, 99, 177, 195, 225]), // settle_lobby discriminator (no args needed)
      });

      // Send the transaction
      const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
      const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: this.authority.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      const txn = new anchor.web3.VersionedTransaction(messageV0);
      txn.sign([this.authority]);

      const txSignature = await this.connection.sendTransaction(txn);
      console.log(`[1v1 Crank] settle_lobby tx: ${txSignature}`);
      
      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });
      
      console.log(`[1v1 Crank] settle_lobby confirmed for lobby ${lobbyId}`);
      return txSignature;
    } catch (error) {
      throw new Error(
        `Failed to settle lobby: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Confirm a transaction
   */
  async confirmTransaction(txSignature: string): Promise<boolean> {
    try {
      const confirmed = await this.connection.confirmTransaction(txSignature, "confirmed");
      return !confirmed.value.err;
    } catch (error) {
      console.error("Transaction confirmation error:", error);
      return false;
    }
  }
}
