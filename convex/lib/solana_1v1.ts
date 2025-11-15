// Solana integration layer for querying the 1v1 Lobby program
"use node";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Import the 1v1 IDL type
import type { Domin81v1Prgm } from "../../target/types/domin8_1v1_prgm";
import IDL from "../../target/idl/domin8_1v1_prgm.json";

// PDA seeds for 1v1 program
export const PDA_SEEDS_1V1 = {
  CONFIG: Buffer.from("domin8_1v1_config"),
  LOBBY: Buffer.from("domin8_1v1_lobby"),
} as const;

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
    return PublicKey.findProgramAddressSync(
      [PDA_SEEDS_1V1.LOBBY, new anchor.BN(lobbyId).toBuffer("le", 8)],
      this.programId
    );
  }

  /**
   * Fetch a lobby account from the blockchain
   */
  async getLobbyAccount(lobbyPda: PublicKey): Promise<any> {
    try {
      return await this.program.account.domin81v1Lobby.fetch(lobbyPda);
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
      return await this.program.account.domin81v1Config.fetch(configPda);
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
