/**
 * Presence Bot - Spawns a bot when a user views the arena
 *
 * Flow:
 * 1. User views arena → frontend calls recordArenaView mutation (in presenceBotMutations.ts)
 * 2. After 5 seconds delay, this action checks if:
 *    - Game is in WAITING status (no bets yet)
 *    - Bot hasn't already been spawned for this round
 * 3. If conditions met → place bot bet (0.003 SOL, random character, random position)
 *
 * SETUP: Create a new Solana wallet for the presence bot and add PRESENCE_BOT_PRIVATE_KEY
 * to your Convex environment variables (base58 or JSON array format).
 * Make sure to fund this wallet with some SOL for bets + transaction fees.
 */
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
import { DOMIN8_PROGRAM_ID, PDA_SEEDS } from "./lib/types";
import { GAME_STATUS } from "./constants";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
const PRESENCE_BOT_PRIVATE_KEY = process.env.PRESENCE_BOT_PRIVATE_KEY || "";

// Bot configuration
const BOT_BET_MIN_SOL = 0.001;
const BOT_BET_MAX_SOL = 0.003;

/**
 * Get random bet amount between min and max
 */
function getRandomBetAmount(): { sol: number; lamports: number } {
  const sol = BOT_BET_MIN_SOL + Math.random() * (BOT_BET_MAX_SOL - BOT_BET_MIN_SOL);
  // Round to 6 decimal places for cleaner values
  const roundedSol = Math.round(sol * 1_000_000) / 1_000_000;
  const lamports = Math.round(roundedSol * 1_000_000_000);
  return { sol: roundedSol, lamports };
}

/**
 * Parse private key from base58 or JSON array format
 * Handles various formats that might come from environment variables
 */
function parsePrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();

  try {
    // Try JSON array format first: "[1,2,3,...]" or "1,2,3,..." (without brackets)
    let numbers: number[];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // Standard JSON array format
      numbers = JSON.parse(trimmed);
    } else if (trimmed.includes(",")) {
      // Comma-separated without brackets (env vars sometimes strip brackets)
      numbers = trimmed.split(",").map((n) => parseInt(n.trim(), 10));
    } else {
      // Base58 format (standard Solana wallet export)
      const decoded = bs58.decode(trimmed);
      if (decoded.length !== 64) {
        throw new Error(`Invalid base58 key length: ${decoded.length} bytes (expected 64)`);
      }
      return Keypair.fromSecretKey(decoded);
    }

    // Validate the array
    if (!Array.isArray(numbers) || numbers.length !== 64) {
      throw new Error(`Invalid key array length: ${numbers?.length} (expected 64)`);
    }

    // Validate all numbers are in valid byte range
    for (let i = 0; i < numbers.length; i++) {
      if (isNaN(numbers[i]) || numbers[i] < 0 || numbers[i] > 255) {
        throw new Error(`Invalid byte value at index ${i}: ${numbers[i]}`);
      }
    }

    return Keypair.fromSecretKey(new Uint8Array(numbers));
  } catch (error) {
    console.error("[PresenceBot] Failed to parse private key:", error);
    console.error("[PresenceBot] Key starts with:", trimmed.substring(0, 20));
    console.error("[PresenceBot] Key length:", trimmed.length);
    throw error;
  }
}

/**
 * Get PDAs for the game accounts
 */
function getPDAs(roundId: number) {
  const [config] = PublicKey.findProgramAddressSync([PDA_SEEDS.DOMIN8_CONFIG], DOMIN8_PROGRAM_ID);

  const roundIdBuffer = Buffer.alloc(8);
  roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
  const [gameRound] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.DOMIN8_GAME, roundIdBuffer],
    DOMIN8_PROGRAM_ID
  );

  return { config, gameRound };
}

/**
 * Build bet instruction for the domin8 program
 */
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
  // Bet instruction discriminator (from Anchor IDL)
  const discriminator = Buffer.from([94, 203, 166, 126, 20, 243, 169, 82]);

  // Encode arguments
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

  // Accounts must match smart contract order:
  // 1. config - readonly
  // 2. game - writable (per-round PDA)
  // 3. active_game - writable (always points to current game)
  // 4. user - signer, writable
  // 5. system_program - readonly
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
 * Called 5 seconds after user views arena
 */
export const checkAndSpawnBot = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[PresenceBot] Checking if bot should spawn...");

    // Check if bot wallet is configured
    if (!PRESENCE_BOT_PRIVATE_KEY) {
      console.log("[PresenceBot] PRESENCE_BOT_PRIVATE_KEY not configured, skipping");
      return;
    }

    if (!RPC_ENDPOINT) {
      console.log("[PresenceBot] SOLANA_RPC_ENDPOINT not configured, skipping");
      return;
    }

    try {
      // Parse bot wallet keypair
      const botKeypair = parsePrivateKey(PRESENCE_BOT_PRIVATE_KEY);
      const botPubkey = botKeypair.publicKey;
      console.log(`[PresenceBot] Bot wallet: ${botPubkey.toBase58()}`);

      // Initialize connection
      const connection = new Connection(RPC_ENDPOINT, "confirmed");

      // Get active game PDA directly (this always points to the current game)
      const [activeGamePda] = PublicKey.findProgramAddressSync(
        [PDA_SEEDS.ACTIVE_GAME],
        DOMIN8_PROGRAM_ID
      );

      const gameAccountInfo = await connection.getAccountInfo(activeGamePda);

      if (!gameAccountInfo) {
        console.log("[PresenceBot] No active game found, triggering game creation...");
        // Trigger game creation via the scheduler
        await ctx.runAction(internal.gameScheduler.executeCreateGameRound, {});
        console.log("[PresenceBot] Game creation triggered, will retry on next arena view");
        return;
      }

      // Parse game state from active_game PDA
      // Anchor adds 8-byte discriminator at the start
      // Game layout after discriminator:
      // - game_round: u64 (8) at offset 8
      // - start_date: i64 (8) at offset 16
      // - end_date: i64 (8) at offset 24
      // - total_deposit: u64 (8) at offset 32
      // - rand: u64 (8) at offset 40
      // - map: u8 (1) at offset 48
      // - user_count: u64 (8) at offset 49
      // - force: [u8; 32] (32) at offset 57
      // - status: u8 (1) at offset 89
      const gameData = gameAccountInfo.data;
      const roundId = Number(gameData.readBigUInt64LE(8)); // game_round at offset 8
      const userCount = Number(gameData.readBigUInt64LE(49)); // user_count at offset 49
      const status = gameData.readUInt8(89); // status at offset 89

      console.log(`[PresenceBot] Game state: round=${roundId}, status=${status}, userCount=${userCount}`);

      // Only spawn if game is WAITING (status=2) with no users
      if (status !== GAME_STATUS.WAITING) {
        console.log(`[PresenceBot] Game not in WAITING status (status=${status}), skipping`);
        return;
      }

      if (userCount > 0) {
        console.log(`[PresenceBot] Game already has ${userCount} users, skipping`);
        return;
      }

      // Check if bot already spawned for this round
      const alreadySpawned = await ctx.runQuery(
        internal.presenceBotMutations.wasBotSpawnedForRound,
        { roundId }
      );

      if (alreadySpawned) {
        console.log(`[PresenceBot] Bot already spawned for round ${roundId}, skipping`);
        return;
      }

      // Mark as spawned BEFORE placing bet (prevent race conditions)
      const marked = await ctx.runMutation(internal.presenceBotMutations.markBotSpawned, {
        roundId,
      });
      if (!marked) {
        console.log(`[PresenceBot] Failed to mark bot spawned (race condition), skipping`);
        return;
      }

      // All conditions met - spawn the bot!
      console.log(`[PresenceBot] Spawning bot for round ${roundId}...`);

      // Get active characters from database
      const characterIds = await ctx.runQuery(
        internal.presenceBotMutations.getActiveCharacterIds,
        {}
      );

      if (characterIds.length === 0) {
        console.error("[PresenceBot] No active characters found in database");
        return;
      }

      // Random character from active characters
      const characterId = characterIds[Math.floor(Math.random() * characterIds.length)];

      // Random position (within typical spawn area)
      const positionX = Math.floor(Math.random() * 300) + 100; // 100-400
      const positionY = Math.floor(Math.random() * 300) + 100; // 100-400

      // Random bet amount between 0.001 and 0.003 SOL
      const betAmount = getRandomBetAmount();

      // Build bet instruction
      const { config, gameRound } = getPDAs(roundId);
      const betInstruction = buildBetInstruction(
        roundId,
        betAmount.lamports,
        characterId,
        [positionX, positionY],
        botPubkey,
        config,
        gameRound,
        activeGamePda
      );

      // Build transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = botPubkey;
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        betInstruction
      );

      // Sign and send
      transaction.sign(botKeypair);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Wait for confirmation
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      console.log(
        `[PresenceBot] Bot bet placed successfully! Round=${roundId}, Character=${characterId}, Amount=${betAmount.sol} SOL, Signature=${signature}`
      );
    } catch (error) {
      console.error("[PresenceBot] Error in checkAndSpawnBot:", error);
    }
  },
});
