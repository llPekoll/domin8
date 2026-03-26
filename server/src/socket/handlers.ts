/**
 * Socket.io event handlers
 * Direct DB access for socket events
 */
import type { Server, Socket } from "socket.io";
import { eq, and, desc, sql, ne, or, gte, lt, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  players,
  characters,
  maps,
  gameRoundStates,
  currentGameParticipants,
  platformStats,
  chatMessages,
  referrals,
  referralStats,
  payoutHistory,
  nftCollectionHolders,
  oneVOneLobbies,
  botPurchases,
  botConfigurations,
  botPerformanceStats,
  pushSubscriptions,
  presenceBotSpawns,
} from "../db/schema.js";
import {
  XP_REWARDS,
  calculateLevel,
  getLevelInfo,
  getXpProgressInfo,
  calculateBetAmountXp,
  calculateStreakBonusXp,
  getTodayDateString,
} from "../lib/xpConstants.js";
import {
  getParticipants,
  getBossWallet,
  getLastFinishedGame,
  getRecentGamesForPlayer,
  getPlatformStats,
  syncParticipants as syncParticipantsQuery,
  clearOldParticipants,
} from "../game/gameQueries.js";
import { verifyNFTOwnershipRealtime, getAllNFTHoldersForWallets, manualRefreshNFT } from "../game/nftScanner.js";
import { checkAndSpawnBot } from "../game/presenceBot.js";
import { notifyGameCreated } from "../game/notifications.js";
import { emitChatMessage, emitLobbyUpdate } from "./emitter.js";

// Bot tier pricing
const BOT_PRICES: Record<string, number> = {
  rookie: 100_000_000,
  pro: 500_000_000,
  elite: 1_000_000_000,
};

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ==========================================
    // PLAYER HANDLERS
    // ==========================================

    socket.on("get-player", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        ack?.({ success: true, data: player || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("create-player", async (data: { walletAddress: string; displayName?: string }, ack?: (res: any) => void) => {
      try {
        const [existing] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (existing) {
          await db.update(players).set({ lastActive: Date.now() }).where(eq(players.id, existing.id));
          ack?.({ success: true, data: existing });
          return;
        }
        const [newPlayer] = await db.insert(players).values({
          walletAddress: data.walletAddress,
          displayName: data.displayName,
          lastActive: Date.now(),
          totalGamesPlayed: 0,
          totalWins: 0,
          totalPoints: 0,
          achievements: [],
          xp: 0,
          level: 1,
          currentWinStreak: 0,
        }).returning();
        ack?.({ success: true, data: newPlayer });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("update-display-name", async (data: { walletAddress: string; displayName: string }, ack?: (res: any) => void) => {
      try {
        await db.update(players).set({ displayName: data.displayName, lastActive: Date.now() }).where(eq(players.walletAddress, data.walletAddress));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("claim-daily-login-xp", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (!player) { ack?.({ success: false, error: "Player not found" }); return; }

        const today = getTodayDateString();
        if (player.lastDailyLoginDate === today) {
          ack?.({ success: true, data: { alreadyClaimed: true, xpAwarded: 0 } });
          return;
        }

        const newXp = (player.xp || 0) + XP_REWARDS.DAILY_LOGIN;
        const newLevel = calculateLevel(newXp);
        await db.update(players).set({ xp: newXp, level: newLevel, lastDailyLoginDate: today, lastActive: Date.now() }).where(eq(players.id, player.id));
        ack?.({ success: true, data: { alreadyClaimed: false, xpAwarded: XP_REWARDS.DAILY_LOGIN } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("award-points", async (data: { walletAddress: string; amountLamports: number }, ack?: (res: any) => void) => {
      try {
        const points = Math.floor(data.amountLamports / 1_000_000); // 1 point per 0.001 SOL
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (player) {
          await db.update(players).set({ totalPoints: (player.totalPoints || 0) + points }).where(eq(players.id, player.id));
        }
        ack?.({ success: true, data: { pointsAwarded: points } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("award-xp-for-bet", async (data: { walletAddress: string; betAmountLamports: number }, ack?: (res: any) => void) => {
      try {
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (!player) { ack?.({ success: false, error: "Player not found" }); return; }

        let totalXp = XP_REWARDS.PLACE_BET;
        totalXp += calculateBetAmountXp(data.betAmountLamports);

        const today = getTodayDateString();
        if (player.lastDailyBetDate !== today) {
          totalXp += XP_REWARDS.DAILY_FIRST_BET;
          await db.update(players).set({ lastDailyBetDate: today }).where(eq(players.id, player.id));
        }

        const newXp = (player.xp || 0) + totalXp;
        const newLevel = calculateLevel(newXp);
        await db.update(players).set({ xp: newXp, level: newLevel, lastActive: Date.now() }).where(eq(players.id, player.id));
        ack?.({ success: true, data: { xpAwarded: totalXp } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("update-referral-revenue", async (data: { walletAddress?: string; userId?: string; betAmount?: number; betAmountLamports?: number }, ack?: (res: any) => void) => {
      try {
        const wallet = data.walletAddress || data.userId || "";
        const amount = data.betAmountLamports || data.betAmount || 0;
        const [referral] = await db.select().from(referrals).where(eq(referrals.referredUserId, wallet)).limit(1);
        if (!referral) { ack?.({ success: true }); return; }

        await db.update(referrals).set({ totalBetVolume: referral.totalBetVolume + amount }).where(eq(referrals.id, referral.id));

        const [stats] = await db.select().from(referralStats).where(eq(referralStats.walletAddress, referral.referrerId)).limit(1);
        if (stats) {
          const newRevenue = stats.totalRevenue + amount;
          const newRewards = Math.floor(newRevenue * 0.01);
          await db.update(referralStats).set({ totalRevenue: newRevenue, accumulatedRewards: newRewards }).where(eq(referralStats.id, stats.id));
        }
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // get-player-with-character (used by useAutoCreatePlayer)
    socket.on("get-player-with-character", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (!player) { ack?.({ success: true, data: null }); return; }
        const allChars = await db.select().from(characters).where(eq(characters.isActive, true));
        const character = allChars.length > 0 ? allChars[Math.floor(Math.random() * allChars.length)] : null;
        ack?.({ success: true, data: { ...player, character } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // get-players-by-wallets (used by PlayerNamesContext, LobbyList, etc.)
    socket.on("get-players-by-wallets", async (data: { walletAddresses: string[] }, ack?: (res: any) => void) => {
      try {
        if (!data.walletAddresses?.length) { ack?.({ success: true, data: [] }); return; }
        const result = await Promise.all(
          data.walletAddresses.map(async (wa) => {
            const [p] = await db.select().from(players).where(eq(players.walletAddress, wa)).limit(1);
            return { walletAddress: wa, displayName: p?.displayName || null, totalWins: p?.totalWins || 0 };
          })
        );
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // GAME STATE HANDLERS
    // ==========================================

    // Frontend uses "sync-participants-from-blockchain"
    socket.on("sync-participants-from-blockchain", async (data: { gameRound: number; bets: any[]; wallets: string[] }, ack?: (res: any) => void) => {
      try {
        // Clear old participants from previous rounds first
        await clearOldParticipants(data.gameRound);
        const bossWallet = await getBossWallet();
        const result = await syncParticipantsQuery(data.gameRound, data.bets, data.wallets, bossWallet);
        // Return fresh participants after sync
        const participants = await getParticipants(data.gameRound);
        ack?.({ success: true, data: { ...result, participants } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("sync-participants", async (data: { gameRound: number; bets: any[]; wallets: string[]; bossWallet: string | null }, ack?: (res: any) => void) => {
      try {
        const result = await syncParticipantsQuery(data.gameRound, data.bets, data.wallets, data.bossWallet);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-participants", async (data: { gameRound?: number }, ack?: (res: any) => void) => {
      try {
        const participants = await getParticipants(data.gameRound);
        ack?.({ success: true, data: participants });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-boss-info", async (_data: any, ack?: (res: any) => void) => {
      try {
        const bossWallet = await getBossWallet();
        ack?.({ success: true, data: { bossWallet } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-last-finished-game", async (_data: any, ack?: (res: any) => void) => {
      try {
        const game = await getLastFinishedGame();
        ack?.({ success: true, data: game });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // CHARACTER & MAP HANDLERS
    // ==========================================

    socket.on("get-active-characters", async (_data: any, ack?: (res: any) => void) => {
      try {
        const chars = await db.select().from(characters).where(eq(characters.isActive, true));
        ack?.({ success: true, data: chars });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-exclusive-characters", async (_data: any, ack?: (res: any) => void) => {
      try {
        const chars = await db.select().from(characters).where(and(eq(characters.isActive, true), sql`${characters.nftCollection} IS NOT NULL`));
        ack?.({ success: true, data: chars });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // Alias: frontend uses "get-all-active-maps"
    socket.on("get-all-active-maps", async (_data: any, ack?: (res: any) => void) => {
      try {
        const allMaps = await db.select().from(maps).where(eq(maps.isActive, true));
        ack?.({ success: true, data: allMaps });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-all-maps", async (_data: any, ack?: (res: any) => void) => {
      try {
        const allMaps = await db.select().from(maps).where(eq(maps.isActive, true));
        ack?.({ success: true, data: allMaps });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // LEADERBOARD & STATS
    // ==========================================

    socket.on("get-leaderboard", async (data: { limit?: number }, ack?: (res: any) => void) => {
      try {
        const limit = data.limit || 20;
        const leaderboard = await db.select().from(players).orderBy(desc(players.xp)).limit(limit);
        ack?.({ success: true, data: leaderboard });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-player-xp-info", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [player] = await db.select().from(players).where(eq(players.walletAddress, data.walletAddress)).limit(1);
        if (!player) { ack?.({ success: true, data: null }); return; }
        const xp = player.xp || 0;
        const level = calculateLevel(xp);
        const levelInfo = getLevelInfo(level);
        const progress = getXpProgressInfo(xp);
        ack?.({ success: true, data: { xp, level, title: levelInfo.title, ...progress, currentWinStreak: player.currentWinStreak || 0 } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-recent-games", async (data: { walletAddress: string; limit?: number }, ack?: (res: any) => void) => {
      try {
        const games = await getRecentGamesForPlayer(data.walletAddress, data.limit || 10);
        ack?.({ success: true, data: games });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-platform-stats", async (_data: any, ack?: (res: any) => void) => {
      try {
        const stats = await getPlatformStats();
        ack?.({ success: true, data: stats });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // CHAT HANDLERS
    // ==========================================

    // Alias: frontend uses "send-message"
    socket.on("send-message", async (data: { walletAddress: string; message: string; displayName?: string }, ack?: (res: any) => void) => {
      try {
        if (!data.message || data.message.length > 200) { ack?.({ success: false, error: "Invalid message" }); return; }
        const [msg] = await db.insert(chatMessages).values({
          senderWallet: data.walletAddress,
          senderName: data.displayName,
          message: data.message.trim(),
          type: "user",
          timestamp: Date.now(),
        }).returning();
        emitChatMessage(msg);
        ack?.({ success: true, data: msg });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // Alias: frontend uses "get-recent-messages"
    socket.on("get-recent-messages", async (_data: any, ack?: (res: any) => void) => {
      try {
        const msgs = await db.select().from(chatMessages).orderBy(desc(chatMessages.timestamp)).limit(50);
        ack?.({ success: true, data: msgs.reverse() });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("send-chat-message", async (data: { senderWallet: string; senderName?: string; message: string; type?: string; gameType?: string }, ack?: (res: any) => void) => {
      try {
        if (!data.message || data.message.length > 200) { ack?.({ success: false, error: "Invalid message" }); return; }

        const [msg] = await db.insert(chatMessages).values({
          senderWallet: data.senderWallet,
          senderName: data.senderName,
          message: data.message,
          type: data.type || "user",
          gameType: data.gameType,
          timestamp: Date.now(),
        }).returning();

        emitChatMessage(msg);
        ack?.({ success: true, data: msg });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-recent-chat-messages", async (data: { limit?: number }, ack?: (res: any) => void) => {
      try {
        const limit = data.limit || 50;
        const msgs = await db.select().from(chatMessages).orderBy(desc(chatMessages.timestamp)).limit(limit);
        ack?.({ success: true, data: msgs.reverse() });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // REFERRAL HANDLERS
    // ==========================================

    socket.on("get-referral-stats", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [stats] = await db.select().from(referralStats).where(eq(referralStats.walletAddress, data.walletAddress)).limit(1);
        ack?.({ success: true, data: stats || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-or-create-referral-code", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        let [stats] = await db.select().from(referralStats).where(eq(referralStats.walletAddress, data.walletAddress)).limit(1);
        if (stats) { ack?.({ success: true, data: { referralCode: stats.referralCode } }); return; }

        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        [stats] = await db.insert(referralStats).values({
          walletAddress: data.walletAddress,
          referralCode: code,
          totalReferred: 0,
          totalRevenue: 0,
          accumulatedRewards: 0,
          createdAt: Math.floor(Date.now() / 1000),
        }).returning();
        ack?.({ success: true, data: { referralCode: stats.referralCode } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("track-referral", async (data: { referralCode: string; referredWallet?: string; referredUserId?: string }, ack?: (res: any) => void) => {
      try {
        const referredWallet = data.referredWallet || data.referredUserId || "";
        // Check if already referred
        const [existing] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredWallet)).limit(1);
        if (existing) { ack?.({ success: true, data: { alreadyReferred: true } }); return; }

        const [stats] = await db.select().from(referralStats).where(eq(referralStats.referralCode, data.referralCode)).limit(1);
        if (!stats) { ack?.({ success: false, error: "Invalid referral code" }); return; }

        // Can't refer yourself
        if (stats.walletAddress === referredWallet) { ack?.({ success: false, error: "Cannot refer yourself" }); return; }

        await db.insert(referrals).values({
          referrerId: stats.walletAddress,
          referredUserId: referredWallet,
          referralCode: data.referralCode,
          signupDate: Math.floor(Date.now() / 1000),
          totalBetVolume: 0,
          status: "active",
        });

        await db.update(referralStats).set({ totalReferred: stats.totalReferred + 1 }).where(eq(referralStats.id, stats.id));
        ack?.({ success: true, data: { tracked: true } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-referred-users", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const refs = await db.select().from(referrals).where(eq(referrals.referrerId, data.walletAddress));
        ack?.({ success: true, data: refs });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-referral-leaderboard", async (data: { limit?: number }, ack?: (res: any) => void) => {
      try {
        const limit = data.limit || 20;
        const leaderboard = await db.select().from(referralStats).orderBy(desc(referralStats.totalRevenue)).limit(limit);
        ack?.({ success: true, data: leaderboard });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // Frontend uses "get-referral-user-rank"
    socket.on("get-referral-user-rank", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [userStats] = await db.select().from(referralStats).where(eq(referralStats.walletAddress, data.walletAddress)).limit(1);
        if (!userStats) { ack?.({ success: true, data: null }); return; }
        const allStats = await db.select().from(referralStats);
        const rank = allStats.filter((s) => s.totalRevenue > userStats.totalRevenue).length + 1;
        ack?.({ success: true, data: { rank, totalRevenue: userStats.totalRevenue, totalReferred: userStats.totalReferred } });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });

    // Frontend uses "send-payout-issue-email"
    socket.on("send-payout-issue-email", async (data: any, ack?: (res: any) => void) => {
      try {
        // TODO: implement with Resend API if needed
        console.log("[Email] Payout issue email requested:", data);
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });

    socket.on("get-payout-history", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const history = await db.select().from(payoutHistory).where(eq(payoutHistory.walletAddress, data.walletAddress)).orderBy(desc(payoutHistory.paidAt));
        ack?.({ success: true, data: history });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // NFT HANDLERS
    // ==========================================

    // Alias: frontend uses "verify-cached-nft-ownership"
    socket.on("verify-cached-nft-ownership", async (data: { walletAddress: string; collectionAddress: string }, ack?: (res: any) => void) => {
      try {
        const result = await verifyNFTOwnershipRealtime(data.walletAddress, data.collectionAddress);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // Alias: frontend uses "get-all-holders-for-wallets"
    socket.on("get-all-holders-for-wallets", async (data: { walletAddresses: string[] }, ack?: (res: any) => void) => {
      try {
        const result = await getAllNFTHoldersForWallets(data.walletAddresses || []);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // Alias: frontend uses "manual-refresh-wallet-nfts"
    socket.on("manual-refresh-wallet-nfts", async (data: { walletAddress: string; collectionAddress: string }, ack?: (res: any) => void) => {
      try {
        const result = await manualRefreshNFT(data.walletAddress);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("verify-nft-ownership", async (data: { walletAddress: string; collectionAddress: string }, ack?: (res: any) => void) => {
      try {
        const result = await verifyNFTOwnershipRealtime(data.walletAddress, data.collectionAddress);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-all-nft-holders", async (data: { walletAddresses: string[] }, ack?: (res: any) => void) => {
      try {
        const result = await getAllNFTHoldersForWallets(data.walletAddresses);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("manual-refresh-nft", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const result = await manualRefreshNFT(data.walletAddress);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // PRESENCE BOT
    // ==========================================

    socket.on("record-arena-view", async (_data: any, ack?: (res: any) => void) => {
      try {
        // Schedule bot spawn after 5 seconds
        setTimeout(() => checkAndSpawnBot(), 5000);
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // 1V1 LOBBY HANDLERS
    // ==========================================

    socket.on("get-open-lobbies", async (_data: any, ack?: (res: any) => void) => {
      try {
        const lobbies = await db.select().from(oneVOneLobbies).where(and(eq(oneVOneLobbies.status, 0), or(eq(oneVOneLobbies.isPrivate, false), sql`${oneVOneLobbies.isPrivate} IS NULL`))).orderBy(desc(oneVOneLobbies.createdAt)).limit(20);
        ack?.({ success: true, data: lobbies });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-lobby-state", async (data: { lobbyId: number }, ack?: (res: any) => void) => {
      try {
        const [lobby] = await db.select().from(oneVOneLobbies).where(eq(oneVOneLobbies.lobbyId, data.lobbyId)).limit(1);
        ack?.({ success: true, data: lobby || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-lobby-by-share-token", async (data: { shareToken: string }, ack?: (res: any) => void) => {
      try {
        const [lobby] = await db.select().from(oneVOneLobbies).where(eq(oneVOneLobbies.shareToken, data.shareToken)).limit(1);
        ack?.({ success: true, data: lobby || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-player-lobbies", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const lobbies = await db.select().from(oneVOneLobbies).where(or(eq(oneVOneLobbies.playerA, data.walletAddress), eq(oneVOneLobbies.playerB, data.walletAddress))).orderBy(desc(oneVOneLobbies.createdAt)).limit(20);
        ack?.({ success: true, data: lobbies });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-completed-lobbies", async (data: { limit?: number }, ack?: (res: any) => void) => {
      try {
        const lobbies = await db.select().from(oneVOneLobbies).where(eq(oneVOneLobbies.status, 3)).orderBy(desc(oneVOneLobbies.resolvedAt)).limit(data.limit || 10);
        ack?.({ success: true, data: lobbies });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("create-lobby", async (data: { lobbyId: number; lobbyPda: string; playerA: string; amount: number; characterA: number; mapId: number; isPrivate?: boolean }, ack?: (res: any) => void) => {
      try {
        const shareToken = Math.random().toString(36).substring(2, 10).toUpperCase();
        const [lobby] = await db.insert(oneVOneLobbies).values({
          lobbyId: data.lobbyId,
          lobbyPda: data.lobbyPda,
          shareToken,
          playerA: data.playerA,
          amount: data.amount,
          status: 0,
          characterA: data.characterA,
          mapId: data.mapId,
          isPrivate: data.isPrivate || false,
          createdAt: Math.floor(Date.now() / 1000),
        }).returning();
        emitLobbyUpdate(lobby);
        ack?.({ success: true, data: lobby });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("join-lobby", async (data: { lobbyId: number; playerB: string; characterB: number }, ack?: (res: any) => void) => {
      try {
        await db.update(oneVOneLobbies).set({ playerB: data.playerB, characterB: data.characterB, status: 1 }).where(eq(oneVOneLobbies.lobbyId, data.lobbyId));
        const [lobby] = await db.select().from(oneVOneLobbies).where(eq(oneVOneLobbies.lobbyId, data.lobbyId)).limit(1);
        emitLobbyUpdate(lobby);
        ack?.({ success: true, data: lobby });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("cancel-lobby", async (data: { lobbyId: number; walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [lobby] = await db.select().from(oneVOneLobbies).where(eq(oneVOneLobbies.lobbyId, data.lobbyId)).limit(1);
        if (!lobby || lobby.playerA !== data.walletAddress) { ack?.({ success: false, error: "Not authorized" }); return; }
        if (lobby.status !== 0) { ack?.({ success: false, error: "Cannot cancel" }); return; }

        await db.delete(oneVOneLobbies).where(eq(oneVOneLobbies.lobbyId, data.lobbyId));
        emitLobbyUpdate({ lobbyId: data.lobbyId, status: -1 });
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // BOT HANDLERS
    // ==========================================

    // Aliases for bot handlers (frontend uses different names)
    socket.on("get-user-bot-purchase", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const purchases = await db.select().from(botPurchases).where(eq(botPurchases.walletAddress, data.walletAddress));
        const activeBot = purchases.find((p) => p.isActiveBot);
        ack?.({ success: true, data: activeBot || purchases[0] || null });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("get-all-user-bots", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const bots = await db.select().from(botPurchases).where(eq(botPurchases.walletAddress, data.walletAddress));
        ack?.({ success: true, data: bots });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("get-bot-configuration", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const configs = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress));
        ack?.({ success: true, data: configs[0] || null });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("get-recent-bot-performance", async (data: { walletAddress: string; limit?: number }, ack?: (res: any) => void) => {
      try {
        const stats = await db.select().from(botPerformanceStats).where(eq(botPerformanceStats.walletAddress, data.walletAddress)).orderBy(desc(botPerformanceStats.timestamp)).limit(data.limit || 20);
        ack?.({ success: true, data: stats });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("save-bot-configuration", async (data: { walletAddress: string; config: Record<string, any> }, ack?: (res: any) => void) => {
      try {
        const [existing] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        if (!existing) { ack?.({ success: false, error: "No bot configuration found" }); return; }
        const updates: Record<string, any> = { lastUpdated: Date.now() };
        const cfg = data.config;
        if (cfg.fixedBetAmount !== undefined) updates.fixedBetAmount = cfg.fixedBetAmount;
        if (cfg.selectedCharacter !== undefined) updates.selectedCharacter = cfg.selectedCharacter;
        if (cfg.budgetLimit !== undefined) updates.budgetLimit = cfg.budgetLimit;
        if (cfg.betMin !== undefined) updates.betMin = cfg.betMin;
        if (cfg.betMax !== undefined) updates.betMax = cfg.betMax;
        if (cfg.stopLoss !== undefined) updates.stopLoss = cfg.stopLoss;
        if (cfg.winStreakMultiplier !== undefined) updates.winStreakMultiplier = cfg.winStreakMultiplier;
        if (cfg.cooldownRounds !== undefined) updates.cooldownRounds = cfg.cooldownRounds;
        if (cfg.characterRotation !== undefined) updates.characterRotation = cfg.characterRotation;
        if (cfg.takeProfit !== undefined) updates.takeProfit = cfg.takeProfit;
        if (cfg.martingaleEnabled !== undefined) updates.martingaleEnabled = cfg.martingaleEnabled;
        if (cfg.antiMartingaleEnabled !== undefined) updates.antiMartingaleEnabled = cfg.antiMartingaleEnabled;
        if (cfg.scheduleStart !== undefined) updates.scheduleStart = cfg.scheduleStart;
        if (cfg.scheduleEnd !== undefined) updates.scheduleEnd = cfg.scheduleEnd;
        if (cfg.smartSizing !== undefined) updates.smartSizing = cfg.smartSizing;
        if (cfg.smartSizingThreshold !== undefined) updates.smartSizingThreshold = cfg.smartSizingThreshold;
        await db.update(botConfigurations).set(updates).where(eq(botConfigurations.id, existing.id));
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("update-session-signer-state", async (data: { walletAddress: string; enabled: boolean }, ack?: (res: any) => void) => {
      try {
        const updates: Record<string, any> = { sessionSignerEnabled: data.enabled, lastUpdated: Date.now() };
        if (!data.enabled) updates.isActive = false;
        await db.update(botConfigurations).set(updates).where(eq(botConfigurations.walletAddress, data.walletAddress));
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });

    socket.on("get-bot-purchase", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const purchases = await db.select().from(botPurchases).where(eq(botPurchases.walletAddress, data.walletAddress));
        const activeBot = purchases.find((p) => p.isActiveBot);
        ack?.({ success: true, data: activeBot || purchases[0] || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-all-bots", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const bots = await db.select().from(botPurchases).where(eq(botPurchases.walletAddress, data.walletAddress));
        ack?.({ success: true, data: bots });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-bot-tier-info", async (_data: any, ack?: (res: any) => void) => {
      try {
        ack?.({
          success: true,
          data: {
            tiers: [
              { id: "rookie", name: "Rookie", price: BOT_PRICES.rookie, priceSOL: BOT_PRICES.rookie / 1e9, features: ["Fixed bet amount", "Single character", "Budget limit", "Auto-betting when away"] },
              { id: "pro", name: "Pro", price: BOT_PRICES.pro, priceSOL: BOT_PRICES.pro / 1e9, features: ["Everything in Rookie", "Bet range (min/max)", "Stop-loss protection", "Win streak multiplier", "Cooldown between bets", "Character rotation"] },
              { id: "elite", name: "Elite", price: BOT_PRICES.elite, priceSOL: BOT_PRICES.elite / 1e9, features: ["Everything in Pro", "Take profit auto-stop", "Martingale strategy", "Anti-Martingale strategy", "Time scheduling", "Smart pot sizing", "Performance stats"] },
            ],
          },
        });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("purchase-bot", async (data: { walletAddress: string; tier: string; transactionSignature: string; purchaseAmount: number }, ack?: (res: any) => void) => {
      try {
        if (!BOT_PRICES[data.tier]) { ack?.({ success: false, error: "Invalid tier" }); return; }

        const [existing] = await db.select().from(botPurchases).where(and(eq(botPurchases.walletAddress, data.walletAddress), eq(botPurchases.tier, data.tier))).limit(1);
        if (existing) { ack?.({ success: false, error: `Already own ${data.tier} bot` }); return; }

        const allBots = await db.select().from(botPurchases).where(eq(botPurchases.walletAddress, data.walletAddress));
        const isFirstBot = allBots.length === 0;

        const [purchase] = await db.insert(botPurchases).values({
          walletAddress: data.walletAddress,
          tier: data.tier,
          purchasedAt: Date.now(),
          transactionSignature: data.transactionSignature,
          purchaseAmount: data.purchaseAmount,
          isActiveBot: isFirstBot,
        }).returning();

        await db.insert(botConfigurations).values({
          walletAddress: data.walletAddress,
          tier: data.tier,
          isActive: false,
          fixedBetAmount: 1_000_000,
          selectedCharacter: 1,
          budgetLimit: 100_000_000,
          currentSpent: 0,
          consecutiveWins: 0,
          consecutiveLosses: 0,
          totalProfit: 0,
          totalBets: 0,
          totalWins: 0,
          sessionSignerEnabled: false,
          lastUpdated: Date.now(),
        });

        ack?.({ success: true, data: purchase });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("set-active-bot", async (data: { walletAddress: string; tier: string }, ack?: (res: any) => void) => {
      try {
        // Deactivate all
        await db.update(botPurchases).set({ isActiveBot: false }).where(eq(botPurchases.walletAddress, data.walletAddress));
        // Activate target
        await db.update(botPurchases).set({ isActiveBot: true }).where(and(eq(botPurchases.walletAddress, data.walletAddress), eq(botPurchases.tier, data.tier)));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-bot-config", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [cfg] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        ack?.({ success: true, data: cfg || null });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-bot-stats", async (data: { walletAddress: string }, ack?: (res: any) => void) => {
      try {
        const [cfg] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        if (!cfg) { ack?.({ success: true, data: null }); return; }
        const totalBets = cfg.totalBets || 0;
        const totalWins = cfg.totalWins || 0;
        const totalProfit = cfg.totalProfit || 0;
        const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
        ack?.({
          success: true,
          data: {
            totalBets, totalWins, totalLosses: totalBets - totalWins,
            winRate: winRate.toFixed(1), totalProfit,
            totalProfitSOL: totalProfit / 1e9,
            currentSpent: cfg.currentSpent || 0,
            budgetRemaining: (cfg.budgetLimit || 0) - (cfg.currentSpent || 0),
            consecutiveWins: cfg.consecutiveWins || 0,
            consecutiveLosses: cfg.consecutiveLosses || 0,
            isActive: cfg.isActive,
            sessionSignerEnabled: cfg.sessionSignerEnabled,
          },
        });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-bot-performance", async (data: { walletAddress: string; limit?: number }, ack?: (res: any) => void) => {
      try {
        const limit = data.limit || 20;
        const stats = await db.select().from(botPerformanceStats).where(eq(botPerformanceStats.walletAddress, data.walletAddress)).orderBy(desc(botPerformanceStats.timestamp)).limit(limit);
        ack?.({ success: true, data: stats });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("save-bot-config", async (data: { walletAddress: string; config: Record<string, any> }, ack?: (res: any) => void) => {
      try {
        const [existing] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        if (!existing) { ack?.({ success: false, error: "No bot configuration found" }); return; }

        const updates: Record<string, any> = { lastUpdated: Date.now() };
        const cfg = data.config;

        if (cfg.fixedBetAmount !== undefined) updates.fixedBetAmount = cfg.fixedBetAmount;
        if (cfg.selectedCharacter !== undefined) updates.selectedCharacter = cfg.selectedCharacter;
        if (cfg.budgetLimit !== undefined) updates.budgetLimit = cfg.budgetLimit;
        if (cfg.betMin !== undefined) updates.betMin = cfg.betMin;
        if (cfg.betMax !== undefined) updates.betMax = cfg.betMax;
        if (cfg.stopLoss !== undefined) updates.stopLoss = cfg.stopLoss;
        if (cfg.winStreakMultiplier !== undefined) updates.winStreakMultiplier = cfg.winStreakMultiplier;
        if (cfg.cooldownRounds !== undefined) updates.cooldownRounds = cfg.cooldownRounds;
        if (cfg.characterRotation !== undefined) updates.characterRotation = cfg.characterRotation;
        if (cfg.takeProfit !== undefined) updates.takeProfit = cfg.takeProfit;
        if (cfg.martingaleEnabled !== undefined) updates.martingaleEnabled = cfg.martingaleEnabled;
        if (cfg.antiMartingaleEnabled !== undefined) updates.antiMartingaleEnabled = cfg.antiMartingaleEnabled;
        if (cfg.scheduleStart !== undefined) updates.scheduleStart = cfg.scheduleStart;
        if (cfg.scheduleEnd !== undefined) updates.scheduleEnd = cfg.scheduleEnd;
        if (cfg.smartSizing !== undefined) updates.smartSizing = cfg.smartSizing;
        if (cfg.smartSizingThreshold !== undefined) updates.smartSizingThreshold = cfg.smartSizingThreshold;

        await db.update(botConfigurations).set(updates).where(eq(botConfigurations.id, existing.id));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("toggle-bot-active", async (data: { walletAddress: string; isActive: boolean }, ack?: (res: any) => void) => {
      try {
        const [cfg] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        if (!cfg) { ack?.({ success: false, error: "No bot configuration found" }); return; }
        if (data.isActive && !cfg.sessionSignerEnabled) { ack?.({ success: false, error: "Enable session signer first" }); return; }
        if (data.isActive && (!cfg.budgetLimit || cfg.budgetLimit <= 0)) { ack?.({ success: false, error: "Set a budget limit first" }); return; }
        await db.update(botConfigurations).set({ isActive: data.isActive, lastUpdated: Date.now() }).where(eq(botConfigurations.id, cfg.id));
        ack?.({ success: true, data: { isActive: data.isActive } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("update-session-signer", async (data: { walletAddress: string; enabled: boolean }, ack?: (res: any) => void) => {
      try {
        const updates: Record<string, any> = { sessionSignerEnabled: data.enabled, lastUpdated: Date.now() };
        if (!data.enabled) updates.isActive = false;
        await db.update(botConfigurations).set(updates).where(eq(botConfigurations.walletAddress, data.walletAddress));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("refill-budget", async (data: { walletAddress: string; additionalBudget: number; transactionSignature: string }, ack?: (res: any) => void) => {
      try {
        const [cfg] = await db.select().from(botConfigurations).where(eq(botConfigurations.walletAddress, data.walletAddress)).limit(1);
        if (!cfg) { ack?.({ success: false, error: "No bot configuration found" }); return; }
        const newBudget = (cfg.budgetLimit || 0) + data.additionalBudget;
        await db.update(botConfigurations).set({ budgetLimit: newBudget, lastUpdated: Date.now() }).where(eq(botConfigurations.id, cfg.id));
        ack?.({ success: true, data: { newBudget } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // PUSH NOTIFICATION HANDLERS
    // ==========================================

    // Aliases: frontend uses "push-subscribe", "push-unsubscribe", "link-push-wallet", "get-subscription-count"
    socket.on("push-subscribe", async (data: { endpoint: string; p256dh: string; auth: string; walletAddress?: string; userAgent?: string }, ack?: (res: any) => void) => {
      try {
        const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint)).limit(1);
        if (existing) {
          await db.update(pushSubscriptions).set({ p256dh: data.p256dh, auth: data.auth, walletAddress: data.walletAddress, userAgent: data.userAgent, isActive: true }).where(eq(pushSubscriptions.id, existing.id));
        } else {
          await db.insert(pushSubscriptions).values({ endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, walletAddress: data.walletAddress, userAgent: data.userAgent, createdAt: Date.now(), isActive: true });
        }
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("push-unsubscribe", async (data: { endpoint: string }, ack?: (res: any) => void) => {
      try {
        await db.update(pushSubscriptions).set({ isActive: false }).where(eq(pushSubscriptions.endpoint, data.endpoint));
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("link-push-wallet", async (data: { endpoint: string; walletAddress: string }, ack?: (res: any) => void) => {
      try {
        await db.update(pushSubscriptions).set({ walletAddress: data.walletAddress }).where(eq(pushSubscriptions.endpoint, data.endpoint));
        ack?.({ success: true });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });
    socket.on("get-subscription-count", async (_data: any, ack?: (res: any) => void) => {
      try {
        const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.isActive, true));
        ack?.({ success: true, data: { count: subs.length } });
      } catch (error: any) { ack?.({ success: false, error: error.message }); }
    });

    socket.on("subscribe-push", async (data: { endpoint: string; p256dh: string; auth: string; walletAddress?: string; userAgent?: string }, ack?: (res: any) => void) => {
      try {
        const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint)).limit(1);
        if (existing) {
          await db.update(pushSubscriptions).set({ p256dh: data.p256dh, auth: data.auth, walletAddress: data.walletAddress, userAgent: data.userAgent, isActive: true }).where(eq(pushSubscriptions.id, existing.id));
          ack?.({ success: true, data: { updated: true } });
        } else {
          await db.insert(pushSubscriptions).values({ endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, walletAddress: data.walletAddress, userAgent: data.userAgent, createdAt: Date.now(), isActive: true });
          ack?.({ success: true, data: { updated: false } });
        }
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("unsubscribe-push", async (data: { endpoint: string }, ack?: (res: any) => void) => {
      try {
        await db.update(pushSubscriptions).set({ isActive: false }).where(eq(pushSubscriptions.endpoint, data.endpoint));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("link-wallet-push", async (data: { endpoint: string; walletAddress: string }, ack?: (res: any) => void) => {
      try {
        await db.update(pushSubscriptions).set({ walletAddress: data.walletAddress }).where(eq(pushSubscriptions.endpoint, data.endpoint));
        ack?.({ success: true });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    socket.on("get-push-subscription-count", async (_data: any, ack?: (res: any) => void) => {
      try {
        const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.isActive, true));
        ack?.({ success: true, data: { count: subs.length } });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // NOTIFICATION HANDLER
    // ==========================================

    socket.on("notify-game-created", async (data: any, ack?: (res: any) => void) => {
      try {
        const result = await notifyGameCreated(data);
        ack?.({ success: true, data: result });
      } catch (error: any) {
        ack?.({ success: false, error: error.message });
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
