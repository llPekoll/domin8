// Solana integration layer for the crank service
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionMessage,
} from "@solana/web3.js";
import { GameConfig, GameRound, DOMIN8_PROGRAM_ID, PDA_SEEDS, BetInfoStruct } from "./types.js";
import { Buffer } from "buffer";
import bs58 from "bs58";

// Import the IDL
import IDL from "./idl/domin8_prgm.json";
type Domin8Prgm = any;

// Simple NodeWallet implementation for server-side use
class NodeWallet implements anchor.Wallet {
  constructor(readonly payer: Keypair) {}

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
    } else {
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

export class SolanaClient {
  private connection: Connection;
  private program: anchor.Program<Domin8Prgm>;
  private provider: anchor.AnchorProvider;
  private authority: Keypair;

  constructor(rpcEndpoint: string, authorityPrivateKey: string) {
    this.connection = new Connection(rpcEndpoint, "confirmed");

    let privateKeyBytes: Uint8Array;
    try {
      const trimmed = authorityPrivateKey.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        privateKeyBytes = new Uint8Array(JSON.parse(trimmed));
      } else {
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

    this.provider = new anchor.AnchorProvider(this.connection, new NodeWallet(this.authority), {
      commitment: "confirmed",
    });

    this.program = new anchor.Program<Domin8Prgm>(IDL as any, this.provider);
  }

  private getPDAs(roundId?: number) {
    const [config] = PublicKey.findProgramAddressSync([PDA_SEEDS.DOMIN8_CONFIG], DOMIN8_PROGRAM_ID);
    const [activeGame] = PublicKey.findProgramAddressSync([PDA_SEEDS.ACTIVE_GAME], DOMIN8_PROGRAM_ID);

    let gameRound: PublicKey | undefined;
    if (roundId !== undefined) {
      const roundIdBuffer = Buffer.alloc(8);
      roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
      [gameRound] = PublicKey.findProgramAddressSync(
        [PDA_SEEDS.DOMIN8_GAME, roundIdBuffer],
        DOMIN8_PROGRAM_ID
      );
    }

    return { config, activeGame, gameRound };
  }

  async getCurrentRoundId(): Promise<number> {
    const { config } = this.getPDAs();
    try {
      const account = await this.program.account.domin8Config.fetchNullable(config);
      if (!account) return 0;
      return account.gameRound?.toNumber() ?? 0;
    } catch (error) {
      console.error("Error fetching config:", error);
      return 0;
    }
  }

  async getGameConfig(): Promise<GameConfig | null> {
    const { config } = this.getPDAs();
    try {
      const account = await this.program.account.domin8Config.fetchNullable(config);
      if (!account) return null;
      return {
        admin: account.admin?.toBase58() ?? "",
        treasury: account.treasury?.toBase58() ?? "",
        gameRound: account.gameRound?.toNumber() ?? 0,
        houseFee: account.houseFee?.toNumber() ?? 0,
        minDepositAmount: account.minDepositAmount?.toNumber() ?? 0,
        maxDepositAmount: account.maxDepositAmount?.toNumber() ?? 0,
        roundTime: account.roundTime?.toNumber() ?? 0,
        lock: account.lock ?? false,
        force: Array.from(account.force || []),
      };
    } catch (error) {
      console.error("Error fetching game config:", error);
      return null;
    }
  }

  async getGameRound(roundId?: number): Promise<GameRound | null> {
    const currentRoundId = roundId ?? (await this.getCurrentRoundId());
    const { gameRound } = this.getPDAs(currentRoundId);

    if (!gameRound) throw new Error("Failed to derive game round PDA");

    try {
      const account = await this.program.account.domin8Game.fetchNullable(gameRound);
      if (!account) {
        if (currentRoundId > 0) return this.getGameRound(currentRoundId - 1);
        return null;
      }

      const bets: BetInfoStruct[] = (account.bets || []).map((bet: any) => ({
        walletIndex: bet.walletIndex,
        amount: bet.amount?.toNumber() ?? 0,
        skin: bet.skin,
        position: [bet.position[0], bet.position[1]] as [number, number],
      }));

      return {
        gameRound: account.gameRound?.toNumber() ?? 0,
        startDate: account.startDate?.toNumber() ?? 0,
        endDate: account.endDate?.toNumber() ?? 0,
        totalDeposit: account.totalDeposit?.toNumber() ?? 0,
        rand: account.rand?.toString() ?? "0",
        map: account.map ?? 0,
        userCount: account.userCount?.toNumber() ?? 0,
        force: Array.from(account.force || []),
        status: account.status ?? 0,
        winner: account.winner ? account.winner.toBase58() : null,
        winnerPrize: account.winnerPrize?.toNumber() ?? 0,
        winningBetIndex: account.winningBetIndex ? account.winningBetIndex.toNumber() : null,
        wallets: (account.wallets || []).map((w: any) => w.toBase58()),
        bets,
        roundId: account.gameRound?.toNumber() ?? 0,
        startTimestamp: account.startDate?.toNumber() ?? 0,
        endTimestamp: account.endDate?.toNumber() ?? 0,
        totalPot: account.totalDeposit?.toNumber() ?? 0,
        betCount: bets.length,
        betAmounts: bets.map((b) => b.amount),
        betSkin: bets.map((b) => b.skin),
        betPosition: bets.map((b) => b.position),
        betWalletIndex: bets.map((b) => b.walletIndex),
      };
    } catch (error) {
      console.log("No game round exists yet for round", currentRoundId);
      return null;
    }
  }

  async getActiveGame(): Promise<GameRound | null> {
    const { activeGame } = this.getPDAs();
    try {
      const account = await this.program.account.domin8Game.fetchNullable(activeGame);
      if (!account) return null;

      const bets: BetInfoStruct[] = (account.bets || []).map((bet: any) => ({
        walletIndex: bet.walletIndex,
        amount: bet.amount?.toNumber() ?? 0,
        skin: bet.skin,
        position: [bet.position[0], bet.position[1]] as [number, number],
      }));

      return {
        gameRound: account.gameRound?.toNumber() ?? 0,
        startDate: account.startDate?.toNumber() ?? 0,
        endDate: account.endDate?.toNumber() ?? 0,
        totalDeposit: account.totalDeposit?.toNumber() ?? 0,
        rand: account.rand?.toString() ?? "0",
        map: account.map ?? 0,
        userCount: account.userCount?.toNumber() ?? 0,
        force: Array.from(account.force || []),
        status: account.status ?? 0,
        winner: account.winner ? account.winner.toBase58() : null,
        winnerPrize: account.winnerPrize?.toNumber() ?? 0,
        winningBetIndex: account.winningBetIndex ? account.winningBetIndex.toNumber() : null,
        wallets: (account.wallets || []).map((w: any) => w.toBase58()),
        bets,
        roundId: account.gameRound?.toNumber() ?? 0,
        startTimestamp: account.startDate?.toNumber() ?? 0,
        endTimestamp: account.endDate?.toNumber() ?? 0,
        totalPot: account.totalDeposit?.toNumber() ?? 0,
        betCount: bets.length,
        betAmounts: bets.map((b) => b.amount),
        betSkin: bets.map((b) => b.skin),
        betPosition: bets.map((b) => b.position),
        betWalletIndex: bets.map((b) => b.walletIndex),
      };
    } catch (error) {
      console.log("Error fetching active game:", error);
      return null;
    }
  }

  getActiveGamePDA(): PublicKey {
    const { activeGame } = this.getPDAs();
    return activeGame;
  }

  async getCurrentSlot(): Promise<number> {
    return await this.connection.getSlot("confirmed");
  }

  async endGame(roundId: number): Promise<{ signature: string }> {
    const { config } = this.getPDAs();
    const { gameRound } = this.getPDAs(roundId);
    if (!gameRound) throw new Error("Failed to derive game round PDA");

    const configAccount = await this.program.account.domin8Config.fetch(config);

    const instruction = await this.program.methods
      .endGame(new anchor.BN(roundId))
      .accounts({
        config,
        game: gameRound,
        admin: this.authority.publicKey,
        treasury: configAccount.treasury,
        oracleQueue: new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"),
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .instruction();

    const signature = await this.sendOptimizedTransaction(instruction);
    console.log(`Game ${roundId} ended successfully: ${signature}`);
    return { signature };
  }

  async sendPrizeWinner(roundId: number): Promise<{ signature: string }> {
    const { config, gameRound } = this.getPDAs(roundId);
    if (!gameRound) throw new Error("Failed to derive game round PDA");

    const gameAccount = await this.program.account.domin8Game.fetch(gameRound);
    if (!gameAccount.winner) throw new Error("No winner determined yet");

    const instruction = await this.program.methods
      .sendPrizeWinner(new anchor.BN(roundId))
      .accounts({
        config,
        game: gameRound,
        claimer: this.authority.publicKey,
        winner: gameAccount.winner,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .instruction();

    const signature = await this.sendOptimizedTransaction(instruction);
    console.log(`Prize sent successfully for round ${roundId}: ${signature}`);
    return { signature };
  }

  async deleteGame(roundId: number): Promise<string> {
    const { config, gameRound } = this.getPDAs(roundId);
    if (!gameRound) throw new Error("Failed to derive game round PDA");

    const instruction = await this.program.methods
      .deleteGame(new anchor.BN(roundId))
      .accounts({
        config,
        game: gameRound,
        admin: this.authority.publicKey,
      } as any)
      .instruction();

    const signature = await this.sendOptimizedTransaction(instruction);
    return signature;
  }

  async createGameRound(roundId: number, mapId: number): Promise<{ signature: string }> {
    const { config, activeGame, gameRound } = this.getPDAs(roundId);
    if (!gameRound) throw new Error("Failed to derive game round PDA");

    const instruction = await this.program.methods
      .createGameRound(new anchor.BN(roundId), mapId)
      .accounts({
        config,
        game: gameRound,
        activeGame,
        user: this.authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .instruction();

    const signature = await this.sendOptimizedTransaction(instruction);
    console.log(`Game round ${roundId} created: ${signature}`);
    return { signature };
  }

  async confirmTransaction(signature: string, maxRetries: number = 3): Promise<boolean> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const result = await this.connection.confirmTransaction(signature, "confirmed");
        if (result.value.err) return false;
        return true;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) return false;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return false;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string; slot?: number }> {
    try {
      const slot = await this.getCurrentSlot();
      const balance = await this.connection.getBalance(this.authority.publicKey);
      if (balance < 10_000_000) {
        return { healthy: false, message: `Authority balance too low: ${balance / 1e9} SOL`, slot };
      }
      const { config } = this.getPDAs();
      await this.program.account.domin8Config.fetch(config);
      return { healthy: true, message: "All systems healthy", slot };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async getPriorityFeeEstimate(
    instruction: anchor.web3.TransactionInstruction,
    payer: PublicKey
  ): Promise<number> {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
      const tempMessage = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();
      const tempTx = new VersionedTransaction(tempMessage);
      const serializedTx = bs58.encode(tempTx.serialize());

      const response = await fetch(this.connection.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "getPriorityFeeEstimate",
          params: [{ transaction: serializedTx, options: { recommended: true } }],
        }),
      });

      const data = await response.json();
      if (data.result?.priorityFeeEstimate) {
        return Math.ceil(data.result.priorityFeeEstimate * 1.2);
      }
      return 50_000;
    } catch {
      return 50_000;
    }
  }

  private async simulateAndOptimizeComputeUnits(
    instruction: anchor.web3.TransactionInstruction,
    payer: PublicKey,
    blockhash: string
  ): Promise<number> {
    try {
      const testInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        instruction,
      ];
      const testMessage = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: testInstructions,
      }).compileToV0Message();
      const testTransaction = new VersionedTransaction(testMessage);

      const simulation = await this.connection.simulateTransaction(testTransaction, {
        replaceRecentBlockhash: true,
        sigVerify: false,
      });

      if (simulation.value.err || !simulation.value.unitsConsumed) return 200_000;
      return simulation.value.unitsConsumed < 1000
        ? 1000
        : Math.ceil(simulation.value.unitsConsumed * 1.1);
    } catch {
      return 200_000;
    }
  }

  private async sendOptimizedTransaction(
    instruction: anchor.web3.TransactionInstruction,
    extraSigners: Keypair[] = []
  ): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const computeUnits = await this.simulateAndOptimizeComputeUnits(
      instruction,
      this.authority.publicKey,
      blockhash
    );
    const priorityFee = await this.getPriorityFeeEstimate(instruction, this.authority.publicKey);

    const finalInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      instruction,
    ];

    const finalMessage = new TransactionMessage({
      payerKey: this.authority.publicKey,
      recentBlockhash: blockhash,
      instructions: finalInstructions,
    }).compileToV0Message();

    const finalTransaction = new VersionedTransaction(finalMessage);
    finalTransaction.sign([this.authority, ...extraSigners]);

    let signature: string | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentBlockHeight = await this.connection.getBlockHeight("confirmed");
        if (currentBlockHeight > lastValidBlockHeight) {
          throw new Error("Blockhash expired");
        }

        signature = await this.connection.sendRawTransaction(finalTransaction.serialize(), {
          skipPreflight: true,
          maxRetries: 0,
        });

        const confirmed = await this.confirmTransactionWithPolling(signature, lastValidBlockHeight);
        if (confirmed) break;
      } catch (error: any) {
        if (attempt === maxRetries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    if (!signature) throw new Error("All retry attempts failed");
    return signature;
  }

  private async confirmTransactionWithPolling(
    signature: string,
    lastValidBlockHeight: number
  ): Promise<boolean> {
    const timeout = 30000;
    const interval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const statuses = await this.connection.getSignatureStatuses([signature]);
        const status = statuses?.value?.[0];
        if (status) {
          if (status.err) return false;
          if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
            return true;
          }
        }
        const currentBlockHeight = await this.connection.getBlockHeight("confirmed");
        if (currentBlockHeight > lastValidBlockHeight) return false;
      } catch {
        // ignore
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return false;
  }
}
