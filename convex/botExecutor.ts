/**
 * Bot Executor - Automated Betting System
 *
 * This module handles automated bet placement for users who have purchased and activated bots.
 * Uses Privy session signers to sign transactions on behalf of users.
 *
 * Runs as a cron job every 30 seconds to check for:
 * 1. Active bots with session signers enabled
 * 2. Open betting windows (game status = OPEN)
 * 3. Budget limits and strategy conditions
 */
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import type { Doc } from "./_generated/dataModel";
import { PrivyClient } from "@privy-io/server-auth";
import { DOMIN8_PROGRAM_ID } from "./lib/types";

const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT;
const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_BOT_SIGNER_ID = process.env.PRIVY_BOT_SIGNER_ID;
const PRIVY_BOT_AUTH_PRIVATE_KEY = process.env.PRIVY_BOT_AUTH_PRIVATE_KEY;

// Program constants
const PDA_SEEDS = {
  DOMIN8_CONFIG: Buffer.from("domin8_config"),
  DOMIN8_GAME: Buffer.from("domin8_game"),
  ACTIVE_GAME: Buffer.from("active_game"),
};

// Game status constants
const GAME_STATUS = {
  WAITING: 2,
  OPEN: 0,
  CLOSED: 1,
};

// Lamports per SOL
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Extract base64 content from PEM format private key
 * Privy SDK expects raw base64-encoded DER content, not full PEM format
 */
function extractBase64FromPEM(pem: string): string {
  // Handle escaped newlines (from environment variables)
  let normalizedPem = pem.replace(/\\n/g, "\n");

  // Remove PEM headers and footers
  const lines = normalizedPem.split("\n");
  const base64Lines = lines.filter((line) => !line.startsWith("-----") && line.trim().length > 0);

  // Join all base64 lines into a single string
  return base64Lines.join("");
}

// Initialize Privy client for server-side signing
function getPrivyClient(): PrivyClient | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    console.warn("[BotExecutor] Privy credentials not configured");
    return null;
  }

  // Handle private key format - extract base64 from PEM
  let privateKey: string | undefined;
  if (PRIVY_BOT_AUTH_PRIVATE_KEY) {
    privateKey = extractBase64FromPEM(PRIVY_BOT_AUTH_PRIVATE_KEY);
    console.log(
      `[BotExecutor] Private key extracted: ${privateKey.slice(0, 20)}...${privateKey.slice(-10)}`
    );
  }

  return new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET, {
    walletApi: {
      authorizationPrivateKey: privateKey,
    },
  });
}

/**
 * Build a bet instruction for the domin8 program
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
  // This is the 8-byte discriminator for the "bet" instruction
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

  const data = Buffer.concat([
    discriminator,
    roundIdBuffer,
    amountBuffer,
    skinBuffer,
    positionBuffer,
  ]);

  // Account order must match smart contract: config, game, activeGame, user, systemProgram
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
 * Place a bet on behalf of a user using Privy session signer
 */
async function placeBotBet(
  privy: PrivyClient,
  connection: Connection,
  walletAddress: string,
  roundId: number,
  betAmount: number,
  skin: number,
  position: [number, number]
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const userPubkey = new PublicKey(walletAddress);
    const { config, activeGame, gameRound } = getPDAs(roundId);

    if (!gameRound) {
      return { success: false, error: "Failed to derive game PDA" };
    }

    console.log(`[BotExecutor] PDAs for round ${roundId}:`, {
      config: config.toBase58(),
      activeGame: activeGame.toBase58(),
      gameRound: gameRound.toBase58(),
    });

    // CRITICAL: Verify the round-specific game account exists before trying to bet
    // This prevents "AccountNotInitialized" error when active_game has stale data
    // (e.g., after a game was deleted but before a new one was created)
    const gameAccountInfo = await connection.getAccountInfo(gameRound);
    if (!gameAccountInfo) {
      console.log(`[BotExecutor] Game round ${roundId} PDA does not exist (may have been deleted)`);
      return { success: false, error: `Game round ${roundId} account not found - game may have ended` };
    }
    console.log(`[BotExecutor] Game round ${roundId} account exists, size: ${gameAccountInfo.data.length} bytes`);

    // Build the bet instruction (must include activeGame PDA)
    const betInstruction = buildBetInstruction(
      roundId,
      betAmount,
      skin,
      position,
      userPubkey,
      config,
      gameRound,
      activeGame
    );

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    // Build legacy transaction (better compatibility with Privy SDK)
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPubkey;
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      betInstruction
    );

    // Look up user by wallet address
    const user = await privy.getUserByWalletAddress(walletAddress);
    if (!user) {
      return { success: false, error: "User not found in Privy" };
    }

    // Find the user's embedded Solana wallet
    const embeddedWallet = user.linkedAccounts.find(
      (account) =>
        account.type === "wallet" &&
        account.walletClientType === "privy" &&
        account.chainType === "solana"
    );

    if (!embeddedWallet || embeddedWallet.type !== "wallet") {
      console.log(
        `[BotExecutor] Available accounts for ${walletAddress}:`,
        user.linkedAccounts.map((a) => ({
          type: a.type,
          chainType: "chainType" in a ? a.chainType : undefined,
        }))
      );
      return { success: false, error: "No embedded Solana wallet found" };
    }

    console.log(`[BotExecutor] Found embedded wallet:`, {
      address: embeddedWallet.address,
      id: embeddedWallet.id,
      delegated: embeddedWallet.delegated,
    });

    console.log(
      `[BotExecutor] Using wallet: ${embeddedWallet.id ? `id=${embeddedWallet.id}` : `address=${embeddedWallet.address}`}`
    );

    // Get the transaction message that needs to be signed
    const messageToSign = transaction.serializeMessage();
    console.log(`[BotExecutor] Message to sign, length: ${messageToSign.length}`);

    // Use signMessage to sign the raw transaction message bytes
    // Privy's signMessage uses ed25519 for Solana wallets
    const signResult = await privy.walletApi.rpc({
      walletId: embeddedWallet.id!,
      method: "signMessage",
      params: {
        message: messageToSign,
      },
    } as any);

    console.log(`[BotExecutor] Sign result:`, JSON.stringify(signResult));

    // Extract signature from response
    const signatureBytes = (signResult as any)?.data?.signature;
    if (!signatureBytes) {
      return { success: false, error: `No signature in response: ${JSON.stringify(signResult)}` };
    }

    // Convert signature to Buffer if needed
    const sigBuffer =
      signatureBytes instanceof Uint8Array
        ? Buffer.from(signatureBytes)
        : Buffer.from(signatureBytes);

    console.log(`[BotExecutor] Got signature, length: ${sigBuffer.length}`);

    // Add signature to transaction
    transaction.addSignature(userPubkey, sigBuffer);

    console.log(`[BotExecutor] Broadcasting signed transaction...`);

    // Broadcast using our Helius RPC
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log(`[BotExecutor] Transaction sent: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    console.log(`[BotExecutor] Bet placed successfully: ${signature}`);
    return { success: true, signature };
  } catch (error) {
    console.error("[BotExecutor] Error placing bet:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Bot tier configurations
const TIER_CONFIGS = {
  rookie: {
    canUseRange: false,
    canUseStopLoss: false,
    canUseMartingale: false,
    canUseSchedule: false,
    canRotateCharacters: false,
    maxBetMultiplier: 1,
  },
  pro: {
    canUseRange: true,
    canUseStopLoss: true,
    canUseMartingale: false,
    canUseSchedule: false,
    canRotateCharacters: true,
    maxBetMultiplier: 2,
  },
  elite: {
    canUseRange: true,
    canUseStopLoss: true,
    canUseMartingale: true,
    canUseSchedule: true,
    canRotateCharacters: true,
    maxBetMultiplier: 5,
  },
};

type BotConfig = Doc<"botConfigurations">;

/**
 * Get PDAs for the game accounts
 */
function getPDAs(roundId?: number) {
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

/**
 * Calculate bet amount based on bot configuration and strategy
 * @param config - Bot configuration
 * @param minDeposit - Minimum deposit from blockchain config (lamports)
 * @param maxDeposit - Maximum deposit from blockchain config (lamports)
 */
function calculateBetAmount(
  config: BotConfig,
  minDeposit: number,
  maxDeposit: number
): number {
  const tierConfig = TIER_CONFIGS[config.tier as keyof typeof TIER_CONFIGS];

  // fixedBetAmount is stored in LAMPORTS in the database
  // Default to minimum deposit if not set
  let betAmount = config.fixedBetAmount || minDeposit;

  // Pro/Elite: Use bet range (betMin/betMax are also in lamports)
  if (tierConfig.canUseRange && config.betMin && config.betMax) {
    const min = config.betMin;
    const max = config.betMax;
    betAmount = min + Math.random() * (max - min);
  }

  // Elite: Martingale strategy (double after loss)
  if (tierConfig.canUseMartingale && config.martingaleEnabled) {
    const consecutiveLosses = config.consecutiveLosses || 0;
    if (consecutiveLosses > 0) {
      betAmount = betAmount * Math.pow(2, Math.min(consecutiveLosses, 4)); // Cap at 16x
    }
  }

  // Elite: Anti-Martingale strategy (double after win)
  if (tierConfig.canUseMartingale && config.antiMartingaleEnabled) {
    const consecutiveWins = config.consecutiveWins || 0;
    if (consecutiveWins > 0) {
      betAmount = betAmount * Math.pow(2, Math.min(consecutiveWins, 3)); // Cap at 8x
    }
  }

  // Pro+: Win streak multiplier
  if (config.winStreakMultiplier && (config.consecutiveWins || 0) > 0) {
    betAmount = betAmount * config.winStreakMultiplier;
  }

  // CRITICAL: Clamp bet amount to blockchain config limits
  // This prevents "ExcessiveBet" and "InsufficientBet" errors
  betAmount = Math.max(minDeposit, Math.min(maxDeposit, betAmount));

  console.log(`[BotExecutor] Calculated bet: ${betAmount / LAMPORTS_PER_SOL} SOL (min: ${minDeposit / LAMPORTS_PER_SOL}, max: ${maxDeposit / LAMPORTS_PER_SOL})`);

  return Math.floor(betAmount);
}

/**
 * Select character for bet based on bot configuration
 */
function selectCharacter(config: BotConfig): number {
  const tierConfig = TIER_CONFIGS[config.tier as keyof typeof TIER_CONFIGS];

  // Character rotation for Pro/Elite
  if (
    tierConfig.canRotateCharacters &&
    config.characterRotation &&
    config.characterRotation.length > 0
  ) {
    const totalBets = config.totalBets || 0;
    const index = totalBets % config.characterRotation.length;
    return config.characterRotation[index];
  }

  // Default to selected character
  return config.selectedCharacter || 1;
}

/**
 * Generate spawn position for bot bet
 */
function generateSpawnPosition(): [number, number] {
  const now = Date.now();
  const angle = ((now % 1000) / 1000) * Math.PI * 2;
  const radius = 200;
  const spawnX = Math.floor(512 + Math.cos(angle) * radius);
  const spawnY = Math.floor(384 + Math.sin(angle) * radius);
  return [spawnX, spawnY];
}

/**
 * Check if bot should place bet based on conditions
 */
function shouldPlaceBet(
  config: BotConfig,
  currentTimestamp: number
): { canBet: boolean; reason?: string } {
  const tierConfig = TIER_CONFIGS[config.tier as keyof typeof TIER_CONFIGS];

  // Check budget limit
  const currentSpent = config.currentSpent || 0;
  const budgetLimit = (config.budgetLimit || 0) * LAMPORTS_PER_SOL;
  if (budgetLimit > 0 && currentSpent >= budgetLimit) {
    return { canBet: false, reason: "Budget limit reached" };
  }

  // Check stop-loss (Pro+)
  if (tierConfig.canUseStopLoss && config.stopLoss) {
    const totalProfit = config.totalProfit || 0;
    const stopLossLamports = config.stopLoss * LAMPORTS_PER_SOL;
    if (totalProfit < -stopLossLamports) {
      return { canBet: false, reason: "Stop-loss triggered" };
    }
  }

  // Check take-profit (Elite)
  if (config.tier === "elite" && config.takeProfit) {
    const totalProfit = config.totalProfit || 0;
    const takeProfitLamports = config.takeProfit * LAMPORTS_PER_SOL;
    if (totalProfit >= takeProfitLamports) {
      return { canBet: false, reason: "Take-profit reached" };
    }
  }

  // Check schedule (Elite)
  if (
    tierConfig.canUseSchedule &&
    config.scheduleStart !== undefined &&
    config.scheduleEnd !== undefined
  ) {
    const currentHour = new Date(currentTimestamp * 1000).getUTCHours();
    if (config.scheduleStart <= config.scheduleEnd) {
      // Normal range (e.g., 9-17)
      if (currentHour < config.scheduleStart || currentHour >= config.scheduleEnd) {
        return { canBet: false, reason: "Outside scheduled hours" };
      }
    } else {
      // Overnight range (e.g., 22-6)
      if (currentHour < config.scheduleStart && currentHour >= config.scheduleEnd) {
        return { canBet: false, reason: "Outside scheduled hours" };
      }
    }
  }

  // Check cooldown (Pro+)
  if (config.cooldownRounds && config.cooldownRounds > 0) {
    const skipped = config.roundsSkipped || 0;
    if (skipped < config.cooldownRounds) {
      return { canBet: false, reason: `Cooldown: ${skipped}/${config.cooldownRounds}` };
    }
  }

  return { canBet: true };
}

/**
 * Main bot executor action - runs every 30 seconds
 */
export const executeBots = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    success: boolean;
    botsProcessed?: number;
    totalBots?: number;
    reason?: string;
    results?: Array<{ wallet: string; success: boolean; reason?: string }>;
    error?: string;
  }> => {
    console.log("\n[BotExecutor] Starting bot execution cycle...");

    try {
      // 1. Get all active bots
      const activeBots: BotConfig[] | null = await ctx.runQuery(
        internal.botConfigurations.getActiveBots,
        {}
      );

      if (!activeBots || activeBots.length === 0) {
        console.log("[BotExecutor] No active bots found");
        return { success: true, botsProcessed: 0 };
      }

      console.log(`[BotExecutor] Found ${activeBots.length} active bots`);

      // 2. Fetch game state directly from blockchain
      console.log(`[BotExecutor] Using RPC endpoint: ${RPC_ENDPOINT!.slice(0, 50)}...`);
      const connection = new Connection(RPC_ENDPOINT!, "confirmed");
      const { SolanaClient } = await import("./lib/solana");
      const CRANK_KEY = process.env.CRANK_AUTHORITY_PRIVATE_KEY || "";
      const solanaClient = new SolanaClient(RPC_ENDPOINT!, CRANK_KEY);

      const activeGame = await solanaClient.getActiveGame();
      const gameConfig = await solanaClient.getGameConfig();

      if (!activeGame) {
        console.log("[BotExecutor] No active game on blockchain");
        return { success: true, botsProcessed: 0, reason: "No active game" };
      }

      if (!gameConfig) {
        console.log("[BotExecutor] Could not fetch game config");
        return { success: true, botsProcessed: 0, reason: "No game config" };
      }

      console.log(`[BotExecutor] Game config:`, {
        minDeposit: gameConfig.minDepositAmount / LAMPORTS_PER_SOL,
        maxDeposit: gameConfig.maxDepositAmount / LAMPORTS_PER_SOL,
      });

      console.log(`[BotExecutor] Found game ${activeGame.gameRound} on blockchain:`, {
        status: activeGame.status,
        betCount: activeGame.bets?.length || 0,
        endDate: activeGame.endDate,
      });

      // Check if betting is open (status 0 = OPEN)
      if (activeGame.status !== GAME_STATUS.OPEN) {
        console.log(`[BotExecutor] Game not open for betting (status: ${activeGame.status})`);
        return { success: true, botsProcessed: 0, reason: "Game not open" };
      }

      // Check time remaining
      const currentTime = Math.floor(Date.now() / 1000);
      const endTimestamp = activeGame.endDate || 0;

      // Validate endTimestamp is reasonable (not 0)
      if (endTimestamp === 0) {
        console.log(
          `[BotExecutor] Game ${activeGame.gameRound} has no endTimestamp set yet (waiting for first bet)`
        );
        return { success: true, botsProcessed: 0, reason: "No endTimestamp" };
      }

      const timeRemaining = endTimestamp - currentTime;

      // Need at least 10 seconds to process bot bets safely
      if (timeRemaining <= 10) {
        console.log(`[BotExecutor] Not enough time remaining (${timeRemaining}s, need >10s)`);
        return { success: true, botsProcessed: 0, reason: "Not enough time" };
      }

      console.log(
        `[BotExecutor] Game ${activeGame.gameRound} is open, ${timeRemaining}s remaining`
      );

      // Use activeGame data for the rest
      const gameState = {
        roundId: activeGame.gameRound,
        status: activeGame.status,
        endTimestamp: activeGame.endDate,
      };

      // 3. Process each active bot
      let botsProcessed = 0;
      const results: Array<{ wallet: string; success: boolean; reason?: string }> = [];

      for (const bot of activeBots) {
        try {
          // Check if bot should place bet
          const { canBet, reason } = shouldPlaceBet(bot, currentTime);

          if (!canBet) {
            console.log(`[BotExecutor] Bot ${bot.walletAddress.slice(0, 8)}... skipped: ${reason}`);

            // Increment skipped rounds for cooldown tracking
            if (reason?.includes("Cooldown")) {
              await ctx.runMutation(internal.botConfigurations.incrementSkippedRounds, {
                walletAddress: bot.walletAddress,
              });
            }

            results.push({ wallet: bot.walletAddress, success: false, reason });
            continue;
          }

          // Check if bot has already bet this round
          const existingBet = await ctx.runQuery(internal.botConfigurations.hasBotBetThisRound, {
            walletAddress: bot.walletAddress,
            roundId: gameState.roundId,
          });

          if (existingBet) {
            console.log(
              `[BotExecutor] Bot ${bot.walletAddress.slice(0, 8)}... already bet this round`
            );
            results.push({
              wallet: bot.walletAddress,
              success: false,
              reason: "Already bet this round",
            });
            continue;
          }

          // Check wallet balance first
          const walletPubkey = new PublicKey(bot.walletAddress);
          const walletBalance = await connection.getBalance(walletPubkey);
          const minBalanceForRent = 5000; // Keep some lamports for rent
          const availableBalance = Math.max(0, walletBalance - minBalanceForRent);

          console.log(`[BotExecutor] Wallet balance: ${walletBalance / LAMPORTS_PER_SOL} SOL (available: ${availableBalance / LAMPORTS_PER_SOL} SOL)`);

          if (availableBalance < gameConfig.minDepositAmount) {
            console.log(`[BotExecutor] Insufficient balance: ${availableBalance / LAMPORTS_PER_SOL} SOL < ${gameConfig.minDepositAmount / LAMPORTS_PER_SOL} SOL min`);
            results.push({
              wallet: bot.walletAddress,
              success: false,
              reason: `Insufficient balance: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
            });
            continue;
          }

          // Calculate bet amount (clamped to blockchain config limits AND wallet balance)
          let betAmountLamports = calculateBetAmount(
            bot,
            gameConfig.minDepositAmount,
            gameConfig.maxDepositAmount
          );

          // Further cap by available balance
          if (betAmountLamports > availableBalance) {
            console.log(`[BotExecutor] Capping bet from ${betAmountLamports / LAMPORTS_PER_SOL} SOL to ${availableBalance / LAMPORTS_PER_SOL} SOL (wallet balance)`);
            betAmountLamports = availableBalance;
          }

          const character = selectCharacter(bot);
          const position = generateSpawnPosition();

          console.log(`[BotExecutor] Bot ${bot.walletAddress.slice(0, 8)}... placing bet:`, {
            amount: betAmountLamports / LAMPORTS_PER_SOL,
            character,
            position,
          });

          // Initialize Privy client
          const privy = getPrivyClient();
          if (!privy) {
            console.error(
              `[BotExecutor] Privy client not configured, skipping bot ${bot.walletAddress.slice(0, 8)}`
            );
            results.push({
              wallet: bot.walletAddress,
              success: false,
              reason: "Privy not configured",
            });
            continue;
          }

          // Place the actual bet via Privy session signer
          const betResult = await placeBotBet(
            privy,
            connection,
            bot.walletAddress,
            gameState.roundId,
            betAmountLamports,
            character,
            position
          );

          if (!betResult.success) {
            console.error(
              `[BotExecutor] Failed to place bet for ${bot.walletAddress.slice(0, 8)}: ${betResult.error}`
            );
            results.push({ wallet: bot.walletAddress, success: false, reason: betResult.error });
            continue;
          }

          // Record bot bet in database (for tracking)
          await ctx.runMutation(internal.botConfigurations.recordBotBet, {
            walletAddress: bot.walletAddress,
            roundId: gameState.roundId,
            betAmount: betAmountLamports,
            character,
            position: position,
          });

          // Reset skipped rounds after successful bet
          await ctx.runMutation(internal.botConfigurations.resetSkippedRounds, {
            walletAddress: bot.walletAddress,
          });

          botsProcessed++;
          results.push({ wallet: bot.walletAddress, success: true });

          console.log(`[BotExecutor] Bot bet placed successfully: ${betResult.signature}`);
        } catch (error) {
          console.error(`[BotExecutor] Error processing bot ${bot.walletAddress}:`, error);
          results.push({
            wallet: bot.walletAddress,
            success: false,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      console.log(
        `[BotExecutor] Cycle complete. Processed ${botsProcessed}/${activeBots.length} bots`
      );

      return {
        success: true,
        botsProcessed,
        totalBots: activeBots.length,
        results,
      };
    } catch (error) {
      console.error("[BotExecutor] Fatal error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Update bot stats after game ends
 * Called by game scheduler when a game completes
 */
export const updateBotResultsForRound = internalAction({
  args: {
    roundId: v.number(),
    winnerWallet: v.string(),
    prizeAmount: v.number(),
  },
  handler: async (ctx, { roundId, winnerWallet, prizeAmount }) => {
    console.log(`[BotExecutor] Updating bot results for round ${roundId}`);

    try {
      // Get all bot bets for this round
      const botBets = await ctx.runQuery(internal.botConfigurations.getBotBetsForRound, {
        roundId,
      });

      if (!botBets || botBets.length === 0) {
        console.log(`[BotExecutor] No bot bets found for round ${roundId}`);
        return { success: true, updated: 0 };
      }

      let updated = 0;

      for (const bet of botBets) {
        const isWinner = bet.walletAddress === winnerWallet;
        const result = isWinner ? "win" : "loss";
        const profit = isWinner ? prizeAmount - bet.betAmount : -bet.betAmount;

        // Update bet result
        await ctx.runMutation(internal.botConfigurations.updateBotBetResult, {
          walletAddress: bet.walletAddress,
          roundId,
          result,
          prizeAmount: isWinner ? prizeAmount : 0,
          profit,
        });

        // Update bot configuration stats
        await ctx.runMutation(internal.botConfigurations.resetStreakAfterGame, {
          walletAddress: bet.walletAddress,
          won: isWinner,
          profit,
          betAmount: bet.betAmount,
        });

        updated++;
      }

      console.log(`[BotExecutor] Updated ${updated} bot results for round ${roundId}`);
      return { success: true, updated };
    } catch (error) {
      console.error(`[BotExecutor] Error updating bot results:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Health check for bot executor
 */
export const healthCheck = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    healthy: boolean;
    rpcSlot?: number;
    activeBots?: number;
    privyConfigured?: boolean;
    error?: string;
  }> => {
    try {
      // Check RPC connection
      const connection = new Connection(RPC_ENDPOINT!, "confirmed");
      const slot = await connection.getSlot();

      // Check active bots count
      const activeBots: BotConfig[] | null = await ctx.runQuery(
        internal.botConfigurations.getActiveBots,
        {}
      );

      return {
        healthy: true,
        rpcSlot: slot,
        activeBots: activeBots?.length || 0,
        privyConfigured: !!PRIVY_APP_ID && !!PRIVY_BOT_SIGNER_ID,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
