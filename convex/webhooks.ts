/**
 * Webhook Notifications Service
 * 
 * Provides Convex actions for sending webhook notifications to external services.
 * Called by frontend immediately after successful transactions for real-time notifications.
 */
"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";

const WEBHOOK_WINNER_URL = "https://n8n.gravity5.pro/webhook/a57222b5-41ad-4d23-8c05-2e82164a6f15";

const WEBHOOK_GAME_CREATED_URL = "https://n8n.gravity5.pro/webhook/prochain-combat";
/**
 * Send game creation webhook notification
 * Called by frontend immediately after successful game creation transaction
 * 
 * @param roundId - The round ID of the newly created game
 * @param transactionSignature - Solana transaction signature
 * @param startTimestamp - Game start timestamp (seconds)
 * @param endTimestamp - Game end timestamp (seconds)
 * @param totalPot - Total pot in lamports
 * @param creator - Wallet address of the game creator
 * @param map - Map ID used in the game
 */
export const notifyGameCreated = action({
  args: {
    roundId: v.number(),
    transactionSignature: v.string(),
    startTimestamp: v.number(),
    endTimestamp: v.number(),
    totalPot: v.number(),
    creatorAddress: v.string(),
    creatorDisplayName: v.string(),
    map: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    console.log(`[Webhook] Sending game creation notification for round ${args.roundId}`);

    try {
      const webhookData = {
        eventType: "game_created",
        roundId: args.roundId,
        transactionSignature: args.transactionSignature,
        startTimestamp: args.startTimestamp,
        endTimestamp: args.endTimestamp,
        betCount: 1, // First bet always creates the game
        totalPot: args.totalPot / 1e9, // Convert lamports to SOL
        creatorAddress: args.creatorAddress,
        creatorDisplayName: args.creatorDisplayName,
        map: args.map ?? 0,
        timestamp: Date.now(),
      };

      console.log(`[Webhook] Payload:`, webhookData);

      const response = await fetch(WEBHOOK_GAME_CREATED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookData),
      });

      if (!response.ok) {
        console.error(`[Webhook] HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`Webhook failed: ${response.status}`);
      }

      console.log(`[Webhook] ✅ Game creation notification sent successfully for round ${args.roundId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Webhook] Error sending game creation notification:`, error);
      // Don't throw - we don't want webhook failures to break the frontend
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  },
});
