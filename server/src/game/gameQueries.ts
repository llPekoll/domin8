/**
 * Database queries for game state management
 * Database queries for game state management
 */
import { eq, and, ne, lt, gte, desc, sql, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  gameRoundStates,
  scheduledJobs,
  currentGameParticipants,
  platformStats,
  players,
  characters,
} from "../db/schema.js";

// ============================================================================
// GAME ROUND STATE OPERATIONS
// ============================================================================

/**
 * Upsert game state from blockchain to database
 */
export async function upsertGameState(gameRound: {
  roundId: number;
  status: number;
  startTimestamp: number;
  endTimestamp: number;
  map?: number;
  betCount?: number;
  betAmounts?: number[];
  betSkin?: number[];
  betPosition?: number[][];
  betWalletIndex?: number[];
  wallets?: string[];
  totalPot?: number;
  winner?: string | null;
  winningBetIndex?: number;
  prizeSent?: boolean;
}) {
  // Convert blockchain status to database format
  // GAME_STATUS: OPEN=0, CLOSED=1, WAITING=2
  const statusMap: Record<number, string> = {
    0: "waiting",   // OPEN -> "waiting"
    1: "finished",  // CLOSED -> "finished"
    2: "waiting",   // WAITING -> "waiting"
  };
  const status = statusMap[gameRound.status] ?? "waiting";
  const mapId = gameRound.map;

  // Backfill: if finished, ensure a "waiting" state exists
  if (status === "finished") {
    const [waitingState] = await db
      .select()
      .from(gameRoundStates)
      .where(
        and(
          eq(gameRoundStates.roundId, gameRound.roundId),
          eq(gameRoundStates.status, "waiting")
        )
      )
      .limit(1);

    if (!waitingState) {
      console.log(`[GameQueries] Backfilling missing "waiting" state for round ${gameRound.roundId}`);
      await db.insert(gameRoundStates).values({
        roundId: gameRound.roundId,
        status: "waiting",
        startTimestamp: gameRound.startTimestamp,
        endTimestamp: gameRound.endTimestamp,
        capturedAt: gameRound.startTimestamp,
        mapId,
        betCount: gameRound.betCount,
        betAmounts: gameRound.betAmounts,
        betSkin: gameRound.betSkin,
        betPosition: gameRound.betPosition,
        betWalletIndex: gameRound.betWalletIndex,
        wallets: gameRound.wallets,
        totalPot: gameRound.totalPot,
        winner: null,
        winningBetIndex: 0,
        prizeSent: false,
      });
    }
  }

  // Check for existing state
  const [existingState] = await db
    .select()
    .from(gameRoundStates)
    .where(
      and(
        eq(gameRoundStates.roundId, gameRound.roundId),
        eq(gameRoundStates.status, status)
      )
    )
    .limit(1);

  const gameData = {
    roundId: gameRound.roundId,
    status,
    startTimestamp: gameRound.startTimestamp,
    endTimestamp: gameRound.endTimestamp,
    capturedAt: Math.floor(Date.now() / 1000),
    mapId,
    betCount: gameRound.betCount,
    betAmounts: gameRound.betAmounts,
    betSkin: gameRound.betSkin,
    betPosition: gameRound.betPosition,
    betWalletIndex: gameRound.betWalletIndex,
    wallets: gameRound.wallets,
    totalPot: gameRound.totalPot,
    winner: gameRound.winner ?? null,
    winningBetIndex: gameRound.winningBetIndex ?? 0,
    prizeSent: gameRound.prizeSent ?? false,
  };

  if (existingState && existingState.status === "waiting") {
    await db
      .update(gameRoundStates)
      .set(gameData)
      .where(eq(gameRoundStates.id, existingState.id));
  } else if (
    existingState &&
    existingState.status === "finished" &&
    existingState.prizeSent === false &&
    gameData.prizeSent === true
  ) {
    await db
      .update(gameRoundStates)
      .set({ prizeSent: true })
      .where(eq(gameRoundStates.id, existingState.id));
  } else if (!existingState) {
    await db.insert(gameRoundStates).values(gameData);

    // Increment platform stats when a finished game is first recorded
    if (status === "finished" && gameData.totalPot) {
      await incrementPlatformStats(gameData.totalPot, gameData.wallets?.length ?? 0);
    }
  }
}

/**
 * Get finished games needing prize distribution
 */
export async function getFinishedGamesNeedingPrize(limit: number) {
  const games = await db
    .select()
    .from(gameRoundStates)
    .where(
      and(
        eq(gameRoundStates.status, "finished"),
        eq(gameRoundStates.prizeSent, false)
      )
    )
    .orderBy(desc(gameRoundStates.roundId))
    .limit(limit);

  return games.map((game) => ({
    id: game.id,
    roundId: game.roundId,
    endTimestamp: game.endTimestamp,
    startTimestamp: game.startTimestamp,
    betCount: game.betCount,
    totalPot: game.totalPot,
    winner: game.winner,
    prizeSent: game.prizeSent,
  }));
}

/**
 * Get current (most recent) game state
 */
export async function getCurrentGameState() {
  const [activeGame] = await db
    .select()
    .from(gameRoundStates)
    .where(eq(gameRoundStates.status, "waiting"))
    .orderBy(desc(gameRoundStates.roundId))
    .limit(1);

  if (!activeGame) return null;

  return {
    roundId: activeGame.roundId,
    status: activeGame.status === "waiting" ? 0 : 1,
    startTimestamp: activeGame.startTimestamp,
    endTimestamp: activeGame.endTimestamp,
    mapId: activeGame.mapId,
    betCount: activeGame.betCount,
    totalPot: activeGame.totalPot,
    winner: activeGame.winner,
    prizeSent: activeGame.prizeSent,
  };
}

/**
 * Get last finished game - returns formatted data matching frontend expectations
 */
export async function getLastFinishedGame() {
  const LAMPORTS_PER_SOL = 1_000_000_000;
  const MIN_DISPLAY_DELAY = 15;
  const now = Math.floor(Date.now() / 1000);

  const games = await db
    .select()
    .from(gameRoundStates)
    .where(eq(gameRoundStates.status, "finished"))
    .orderBy(desc(gameRoundStates.roundId))
    .limit(20);

  const game = games.find(
    (g) =>
      g.winner &&
      g.winningBetIndex != null &&
      g.totalPot &&
      g.totalPot > 0 &&
      now - g.endTimestamp >= MIN_DISPLAY_DELAY
  );

  if (!game) return null;

  const winningBetIndex = game.winningBetIndex!;
  const winningBet = game.betSkin?.[winningBetIndex] ?? 1;
  const winningAmount = game.betAmounts?.[winningBetIndex] ?? (game.totalPot! / (game.betCount || 1));
  const prizeAmount = game.totalPot ? (game.totalPot * 0.95) / LAMPORTS_PER_SOL : 0;

  const [character] = await db.select().from(characters).where(eq(characters.characterId, winningBet)).limit(1);
  const fallbackChar = character || (await db.select().from(characters).where(eq(characters.characterId, 1)).limit(1))[0];

  return {
    roundId: game.roundId,
    winnerAddress: game.winner,
    characterId: winningBet,
    characterName: fallbackChar?.name || "orc",
    characterAssetPath: fallbackChar?.assetPath || "/characters/orc.png",
    prizeAmount,
    betAmount: winningAmount ? winningAmount / LAMPORTS_PER_SOL : 0,
    totalPot: game.totalPot ? game.totalPot / LAMPORTS_PER_SOL : 0,
    endTimestamp: game.endTimestamp,
  };
}

/**
 * Get recent games for a player
 */
export async function getRecentGamesForPlayer(walletAddress: string, limit: number = 10) {
  // Get all finished games and filter by wallet
  const games = await db
    .select()
    .from(gameRoundStates)
    .where(eq(gameRoundStates.status, "finished"))
    .orderBy(desc(gameRoundStates.roundId))
    .limit(100);

  // Filter games where this wallet participated
  const playerGames = games
    .filter((g) => g.wallets && g.wallets.includes(walletAddress))
    .slice(0, limit);

  return playerGames;
}

// ============================================================================
// PARTICIPANT OPERATIONS
// ============================================================================

/**
 * Sync participants from blockchain game state
 */
export async function syncParticipants(
  gameRound: number,
  bets: Array<{ walletIndex: number; amount: number; skin: number; position: number[] }>,
  wallets: string[],
  bossWallet: string | null
) {
  if (!bets || bets.length === 0 || !wallets || wallets.length === 0) {
    return { synced: 0 };
  }

  // Calculate boss total
  let bossTotalBet = 0;
  let bossFirstBetIndex = -1;

  if (bossWallet) {
    bets.forEach((bet, betIndex) => {
      const walletAddress = wallets[bet.walletIndex];
      if (walletAddress === bossWallet) {
        bossTotalBet += bet.amount;
        if (bossFirstBetIndex === -1) bossFirstBetIndex = betIndex;
      }
    });
  }

  let syncedCount = 0;

  for (let betIndex = 0; betIndex < bets.length; betIndex++) {
    const bet = bets[betIndex];
    const walletAddress = wallets[bet.walletIndex];
    if (!walletAddress) continue;

    const isBoss = walletAddress === bossWallet;

    // Boss: only one participant entry
    if (isBoss && betIndex !== bossFirstBetIndex) {
      const bossOdid = walletAddress;
      const [existingBoss] = await db
        .select()
        .from(currentGameParticipants)
        .where(eq(currentGameParticipants.odid, bossOdid))
        .limit(1);
      if (existingBoss) {
        await db
          .update(currentGameParticipants)
          .set({ betAmount: bossTotalBet / 1_000_000_000 })
          .where(eq(currentGameParticipants.id, existingBoss.id));
      }
      continue;
    }

    const odid = isBoss ? walletAddress : `${walletAddress}_${betIndex}`;

    const [existing] = await db
      .select()
      .from(currentGameParticipants)
      .where(eq(currentGameParticipants.odid, odid))
      .limit(1);

    if (existing) {
      const newBetAmount = isBoss ? bossTotalBet / 1_000_000_000 : bet.amount / 1_000_000_000;
      if (existing.betAmount !== newBetAmount) {
        await db
          .update(currentGameParticipants)
          .set({ betAmount: newBetAmount })
          .where(eq(currentGameParticipants.id, existing.id));
      }
      continue;
    }

    // Resolve display name
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.walletAddress, walletAddress))
      .limit(1);

    const displayName =
      player?.displayName || `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

    // Resolve character key
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.characterId, bet.skin))
      .limit(1);

    const characterKey = character?.name
      ? character.name.toLowerCase().replace(/\s+/g, "-")
      : "warrior";

    const betAmount = isBoss ? bossTotalBet / 1_000_000_000 : bet.amount / 1_000_000_000;

    await db.insert(currentGameParticipants).values({
      odid,
      walletAddress,
      displayName,
      gameRound,
      characterId: bet.skin,
      characterKey,
      betIndex,
      betAmount,
      position: bet.position,
      isBoss,
      spawnIndex: betIndex,
    });

    syncedCount++;
  }

  return { synced: syncedCount };
}

/**
 * Clear participants for old game rounds
 */
export async function clearOldParticipants(currentGameRound: number) {
  const deleted = await db
    .delete(currentGameParticipants)
    .where(ne(currentGameParticipants.gameRound, currentGameRound));

  return deleted;
}

/**
 * Get participants for a game round
 */
export async function getParticipants(gameRound?: number) {
  const rows = gameRound !== undefined
    ? await db.select().from(currentGameParticipants).where(eq(currentGameParticipants.gameRound, gameRound))
    : await db.select().from(currentGameParticipants);

  // Map id → _id for frontend compatibility
  return rows.map((r) => ({ ...r, _id: String(r.id) }));
}

// ============================================================================
// PLATFORM STATS
// ============================================================================

export async function incrementPlatformStats(potLamports: number, uniqueWallets: number) {
  const houseFee = uniqueWallets > 1 ? Math.floor(potLamports * 0.05) : 0;

  const [existing] = await db
    .select()
    .from(platformStats)
    .where(eq(platformStats.key, "global"))
    .limit(1);

  if (existing) {
    await db
      .update(platformStats)
      .set({
        totalPotLamports: existing.totalPotLamports + potLamports,
        earningsLamports: existing.earningsLamports + houseFee,
        gamesCount: existing.gamesCount + 1,
      })
      .where(eq(platformStats.id, existing.id));
  } else {
    await db.insert(platformStats).values({
      key: "global",
      totalPotLamports: potLamports,
      earningsLamports: houseFee,
      gamesCount: 1,
    });
  }
}

export async function getPlatformStats() {
  const [stats] = await db
    .select()
    .from(platformStats)
    .where(eq(platformStats.key, "global"))
    .limit(1);

  return stats || { totalPotLamports: 0, earningsLamports: 0, gamesCount: 0 };
}

// ============================================================================
// SCHEDULED JOB OPERATIONS
// ============================================================================

export async function upsertScheduledJob(args: {
  jobId: string;
  roundId: number;
  action: string;
  scheduledTime: number;
}) {
  const [existing] = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.roundId, args.roundId),
        eq(scheduledJobs.status, "pending"),
        eq(scheduledJobs.action, args.action)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(scheduledJobs)
      .set({ jobId: args.jobId, scheduledTime: args.scheduledTime })
      .where(eq(scheduledJobs.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(scheduledJobs)
    .values({
      jobId: args.jobId,
      roundId: args.roundId,
      action: args.action,
      scheduledTime: args.scheduledTime,
      status: "pending",
      createdAt: Math.floor(Date.now() / 1000),
    })
    .returning();

  return inserted.id;
}

export async function markJobCompleted(roundId: number, action: string) {
  await db
    .update(scheduledJobs)
    .set({ status: "completed", completedAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(scheduledJobs.roundId, roundId),
        eq(scheduledJobs.status, "pending"),
        eq(scheduledJobs.action, action)
      )
    );
}

export async function markJobFailed(roundId: number, action: string, error: string) {
  await db
    .update(scheduledJobs)
    .set({
      status: "failed",
      completedAt: Math.floor(Date.now() / 1000),
      error,
    })
    .where(
      and(
        eq(scheduledJobs.roundId, roundId),
        eq(scheduledJobs.status, "pending"),
        eq(scheduledJobs.action, action)
      )
    );
}

export async function isActionScheduled(roundId: number, action: string): Promise<boolean> {
  // Check pending
  const [pendingJob] = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.roundId, roundId),
        eq(scheduledJobs.status, "pending"),
        eq(scheduledJobs.action, action)
      )
    )
    .limit(1);

  if (pendingJob) return true;

  // Check completed
  const [completedJob] = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.roundId, roundId),
        eq(scheduledJobs.status, "completed"),
        eq(scheduledJobs.action, action)
      )
    )
    .limit(1);

  if (completedJob) return true;

  // Check recently failed (within 5 minutes)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60;
  const [recentFailed] = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.roundId, roundId),
        eq(scheduledJobs.status, "failed"),
        eq(scheduledJobs.action, action),
        gte(scheduledJobs.completedAt, fiveMinutesAgo)
      )
    )
    .limit(1);

  return recentFailed !== null && recentFailed !== undefined;
}

export async function cleanupOldJobs() {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const deleted = await db
    .delete(scheduledJobs)
    .where(
      and(
        ne(scheduledJobs.status, "pending"),
        lt(scheduledJobs.createdAt, sevenDaysAgo)
      )
    );

  return deleted;
}

/**
 * Get boss wallet (previous winner)
 */
export async function getBossWallet(): Promise<string | null> {
  const [lastGame] = await db
    .select()
    .from(gameRoundStates)
    .where(eq(gameRoundStates.status, "finished"))
    .orderBy(desc(gameRoundStates.roundId))
    .limit(1);

  return lastGame?.winner || null;
}
