/**
 * Game Scheduler Mutations - Database Operations for Job Tracking
 *
 * These mutations manage the scheduledJobs table to:
 * 1. Track what jobs are scheduled (for debugging)
 * 2. Prevent duplicate scheduling
 * 3. Monitor job completion status
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Save a scheduled job to the database
 * Used for tracking and preventing duplicates
 */
export const saveScheduledJob = internalMutation({
  args: {
    jobId: v.string(),
    roundId: v.number(),
    action: v.string(), // "close_betting" | "check_vrf"
    scheduledTime: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if job already exists (prevent duplicates)
    const existing = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", "pending")
      )
      .filter((q) => q.eq(q.field("action"), args.action))
      .first();

    if (existing) {
      console.log(
        `Job already exists for round ${args.roundId} action ${args.action}, skipping`
      );
      return existing._id;
    }

    // Create new job record
    const jobId = await ctx.db.insert("scheduledJobs", {
      jobId: args.jobId,
      roundId: args.roundId,
      action: args.action,
      scheduledTime: args.scheduledTime,
      status: "pending",
      createdAt: Math.floor(Date.now() / 1000),
    });

    return jobId;
  },
});

/**
 * Mark a job as completed
 */
export const markJobCompleted = internalMutation({
  args: {
    roundId: v.number(),
    action: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the pending job
    const job = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", "pending")
      )
      .filter((q) => q.eq(q.field("action"), args.action))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        status: "completed",
        completedAt: Math.floor(Date.now() / 1000),
      });
    }
  },
});

/**
 * Mark a job as failed
 */
export const markJobFailed = internalMutation({
  args: {
    roundId: v.number(),
    action: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the pending job
    const job = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", "pending")
      )
      .filter((q) => q.eq(q.field("action"), args.action))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        status: "failed",
        completedAt: Math.floor(Date.now() / 1000),
        error: args.error,
      });
    }
  },
});

/**
 * Get active (pending) jobs for a round
 */
export const getActiveJobs = internalMutation({
  args: {
    roundId: v.number(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_round_and_status", (q) =>
        q.eq("roundId", args.roundId).eq("status", "pending")
      )
      .collect();

    return jobs;
  },
});

/**
 * Check if a job is already scheduled for a specific action
 */
export const isJobScheduled = internalMutation({
  args: {
    roundId: v.number(),
    action: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_round_and_status", (q) =>
          q.eq("roundId", args.roundId).eq("status", "pending")
          || q.eq("roundId", args.roundId).eq("status", "completed")
      )
      .filter((q) => q.eq(q.field("action"), args.action))
      .first();

    return job !== null;
  },
});

/**
 * Cleanup old completed/failed jobs (for maintenance)
 * Remove jobs older than 7 days
 */
export const cleanupOldJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    const oldJobs = await ctx.db
      .query("scheduledJobs")
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "pending"),
          q.lt(q.field("createdAt"), sevenDaysAgo)
        )
      )
      .collect();

    for (const job of oldJobs) {
      await ctx.db.delete(job._id);
    }

    return oldJobs.length;
  },
});
