/**
 * CHOP Bot Detection System
 * Analyzes player input patterns to detect automated play
 *
 * Detection signals:
 * 1. Inhuman reaction times (< 50ms consistently)
 * 2. Perfect timing variance (bots have unnaturally consistent timing)
 * 3. No reaction time variation based on branch side changes
 * 4. Suspiciously high scores with perfect play
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Bot detection thresholds
const MIN_HUMAN_REACTION_MS = 80; // Fastest human reaction ~80ms
const SUSPICIOUS_AVG_REACTION_MS = 120; // If avg below this, suspicious
const SUSPICIOUS_MIN_VARIANCE = 15; // Humans have natural variance > 15ms std dev
const PERFECT_TIMING_WINDOW = 30; // Chops within 30ms of each other = "perfect"
const HIGH_PERFECT_RATIO = 0.7; // If 70%+ chops are "perfect", suspicious

interface InputData {
  t: number;
  s: string;
}

interface AnalysisResult {
  isSuspicious: boolean;
  confidence: number;
  reason: string;
  avgReactionTime: number;
  minReactionTime: number;
  timingVariance: number;
  perfectChops: number;
  totalChops: number;
}

/**
 * Analyze input patterns for bot-like behavior
 */
function analyzeInputs(inputs: InputData[]): AnalysisResult {
  if (inputs.length < 10) {
    return {
      isSuspicious: false,
      confidence: 0,
      reason: "insufficient_data",
      avgReactionTime: 0,
      minReactionTime: 0,
      timingVariance: 0,
      perfectChops: 0,
      totalChops: inputs.length,
    };
  }

  // Calculate time deltas between chops
  const deltas: number[] = [];
  for (let i = 1; i < inputs.length; i++) {
    deltas.push(inputs[i].t - inputs[i - 1].t);
  }

  // Basic stats
  const avgReaction = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const minReaction = Math.min(...deltas);

  // Variance (standard deviation)
  const variance = Math.sqrt(
    deltas.reduce((sum, d) => sum + Math.pow(d - avgReaction, 2), 0) / deltas.length
  );

  // Count "perfect" chops (very consistent timing)
  let perfectChops = 0;
  for (let i = 1; i < deltas.length; i++) {
    if (Math.abs(deltas[i] - deltas[i - 1]) < PERFECT_TIMING_WINDOW) {
      perfectChops++;
    }
  }
  const perfectRatio = perfectChops / deltas.length;

  // Score suspicion factors
  let suspicionScore = 0;
  const reasons: string[] = [];

  // Check 1: Inhuman minimum reaction time
  if (minReaction < MIN_HUMAN_REACTION_MS) {
    suspicionScore += 30;
    reasons.push("inhuman_speed");
  }

  // Check 2: Suspiciously fast average
  if (avgReaction < SUSPICIOUS_AVG_REACTION_MS) {
    suspicionScore += 25;
    reasons.push("fast_average");
  }

  // Check 3: Too little variance (bot-like consistency)
  if (variance < SUSPICIOUS_MIN_VARIANCE) {
    suspicionScore += 30;
    reasons.push("low_variance");
  }

  // Check 4: High ratio of perfect timing
  if (perfectRatio > HIGH_PERFECT_RATIO) {
    suspicionScore += 25;
    reasons.push("perfect_timing");
  }

  return {
    isSuspicious: suspicionScore >= 50,
    confidence: Math.min(suspicionScore, 100),
    reason: reasons.join(",") || "clean",
    avgReactionTime: avgReaction,
    minReactionTime: minReaction,
    timingVariance: variance,
    perfectChops,
    totalChops: inputs.length,
  };
}

/**
 * Daily cron job to analyze recent solo sessions for bot activity
 */
export const analyzeRecentSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get sessions from last 24 hours that have ended
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const sessions = await ctx.db
      .query("chopSoloSessions")
      .filter((q) =>
        q.and(
          q.eq(q.field("isActive"), false),
          q.gte(q.field("endedAt"), oneDayAgo)
        )
      )
      .collect();

    let flaggedCount = 0;

    for (const session of sessions) {
      // Skip if already analyzed
      const existingFlag = await ctx.db
        .query("chopBotDetection")
        .withIndex("by_session", (q) => q.eq("sessionId", session.sessionId))
        .first();

      if (existingFlag) continue;

      // Skip sessions with no games
      if (!session.games || session.games.length === 0) continue;

      // Analyze all games in the session
      // Combine all inputs from all games for analysis
      const allInputs: InputData[] = [];
      for (const game of session.games) {
        if (game.inputs && game.inputs.length > 0) {
          allInputs.push(...game.inputs);
        }
      }

      // Need at least 10 inputs for meaningful analysis
      if (allInputs.length < 10) continue;

      // Analyze inputs
      const analysis = analyzeInputs(allInputs);

      // Flag suspicious sessions
      if (analysis.isSuspicious) {
        await ctx.db.insert("chopBotDetection", {
          walletAddress: session.walletAddress,
          sessionId: session.sessionId,
          flaggedAt: Date.now(),
          reason: analysis.reason,
          confidence: analysis.confidence,
          analyzed: false,
          avgReactionTime: analysis.avgReactionTime,
          minReactionTime: analysis.minReactionTime,
          timingVariance: analysis.timingVariance,
          perfectChops: analysis.perfectChops,
        });
        flaggedCount++;
      }
    }

    return { sessionsAnalyzed: sessions.length, flagged: flaggedCount };
  },
});

/**
 * Get flagged accounts for admin review
 */
export const getFlaggedAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("chopBotDetection")
      .withIndex("by_analyzed", (q) => q.eq("analyzed", false))
      .order("desc")
      .take(50);
  },
});

/**
 * Mark a flag as reviewed
 */
export const reviewFlag = internalMutation({
  args: {
    sessionId: v.string(),
    action: v.string(), // "banned" | "cleared"
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query("chopBotDetection")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!flag) return null;

    await ctx.db.patch(flag._id, {
      analyzed: true,
      action: args.action,
    });

    return true;
  },
});
