/**
 * Convex backend for CHOP Solo Mode
 * Pay 0.1 SOL to start, pay to continue on death
 *
 * Flow:
 * 1. User pays 0.1 SOL to treasury (wallet-to-wallet)
 * 2. Frontend calls startSoloSessionVerified action with TX signature
 * 3. Backend verifies TX via RPC before creating session
 * 4. User plays until death
 * 5. On death: pay to continue (verified) OR end session
 * 6. High scores tracked on leaderboard
 *
 * NOTE: Actions are in chopSoloActions.ts (Convex requires separate files for "use node")
 */

import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Pricing in lamports
export const SOLO_START_PRICE = 100_000_000; // 0.1 SOL

// Continue price scales aggressively
// Continue 1: 0.01 SOL
// Continue 2: 0.05 SOL
// Continue 3: 0.15 SOL
// Continue 4: 0.4 SOL
// Continue 5: 1.0 SOL
// Continue 6: 2.5 SOL
const CONTINUE_PRICES_SOL = [0.01, 0.05, 0.15, 0.4, 1, 2.5, 6, 15, 40, 100];

export function calculateContinuePrice(continueCount: number): number {
  const priceSOL = CONTINUE_PRICES_SOL[continueCount] || CONTINUE_PRICES_SOL[CONTINUE_PRICES_SOL.length - 1];
  return Math.floor(priceSOL * 1_000_000_000); // Convert to lamports
}

// Treasury wallet for solo mode payments
export const SOLO_TREASURY = "FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get active solo session for a wallet
 */
export const getActiveSession = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_wallet_active", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("isActive", true)
      )
      .first();

    return session;
  },
});

/**
 * Get solo leaderboard (top scores)
 */
export const getSoloLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const entries = await ctx.db
      .query("chopSoloLeaderboard")
      .withIndex("by_high_score")
      .order("desc")
      .take(limit);

    return entries;
  },
});

/**
 * Get player's solo stats
 */
export const getPlayerSoloStats = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("chopSoloLeaderboard")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", args.walletAddress))
      .first();

    return stats;
  },
});

/**
 * Calculate continue price based on continue count (exponential)
 */
export const getContinuePrice = query({
  args: {
    continueCount: v.number(),
  },
  handler: async (_ctx, args) => {
    return calculateContinuePrice(args.continueCount);
  },
});

/**
 * Get the next N branches for a solo session (anti-cheat: only reveals limited ahead)
 * Returns branches from current position + lookAhead
 */
export const getNextBranches = query({
  args: {
    sessionId: v.string(),
    lookAhead: v.optional(v.number()), // How many branches to reveal (default 3)
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || !session.branchPattern) {
      return null;
    }

    const lookAhead = args.lookAhead || 3;
    const currentIndex = session.currentPatternIndex || 0;
    const pattern = session.branchPattern;

    // Return only the next N branches
    const branches: string[] = [];
    for (let i = 0; i < lookAhead; i++) {
      const idx = (currentIndex + i) % pattern.length;
      branches.push(pattern[idx]);
    }

    return {
      branches,
      currentIndex,
    };
  },
});

// ============================================================================
// INTERNAL QUERIES (for actions in chopSoloActions.ts)
// ============================================================================

export const checkTxUsed = internalQuery({
  args: { txSignature: v.string() },
  handler: async (ctx, args) => {
    // Check in start payments
    const startTx = await ctx.db
      .query("chopSoloSessions")
      .filter((q) => q.eq(q.field("startPaymentTx"), args.txSignature))
      .first();

    if (startTx) return true;

    // Check in continue payments - we need to search all sessions
    const sessions = await ctx.db.query("chopSoloSessions").collect();
    for (const session of sessions) {
      if (session.continuePaymentTxs.includes(args.txSignature)) {
        return true;
      }
    }

    return false;
  },
});

export const checkContinueTxUsed = internalQuery({
  args: { txSignature: v.string() },
  handler: async (ctx, args) => {
    // Check all sessions for this TX in continue payments
    const sessions = await ctx.db.query("chopSoloSessions").collect();
    for (const session of sessions) {
      if (session.continuePaymentTxs.includes(args.txSignature)) {
        return true;
      }
    }
    return false;
  },
});

export const getActiveSessionInternal = internalQuery({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_wallet_active", (q) =>
        q.eq("walletAddress", args.walletAddress).eq("isActive", true)
      )
      .first();
  },
});

export const getSessionByIdInternal = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

// ============================================================================
// INTERNAL MUTATIONS (called by actions after verification)
// ============================================================================

/**
 * Generate a random branch pattern (server-side)
 * Same logic as client but generated on backend for anti-cheat
 */
function generateBranchPattern(): string[] {
  const pattern: string[] = [];
  let lastBranch = "";

  // First 2 segments safe (no branches)
  pattern.push("");
  pattern.push("");

  for (let i = 2; i < 500; i++) {
    if (Math.random() < 0.6) {
      // 60% chance of branch
      if (lastBranch === "l") {
        pattern.push(Math.random() < 0.7 ? "r" : "l");
      } else if (lastBranch === "r") {
        pattern.push(Math.random() < 0.7 ? "l" : "r");
      } else {
        pattern.push(Math.random() < 0.5 ? "l" : "r");
      }
      lastBranch = pattern[pattern.length - 1];
    } else {
      pattern.push("");
      lastBranch = "";
    }
  }

  return pattern;
}

// Number of lives per payment
const LIVES_PER_PAYMENT = 10;

export const createSoloSession = internalMutation({
  args: {
    walletAddress: v.string(),
    paymentTxSignature: v.string(),
    amountPaid: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionId = `solo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Generate server-side branch pattern (anti-cheat)
    const branchPattern = generateBranchPattern();

    const id = await ctx.db.insert("chopSoloSessions", {
      walletAddress: args.walletAddress,
      sessionId,
      startedAt: Date.now(),
      isActive: true,
      currentScore: 0,
      highScore: 0,
      continueCount: 0,
      totalPaid: args.amountPaid,
      livesRemaining: LIVES_PER_PAYMENT, // Start with 10 lives
      gamesPlayed: 0,
      startPaymentTx: args.paymentTxSignature,
      continuePaymentTxs: [],
      branchPattern,
      currentPatternIndex: 0,
      games: [],
      currentGameInputs: [],
      currentGameStartedAt: Date.now(),
    });

    const session = await ctx.db.get(id);
    return { sessionId, session, livesRemaining: LIVES_PER_PAYMENT };
  },
});

export const processContinue = internalMutation({
  args: {
    sessionId: v.string(),
    paymentTxSignature: v.string(),
    amountPaid: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || !session.isActive) {
      throw new Error("Session not found or not active");
    }

    // Refill lives on continue payment
    await ctx.db.patch(session._id, {
      continueCount: session.continueCount + 1,
      totalPaid: session.totalPaid + args.amountPaid,
      continuePaymentTxs: [...session.continuePaymentTxs, args.paymentTxSignature],
      livesRemaining: LIVES_PER_PAYMENT, // Refill to 10 lives
      currentGameInputs: [], // Reset inputs for new game
      currentGameStartedAt: Date.now(),
    });

    return {
      sessionId: session.sessionId,
      currentScore: session.currentScore,
      continueCount: session.continueCount + 1,
      livesRemaining: LIVES_PER_PAYMENT,
    };
  },
});

// ============================================================================
// PUBLIC MUTATIONS (no payment verification needed)
// ============================================================================

/**
 * Record a chop input for bot detection analysis
 * NOTE: Game validation still happens client-side for responsiveness
 * Server records inputs to analyze for bot patterns later
 */
export const recordChop = mutation({
  args: {
    sessionId: v.string(),
    side: v.string(), // "l" or "r"
    timestamp: v.number(), // ms from game start
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || !session.isActive) {
      return { success: false, error: "Session not active" };
    }

    // Record input for current game (for bot detection)
    const currentInputs = session.currentGameInputs || [];
    currentInputs.push({ t: args.timestamp, s: args.side });

    await ctx.db.patch(session._id, {
      currentGameInputs: currentInputs,
    });

    return { success: true };
  },
});

/**
 * Update score during gameplay (legacy - kept for compatibility)
 */
export const updateSoloScore = mutation({
  args: {
    sessionId: v.string(),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || !session.isActive) {
      return null;
    }

    await ctx.db.patch(session._id, {
      currentScore: args.score,
      highScore: Math.max(session.highScore, args.score),
    });

    return true;
  },
});

/**
 * Record death - decrements lives, stores game history, updates leaderboard
 * Returns: livesRemaining, continuePrice (if no lives left)
 */
export const recordSoloDeath = mutation({
  args: {
    sessionId: v.string(),
    finalScore: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || !session.isActive) {
      return null;
    }

    const newHighScore = Math.max(session.highScore, args.finalScore);
    // Default to 10 lives if not set (for sessions created before this field existed)
    const currentLives = session.livesRemaining ?? 10;
    const livesRemaining = currentLives - 1;
    const gamesPlayed = (session.gamesPlayed || 0) + 1;

    // Store completed game with inputs for bot detection
    const games = session.games || [];
    games.push({
      gameNumber: gamesPlayed,
      score: args.finalScore,
      startedAt: session.currentGameStartedAt || session.startedAt,
      endedAt: Date.now(),
      inputs: session.currentGameInputs || [],
    });

    // Update session
    await ctx.db.patch(session._id, {
      currentScore: 0, // Reset for next game
      highScore: newHighScore,
      livesRemaining,
      gamesPlayed,
      games,
      currentGameInputs: [], // Clear for next game
      currentGameStartedAt: Date.now(), // Ready for next game
    });

    // Update leaderboard immediately on death
    const existingStats = await ctx.db
      .query("chopSoloLeaderboard")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", session.walletAddress))
      .first();

    if (existingStats) {
      if (newHighScore > existingStats.highScore) {
        await ctx.db.patch(existingStats._id, {
          highScore: newHighScore,
          lastPlayedAt: Date.now(),
        });
      }
    } else {
      await ctx.db.insert("chopSoloLeaderboard", {
        walletAddress: session.walletAddress,
        highScore: newHighScore,
        totalGames: 0,
        totalContinues: 0,
        totalSpent: 0,
        lastPlayedAt: Date.now(),
      });
    }

    // Always calculate continue price (user can always choose to pay to continue)
    const continuePrice = calculateContinuePrice(session.continueCount);

    return {
      sessionId: session.sessionId,
      finalScore: args.finalScore,
      highScore: newHighScore,
      livesRemaining,
      continuePrice,
      continueCount: session.continueCount,
      needsPayment: livesRemaining <= 0,
    };
  },
});

/**
 * End solo session (user chose not to continue)
 */
export const endSoloSession = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chopSoloSessions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      return null;
    }

    // Mark session as ended
    await ctx.db.patch(session._id, {
      isActive: false,
      endedAt: Date.now(),
    });

    // Update all-time leaderboard
    const existingStats = await ctx.db
      .query("chopSoloLeaderboard")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", session.walletAddress))
      .first();

    if (existingStats) {
      await ctx.db.patch(existingStats._id, {
        highScore: Math.max(existingStats.highScore, session.highScore),
        totalGames: existingStats.totalGames + 1,
        totalContinues: existingStats.totalContinues + session.continueCount,
        totalSpent: existingStats.totalSpent + session.totalPaid,
        lastPlayedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("chopSoloLeaderboard", {
        walletAddress: session.walletAddress,
        highScore: session.highScore,
        totalGames: 1,
        totalContinues: session.continueCount,
        totalSpent: session.totalPaid,
        lastPlayedAt: Date.now(),
      });
    }

    return {
      finalScore: session.highScore,
      totalPaid: session.totalPaid,
      continueCount: session.continueCount,
    };
  },
});
