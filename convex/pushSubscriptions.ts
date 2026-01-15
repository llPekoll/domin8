/**
 * Push Subscriptions - Manage PWA push notification subscriptions
 *
 * Allows users to subscribe/unsubscribe from push notifications
 * Notifications are sent when new games start
 */
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Subscribe to push notifications
 * Creates or updates a push subscription for the user
 */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    walletAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if subscription already exists (by endpoint)
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      // Update existing subscription
      await ctx.db.patch(existing._id, {
        p256dh: args.p256dh,
        auth: args.auth,
        walletAddress: args.walletAddress,
        userAgent: args.userAgent,
        isActive: true,
      });
      return { success: true, subscriptionId: existing._id, updated: true };
    }

    // Create new subscription
    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      walletAddress: args.walletAddress,
      userAgent: args.userAgent,
      createdAt: Date.now(),
      isActive: true,
    });

    return { success: true, subscriptionId, updated: false };
  },
});

/**
 * Unsubscribe from push notifications
 * Marks subscription as inactive (soft delete)
 */
export const unsubscribe = mutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription) {
      await ctx.db.patch(subscription._id, { isActive: false });
      return { success: true };
    }

    return { success: false, error: "Subscription not found" };
  },
});

/**
 * Check if user is subscribed to push notifications
 */
export const isSubscribed = query({
  args: {
    endpoint: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.endpoint) {
      const endpoint = args.endpoint;
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .first();
      return subscription?.isActive ?? false;
    }

    if (args.walletAddress) {
      const walletAddress = args.walletAddress;
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_wallet", (q) => q.eq("walletAddress", walletAddress))
        .first();
      return subscription?.isActive ?? false;
    }

    return false;
  },
});

/**
 * Get all active subscriptions (internal use only)
 * Used by push notification sender
 */
export const getAllActiveSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return subscriptions.map((sub) => ({
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    }));
  },
});

/**
 * Mark subscription as inactive (called when push fails)
 */
export const markInactive = internalMutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription) {
      await ctx.db.patch(subscription._id, { isActive: false });
    }
  },
});

/**
 * Update last used timestamp for subscription
 */
export const updateLastUsed = internalMutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription) {
      await ctx.db.patch(subscription._id, { lastUsed: Date.now() });
    }
  },
});

/**
 * Link wallet address to existing subscription
 * Called after user logs in
 */
export const linkWallet = mutation({
  args: {
    endpoint: v.string(),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (subscription) {
      await ctx.db.patch(subscription._id, { walletAddress: args.walletAddress });
      return { success: true };
    }

    return { success: false, error: "Subscription not found" };
  },
});

/**
 * Get subscription count (for admin/stats)
 */
export const getSubscriptionCount = query({
  args: {},
  handler: async (ctx) => {
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return subscriptions.length;
  },
});
