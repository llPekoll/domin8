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
      // Debug: Log all headers
      console.log("[Helius Webhook] DEBUG - All request headers:");
      const headersObj: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headersObj[key] = value;
        console.log(`  ${key}: ${value}`);
      });

      // Verify authentication header
      const authHeader = request.headers.get("authorization");
      const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;

      console.log("[Helius Webhook] Auth check:");
      console.log("  Received header:", authHeader);
      console.log("  Expected secret:", expectedSecret);

      if (!expectedSecret) {
        console.error("[Helius Webhook] HELIUS_WEBHOOK_SECRET not configured");
        return new Response(JSON.stringify({ success: false, error: "Server misconfigured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (authHeader !== expectedSecret) {
        console.warn("[Helius Webhook] ⚠️ Unauthorized webhook attempt");
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Parse webhook payload
      const payload = await request.json();

      console.log("[Helius Webhook] DEBUG - Full payload structure:");
      console.log(JSON.stringify(payload, null, 2));

      console.log("[Helius Webhook] Received webhook:", {
        signature: payload.signature,
        type: payload.type,
        timestamp: payload.timestamp,
      });

      // Verify this is a transaction for our program
      if (!payload.signature && !payload[0]?.signature) {
        console.warn("[Helius Webhook] No signature in payload");
        return new Response(JSON.stringify({ success: false, error: "No signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Handle array format (Helius sometimes sends arrays)
      const tx = Array.isArray(payload) ? payload[0] : payload;

      // Log webhook to database (for audit trail and debugging)
      await ctx.runMutation(internal.heliusWebhookMutations.logWebhook, {
        signature: tx.signature,
        timestamp: tx.timestamp || Date.now(),
        slot: tx.slot,
        payload: payload,
      });

      // Process the transaction using internal action
      const result = await ctx.runAction(internal.heliusWebhookHandler.processTransaction, {
        signature: tx.signature,
        slot: tx.slot || 0,
        timestamp: tx.timestamp || Date.now(),
        events: tx.events || {},
        accountData: tx.accountData || [],
      });

      // Update webhook log with processing result
      await ctx.runMutation(internal.heliusWebhookMutations.updateWebhookStatus, {
        signature: tx.signature,
        status: result.success ? "processed" : "failed",
        roundId: result.roundId,
        error: result.error,
      });

      console.log(`[Helius Webhook] ✅ Processed transaction: ${tx.signature}`);

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
