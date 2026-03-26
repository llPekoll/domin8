/**
 * Seed script - imports data from seed JSON files
 * Run: cd server && bun src/seed.ts
 */
import { db } from "./db/index.js";
import {
  characters, maps, players, platformStats, referralStats, referrals,
  gameRoundStates, scheduledJobs, nftCollectionHolders,
} from "./db/schema.js";
import { readFileSync, existsSync } from "fs";

const SEED_DIR = "../seed";
const BACKUP_DIR = "/tmp/data-extract";

function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function seed() {
  console.log("Seeding database...\n");

  // 1. Characters from seed/characters.json
  const charsData = JSON.parse(readFileSync(`${SEED_DIR}/characters.json`, "utf-8"));
  for (const c of charsData) {
    try {
      await db.insert(characters).values({
        characterId: c.id,
        name: c.name,
        assetPath: c.assetPath,
        description: c.description,
        nftCollection: c.nftCollection || null,
        nftCollectionName: c.nftCollectionName || null,
        isActive: c.isActive,
        spriteOffsetY: c.spriteOffsetY,
        baseScale: c.baseScale,
        previewOffsetY: c.previewOffsetY,
        previewScale: c.previewScale,
      }).onConflictDoNothing();
    } catch (e: any) {
      if (!e.message?.includes("duplicate")) console.error(`Char ${c.name}:`, e.message);
    }
  }
  console.log(`Characters: ${charsData.length} seeded`);

  // 2. Maps from seed/maps.json
  const mapsData = JSON.parse(readFileSync(`${SEED_DIR}/maps.json`, "utf-8"));
  for (const m of mapsData) {
    try {
      await db.insert(maps).values({
        mapId: m.id,
        name: m.name,
        description: m.description,
        spawnConfiguration: m.spawnConfiguration,
        isActive: m.isActive,
      }).onConflictDoNothing();
    } catch (e: any) {
      if (!e.message?.includes("duplicate")) console.error(`Map ${m.name}:`, e.message);
    }
  }
  console.log(`Maps: ${mapsData.length} seeded`);

  // 3. Players from backup
  if (existsSync(`${BACKUP_DIR}/players/documents.jsonl`)) {
    const playersData = readJsonl(`${BACKUP_DIR}/players/documents.jsonl`);
    for (const p of playersData) {
      try {
        await db.insert(players).values({
          walletAddress: p.walletAddress,
          externalWalletAddress: p.externalWalletAddress || null,
          displayName: p.displayName || null,
          lastActive: Math.floor(p.lastActive || 0),
          totalGamesPlayed: Math.floor(p.totalGamesPlayed || 0),
          totalWins: Math.floor(p.totalWins || 0),
          totalPoints: Math.floor(p.totalPoints || 0),
          achievements: p.achievements || [],
          xp: Math.floor(p.xp || 0),
          level: Math.floor(p.level || 1),
          currentWinStreak: Math.floor(p.currentWinStreak || 0),
          lastDailyLoginDate: p.lastDailyLoginDate || null,
          lastDailyBetDate: p.lastDailyBetDate || null,
        }).onConflictDoNothing();
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.error(`Player ${p.walletAddress?.slice(0, 8)}:`, e.message);
      }
    }
    console.log(`Players: ${playersData.length} imported`);
  }

  // 4. Platform stats from backup
  if (existsSync(`${BACKUP_DIR}/platformStats/documents.jsonl`)) {
    const statsData = readJsonl(`${BACKUP_DIR}/platformStats/documents.jsonl`);
    for (const s of statsData) {
      try {
        await db.insert(platformStats).values({
          key: s.key || "global",
          totalPotLamports: Math.floor(s.totalPotLamports || 0),
          earningsLamports: Math.floor(s.earningsLamports || 0),
          gamesCount: Math.floor(s.gamesCount || 0),
        }).onConflictDoNothing();
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.error("PlatformStats:", e.message);
      }
    }
    console.log(`Platform stats: ${statsData.length} imported`);
  }

  // 5. Referral stats from backup
  if (existsSync(`${BACKUP_DIR}/referralStats/documents.jsonl`)) {
    const refStatsData = readJsonl(`${BACKUP_DIR}/referralStats/documents.jsonl`);
    for (const r of refStatsData) {
      try {
        await db.insert(referralStats).values({
          walletAddress: r.walletAddress,
          referralCode: r.referralCode,
          totalReferred: Math.floor(r.totalReferred || 0),
          totalRevenue: Math.floor(r.totalRevenue || 0),
          accumulatedRewards: Math.floor(r.accumulatedRewards || 0),
          totalPaidOut: Math.floor(r.totalPaidOut || 0),
          lastPayoutDate: r.lastPayoutDate ? Math.floor(r.lastPayoutDate) : null,
          lastPayoutAmount: r.lastPayoutAmount ? Math.floor(r.lastPayoutAmount) : null,
          createdAt: Math.floor(r.createdAt || Date.now() / 1000),
        }).onConflictDoNothing();
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.error(`ReferralStats ${r.walletAddress?.slice(0, 8)}:`, e.message);
      }
    }
    console.log(`Referral stats: ${refStatsData.length} imported`);
  }

  // 6. Referrals from backup
  if (existsSync(`${BACKUP_DIR}/referrals/documents.jsonl`)) {
    const refsData = readJsonl(`${BACKUP_DIR}/referrals/documents.jsonl`);
    for (const r of refsData) {
      try {
        await db.insert(referrals).values({
          referrerId: r.referrerId,
          referredUserId: r.referredUserId,
          referralCode: r.referralCode,
          signupDate: Math.floor(r.signupDate || 0),
          totalBetVolume: Math.floor(r.totalBetVolume || 0),
          status: r.status || "active",
        }).onConflictDoNothing();
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.error("Referral:", e.message);
      }
    }
    console.log(`Referrals: ${refsData.length} imported`);
  }

  // 7. Game round states from backup
  if (existsSync(`${BACKUP_DIR}/gameRoundStates/documents.jsonl`)) {
    const gamesData = readJsonl(`${BACKUP_DIR}/gameRoundStates/documents.jsonl`);
    let imported = 0;
    for (const g of gamesData) {
      try {
        await db.insert(gameRoundStates).values({
          roundId: Math.floor(g.roundId || 0),
          status: g.status || "waiting",
          startTimestamp: Math.floor(g.startTimestamp || 0),
          endTimestamp: Math.floor(g.endTimestamp || 0),
          capturedAt: Math.floor(g.capturedAt || 0),
          mapId: g.mapId != null ? Math.floor(g.mapId) : null,
          betCount: g.betCount != null ? Math.floor(g.betCount) : null,
          betAmounts: g.betAmounts || null,
          betSkin: g.betSkin || null,
          betPosition: g.betPosition || null,
          betWalletIndex: g.betWalletIndex || null,
          wallets: g.wallets || null,
          totalPot: g.totalPot != null ? Math.floor(g.totalPot) : null,
          winner: g.winner || null,
          winningBetIndex: g.winningBetIndex != null ? Math.floor(g.winningBetIndex) : null,
          prizeSent: g.prizeSent ?? false,
        }).onConflictDoNothing();
        imported++;
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) console.error(`Game ${g.roundId}:`, e.message);
      }
    }
    console.log(`Game round states: ${imported}/${gamesData.length} imported`);
  }

  // 8. NFT collection holders from backup
  if (existsSync(`${BACKUP_DIR}/nftCollectionHolders/documents.jsonl`)) {
    const holdersData = readJsonl(`${BACKUP_DIR}/nftCollectionHolders/documents.jsonl`);
    let imported = 0;
    for (const h of holdersData) {
      try {
        await db.insert(nftCollectionHolders).values({
          collectionAddress: h.collectionAddress,
          walletAddress: h.walletAddress,
          nftCount: Math.floor(h.nftCount || 0),
          lastVerified: Math.floor(h.lastVerified || 0),
          addedBy: h.addedBy || "backup",
        }).onConflictDoNothing();
        imported++;
      } catch (e: any) {
        if (!e.message?.includes("duplicate")) {
          // Skip silently for bulk import
        }
      }
    }
    console.log(`NFT holders: ${imported}/${holdersData.length} imported`);
  }

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
