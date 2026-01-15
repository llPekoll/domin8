import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// Constants
const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_MS = 3000; // 3 seconds between messages
const MAX_MESSAGES_TO_FETCH = 50;

/**
 * Get recent chat messages (last 50)
 * Used by the ChatPanel component for real-time updates
 */
export const getRecentMessages = query({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_timestamp")
      .order("desc")
      .take(MAX_MESSAGES_TO_FETCH);

    // Return in chronological order (oldest first)
    return messages.reverse();
  },
});

/**
 * Send a chat message
 * Includes rate limiting and message length validation
 */
export const sendMessage = mutation({
  args: {
    walletAddress: v.string(),
    message: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { walletAddress, message, displayName } = args;

    // Validate message length
    if (message.length === 0) {
      throw new Error("Message cannot be empty");
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    }

    // Rate limiting: check last message from this wallet
    const lastMessage = await ctx.db
      .query("chatMessages")
      .withIndex("by_sender_and_time", (q) => q.eq("senderWallet", walletAddress))
      .order("desc")
      .first();

    if (lastMessage) {
      const timeSinceLastMessage = Date.now() - lastMessage.timestamp;
      if (timeSinceLastMessage < RATE_LIMIT_MS) {
        const waitTime = Math.ceil((RATE_LIMIT_MS - timeSinceLastMessage) / 1000);
        throw new Error(`Please wait ${waitTime} seconds before sending another message`);
      }
    }

    // Insert the message
    const messageId = await ctx.db.insert("chatMessages", {
      senderWallet: walletAddress,
      senderName: displayName?.trim() || undefined,
      message: message.trim(),
      type: "user",
      timestamp: Date.now(),
    });

    return messageId;
  },
});

/**
 * Announce a winner in chat (internal - called by game scheduler)
 * Used for both Domin8 and 1v1 winners
 */
export const announceWinner = internalMutation({
  args: {
    winnerWallet: v.string(),
    winnerName: v.optional(v.string()),
    prizeAmount: v.number(), // In SOL
    gameType: v.string(), // "domin8" | "1v1"
    loserName: v.optional(v.string()), // Only for 1v1
  },
  handler: async (ctx, args) => {
    const { winnerWallet, winnerName, prizeAmount, gameType, loserName } = args;

    // Format winner display name
    const displayName =
      winnerName || `${winnerWallet.slice(0, 4)}...${winnerWallet.slice(-4)}`;

    // Format prize amount (show up to 4 decimal places, trim trailing zeros)
    const formattedPrize = prizeAmount.toFixed(4).replace(/\.?0+$/, "");

    // Build announcement message
    let message: string;
    if (gameType === "1v1") {
      const loserDisplay = loserName || "opponent";
      message = `${displayName} beat ${loserDisplay} for ${formattedPrize} SOL!`;
    } else {
      message = `${displayName} won ${formattedPrize} SOL in Domin8!`;
    }

    // Insert winner announcement
    await ctx.db.insert("chatMessages", {
      senderWallet: undefined, // System message
      senderName: undefined,
      message,
      type: "winner",
      gameType,
      timestamp: Date.now(),
    });
  },
});

/**
 * Clean up old chat messages (older than 24 hours)
 * Called by cron job to prevent database bloat
 */
export const cleanupOldMessages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const oldMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_timestamp")
      .filter((q) => q.lt(q.field("timestamp"), cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const message of oldMessages) {
      await ctx.db.delete(message._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});
