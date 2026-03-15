/**
 * Presence Bot - Spawns a bot when a user views the arena
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { presenceBotSpawns, characters } from "../db/schema.js";
import { DOMIN8_PROGRAM_ID, PDA_SEEDS, GAME_STATUS } from "../lib/types.js";
import { config } from "../config.js";

const BOT_BET_MIN_SOL = 0.001;
const BOT_BET_MAX_SOL = 0.003;

function getRandomBetAmount() {
  const sol = BOT_BET_MIN_SOL + Math.random() * (BOT_BET_MAX_SOL - BOT_BET_MIN_SOL);
  const roundedSol = Math.round(sol * 1_000_000) / 1_000_000;
  const lamports = Math.round(roundedSol * 1_000_000_000);
  return { sol: roundedSol, lamports };
}

function parsePrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();
  try {
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
    } else if (trimmed.includes(",")) {
      const numbers = trimmed.split(",").map((n) => parseInt(n.trim(), 10));
      return Keypair.fromSecretKey(new Uint8Array(numbers));
    } else {
      const decoded = bs58.decode(trimmed);
      if (decoded.length !== 64) throw new Error(`Invalid key length: ${decoded.length}`);
      return Keypair.fromSecretKey(decoded);
    }
  } catch (error) {
    console.error("[PresenceBot] Failed to parse private key:", error);
    throw error;
  }
}

function getPDAs(roundId: number) {
  const [configPda] = PublicKey.findProgramAddressSync([PDA_SEEDS.DOMIN8_CONFIG], DOMIN8_PROGRAM_ID);
  const roundIdBuffer = Buffer.alloc(8);
  roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
  const [gameRound] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.DOMIN8_GAME, roundIdBuffer],
    DOMIN8_PROGRAM_ID
  );
  return { config: configPda, gameRound };
}

function buildBetInstruction(
  roundId: number,
  betAmount: number,
  skin: number,
  position: [number, number],
  userPubkey: PublicKey,
  configPda: PublicKey,
  gamePda: PublicKey,
  activeGamePda: PublicKey
): TransactionInstruction {
  const discriminator = Buffer.from([94, 203, 166, 126, 20, 243, 169, 82]);
  const roundIdBuffer = Buffer.alloc(8);
  roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(betAmount));
  const skinBuffer = Buffer.alloc(1);
  skinBuffer.writeUInt8(skin);
  const positionBuffer = Buffer.alloc(4);
  positionBuffer.writeUInt16LE(position[0], 0);
  positionBuffer.writeUInt16LE(position[1], 2);

  const data = Buffer.concat([discriminator, roundIdBuffer, amountBuffer, skinBuffer, positionBuffer]);

  return new TransactionInstruction({
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: activeGamePda, isSigner: false, isWritable: true },
      { pubkey: userPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: DOMIN8_PROGRAM_ID,
    data,
  });
}

/**
 * Check conditions and spawn bot if needed
 */
export async function checkAndSpawnBot() {
  console.log("[PresenceBot] Checking if bot should spawn...");

  if (!config.presenceBotEnabled) {
    console.log("[PresenceBot] Disabled, skipping");
    return;
  }

  if (!config.presenceBotPrivateKey) {
    console.log("[PresenceBot] Private key not configured, skipping");
    return;
  }

  try {
    const botKeypair = parsePrivateKey(config.presenceBotPrivateKey);
    const botPubkey = botKeypair.publicKey;
    const connection = new Connection(config.solanaRpcEndpoint, "confirmed");

    const [activeGamePda] = PublicKey.findProgramAddressSync(
      [PDA_SEEDS.ACTIVE_GAME],
      DOMIN8_PROGRAM_ID
    );

    const gameAccountInfo = await connection.getAccountInfo(activeGamePda);
    if (!gameAccountInfo) {
      console.log("[PresenceBot] No active game found");
      return;
    }

    const gameData = gameAccountInfo.data;
    const roundId = Number(gameData.readBigUInt64LE(8));
    const userCount = Number(gameData.readBigUInt64LE(49));
    const status = gameData.readUInt8(89);

    if (status !== GAME_STATUS.WAITING) {
      console.log(`[PresenceBot] Game not WAITING (status=${status}), skipping`);
      return;
    }

    if (userCount > 0) {
      console.log(`[PresenceBot] Game has ${userCount} users, skipping`);
      return;
    }

    // Check if already spawned
    const [alreadySpawned] = await db
      .select()
      .from(presenceBotSpawns)
      .where(eq(presenceBotSpawns.roundId, roundId))
      .limit(1);

    if (alreadySpawned) {
      console.log(`[PresenceBot] Already spawned for round ${roundId}`);
      return;
    }

    // Mark as spawned
    try {
      await db.insert(presenceBotSpawns).values({
        roundId,
        spawnedAt: Math.floor(Date.now() / 1000),
      });
    } catch {
      console.log("[PresenceBot] Race condition on spawn mark, skipping");
      return;
    }

    // Get active characters
    const activeChars = await db
      .select()
      .from(characters)
      .where(eq(characters.isActive, true));

    if (activeChars.length === 0) {
      console.error("[PresenceBot] No active characters found");
      return;
    }

    const characterId = activeChars[Math.floor(Math.random() * activeChars.length)].characterId;
    const positionX = Math.floor(Math.random() * 300) + 100;
    const positionY = Math.floor(Math.random() * 300) + 100;
    const betAmount = getRandomBetAmount();

    const { config: configPda, gameRound } = getPDAs(roundId);
    const betInstruction = buildBetInstruction(
      roundId,
      betAmount.lamports,
      characterId,
      [positionX, positionY],
      botPubkey,
      configPda,
      gameRound,
      activeGamePda
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = botPubkey;
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      betInstruction
    );

    transaction.sign(botKeypair);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    console.log(
      `[PresenceBot] Bot bet placed! Round=${roundId}, Character=${characterId}, Amount=${betAmount.sol} SOL, Tx=${signature}`
    );
  } catch (error) {
    console.error("[PresenceBot] Error:", error);
  }
}
