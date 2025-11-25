/**
 * HTTP Routes for Helius Webhooks
 *
 * Receives blockchain events from Helius and updates gameRoundStates
 *
 * Helius Webhook Documentation: https://docs.helius.dev/webhooks-and-websockets/webhooks
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Helius Webhook Handler
 *
 * Receives POST requests from Helius when program events occur
 *
 * Expected payload structure from Helius:
 * {
 *   type: "ENHANCED" | "RAW",
 *   signature: string,
 *   slot: number,
 *   timestamp: number,
 *   events: {
 *     [eventName: string]: any
 *   },
 *   nativeTransfers: [...],
 *   tokenTransfers: [...],
 *   accountData: [...]
 * }
 */
http.route({
  path: "/helius-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Parse webhook payload
      const payload = await request.json();

      console.log("[Helius Webhook] Received webhook:", {
        signature: payload.signature,
        type: payload.type,
        timestamp: payload.timestamp,
      });

      // Verify this is a transaction for our program
      if (!payload.signature) {
        console.warn("[Helius Webhook] No signature in payload");
        return new Response(JSON.stringify({ success: false, error: "No signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Process the transaction using internal action
      await ctx.runAction(internal.heliusWebhookHandler.processTransaction, {
        signature: payload.signature,
        slot: payload.slot || 0,
        timestamp: payload.timestamp || Date.now(),
        events: payload.events || {},
        accountData: payload.accountData || [],
      });

      console.log(`[Helius Webhook] ✅ Processed transaction: ${payload.signature}`);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[Helius Webhook] Error processing webhook:", error);

      // Return 200 anyway to prevent Helius from retrying
      // (log error for manual investigation)
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

/**
 * Health Check Endpoint
 * For monitoring and verifying webhook setup
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (_ctx, _request) => {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "domin8-helius-webhook",
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }),
});

export default http;
