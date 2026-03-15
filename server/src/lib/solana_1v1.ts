// Solana integration layer for querying the 1v1 Lobby program
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";

// Import the 1v1 IDL
import IDL from "./idl/domin8_1v1_prgm.json";
type Domin81v1Prgm = any;

export const PDA_SEEDS_1V1 = {
  CONFIG: Buffer.from("domin8_1v1_config"),
  LOBBY: Buffer.from("domin8_1v1_lobby"),
} as const;

class NodeWallet implements anchor.Wallet {
  constructor(readonly payer: Keypair) {}
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) tx.partialSign(this.payer);
    else tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map((tx) => {
      if (tx instanceof Transaction) tx.partialSign(this.payer);
      else tx.sign([this.payer]);
      return tx;
    });
  }
  get publicKey(): PublicKey { return this.payer.publicKey; }
}

/**
 * Query-only client for the 1v1 Lobby Solana program
 */
export class Solana1v1QueryClient {
  private connection: Connection;
  private program: anchor.Program<Domin81v1Prgm>;
  private programId: PublicKey;

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, "confirmed");
    this.programId = new PublicKey((IDL as any).address);
    const provider = new anchor.AnchorProvider(
      this.connection,
      { publicKey: PublicKey.default } as any,
      { commitment: "confirmed" }
    );
    this.program = new anchor.Program<Domin81v1Prgm>(IDL as any, provider);
  }

  private getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], this.programId);
  }

  private getLobbyPDA(lobbyId: number): [PublicKey, number] {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(lobbyId), 0);
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.LOBBY, idBuffer], this.programId);
  }

  async getLobbyAccount(lobbyPda: PublicKey): Promise<any> {
    try {
      try { return await (this.program.account as any).domin81v1Lobby.fetch(lobbyPda); }
      catch { /* fallback */ }
      try { return await (this.program.account as any).Domin81v1Lobby.fetch(lobbyPda); }
      catch { /* fallback to raw */ }

      const accountInfo = await this.connection.getAccountInfo(lobbyPda);
      if (!accountInfo || !accountInfo.data) throw new Error("Lobby account not found");
      const data = accountInfo.data;
      if (data.length < 103) throw new Error(`Lobby data too short: ${data.length}`);

      let offset = 8;
      const lobbyId = Number(data.readBigUInt64LE(offset)); offset += 8;
      const playerA = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
      const playerBOption = data[offset]; offset += 1;
      const playerB = playerBOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
      if (playerBOption === 1) offset += 32;
      const amount = Number(data.readBigUInt64LE(offset)); offset += 8;
      const forceBuffer = data.slice(offset, offset + 32); offset += 32;
      const status = data[offset]; offset += 1;
      const winnerOption = data[offset]; offset += 1;
      const winner = winnerOption === 1 ? new PublicKey(data.slice(offset, offset + 32)) : null;
      if (winnerOption === 1) offset += 32;
      const createdAt = Number(data.readBigInt64LE(offset)); offset += 8;
      const skinA = data[offset]; offset += 1;
      const skinBOption = data[offset]; offset += 1;
      const skinB = skinBOption === 1 ? data[offset] : null;
      if (skinBOption === 1) offset += 1;
      const map = data[offset]; offset += 1;
      const randomnessOption = data[offset]; offset += 1;
      let randomness: string | null = null;
      if (randomnessOption === 1) { randomness = data.slice(offset, offset + 32).toString('hex'); offset += 32; }

      return {
        lobbyId: { toNumber: () => lobbyId }, playerA, playerB,
        amount: { toNumber: () => amount }, force: forceBuffer.toString('hex'),
        status, winner, createdAt: { toNumber: () => createdAt },
        skinA, skinB, map, randomness,
      };
    } catch (error) {
      throw new Error(`Failed to fetch lobby: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getConfigAccount(): Promise<any> {
    try {
      const [configPda] = this.getConfigPDA();
      try { return await (this.program.account as any).domin81v1Config.fetch(configPda); }
      catch { /* fallback */ }
      try { return await (this.program.account as any).Domin81v1Config.fetch(configPda); }
      catch { /* fallback to raw */ }

      const accountInfo = await this.connection.getAccountInfo(configPda);
      if (!accountInfo || !accountInfo.data) throw new Error("Config account not found");
      const data = accountInfo.data;
      if (data.length < 82) throw new Error(`Config data too short: ${data.length}`);

      const lobbyCountOffset = 8 + 32 + 32 + 2;
      const lobbyCount = Number(data.slice(lobbyCountOffset, lobbyCountOffset + 8).readBigUInt64LE(0));
      return {
        lobbyCount: { toNumber: () => lobbyCount },
        admin: new PublicKey(data.slice(8, 40)),
        treasury: new PublicKey(data.slice(40, 72)),
        houseFee: data.readUInt16LE(72),
      };
    } catch (error) {
      throw new Error(`Failed to fetch config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getNextLobbyId(): Promise<number> {
    const config = await this.getConfigAccount();
    return config.lobbyCount.toNumber();
  }

  getLobbyPdaForId(lobbyId: number): PublicKey {
    const [pda] = this.getLobbyPDA(lobbyId);
    return pda;
  }

  getProgramId(): PublicKey { return this.programId; }
  getConnection(): Connection { return this.connection; }
}

/**
 * Signing client for 1v1 Lobby - can execute instructions on-chain
 */
export class Solana1v1Client {
  private connection: Connection;
  private program: anchor.Program<Domin81v1Prgm>;
  private provider: anchor.AnchorProvider;
  private authority: Keypair;
  private programId: PublicKey;

  constructor(rpcEndpoint: string, authorityPrivateKey: string) {
    this.connection = new Connection(rpcEndpoint, "confirmed");
    this.programId = new PublicKey((IDL as any).address);

    let privateKeyBytes: Uint8Array;
    const trimmed = authorityPrivateKey.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      privateKeyBytes = new Uint8Array(JSON.parse(trimmed));
    } else {
      privateKeyBytes = bs58.decode(trimmed);
      if (privateKeyBytes.length !== 64) throw new Error(`Invalid key length: ${privateKeyBytes.length}`);
    }
    this.authority = Keypair.fromSecretKey(privateKeyBytes);

    this.provider = new anchor.AnchorProvider(
      this.connection,
      new NodeWallet(this.authority),
      { commitment: "confirmed" }
    );
    this.program = new anchor.Program<Domin81v1Prgm>(IDL as any, this.provider);
  }

  private getLobbyPDA(lobbyId: number): [PublicKey, number] {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(lobbyId), 0);
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.LOBBY, idBuffer], this.programId);
  }

  private getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PDA_SEEDS_1V1.CONFIG], this.programId);
  }

  async getLobbyAccount(lobbyPda: PublicKey): Promise<any> {
    // Same raw parsing logic as query client
    const queryClient = new Solana1v1QueryClient(this.connection.rpcEndpoint);
    return queryClient.getLobbyAccount(lobbyPda);
  }

  async getConfigAccount(): Promise<any> {
    const queryClient = new Solana1v1QueryClient(this.connection.rpcEndpoint);
    return queryClient.getConfigAccount();
  }

  getLobbyPdaForId(lobbyId: number): PublicKey {
    const [pda] = this.getLobbyPDA(lobbyId);
    return pda;
  }

  getConnection(): Connection { return this.connection; }

  async settleLobby(lobbyId: number): Promise<{ txSignature: string; winner: string | null; prize: number | null }> {
    const [lobbyPda] = this.getLobbyPDA(lobbyId);
    const [configPda] = this.getConfigPDA();

    const lobbyAccount = await this.getLobbyAccount(lobbyPda);
    if (!lobbyAccount) throw new Error("Lobby not found on-chain");
    if (lobbyAccount.status !== 2) throw new Error(`Lobby status is ${lobbyAccount.status}, expected 2`);

    const playerA = new PublicKey(lobbyAccount.playerA);
    const playerB = new PublicKey(lobbyAccount.playerB);
    const config = await this.getConfigAccount();
    const treasury = new PublicKey(config.treasury?.toString() || "0");

    const accounts = [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: lobbyPda, isSigner: false, isWritable: true },
      { pubkey: playerA, isSigner: false, isWritable: true },
      { pubkey: playerB, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new anchor.web3.TransactionInstruction({
      programId: this.programId,
      keys: accounts,
      data: Buffer.from([207, 75, 50, 251, 99, 177, 195, 225]),
    });

    const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
    const messageV0 = new anchor.web3.TransactionMessage({
      payerKey: this.authority.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const txn = new anchor.web3.VersionedTransaction(messageV0);
    txn.sign([this.authority]);

    const txSignature = await this.connection.sendTransaction(txn);
    await this.connection.confirmTransaction({
      signature: txSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    // Parse winner from logs
    let winner: string | null = null;
    let prize: number | null = null;
    try {
      let txDetails = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        txDetails = await this.connection.getTransaction(txSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (txDetails?.meta?.logMessages) break;
      }
      if (txDetails?.meta?.logMessages) {
        for (const log of txDetails.meta.logMessages) {
          const match = log.match(/Winner determined: ([A-Za-z0-9]{32,44})\. Prize: (\d+)/);
          if (match?.[1] && match?.[2]) {
            winner = match[1];
            prize = parseInt(match[2], 10);
            break;
          }
        }
      }
    } catch { /* ignore log parse errors */ }

    return { txSignature, winner, prize };
  }
}
