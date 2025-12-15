/**
 * Notifications Service
 *
 * Sends game event notifications directly to Discord and Telegram.
 * Notifies players when games start and when winners are announced.
 */
"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Discord and Telegram webhook URLs (set in Convex environment variables)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message to Discord via webhook
 */
async function sendDiscordNotification(embed: {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("[Discord] Webhook URL not configured, skipping");
    return false;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      console.error(`[Discord] HTTP error: ${response.status} ${response.statusText}`);
      return false;
    }

    console.log("[Discord] ✅ Notification sent successfully");
    return true;
  } catch (error) {
    console.error("[Discord] Error sending notification:", error);
    return false;
  }
}

/**
 * Send a message to Telegram via Bot API
 */
async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Bot token or chat ID not configured, skipping");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[Telegram] HTTP error: ${response.status} ${errorData}`);
      return false;
    }

    console.log("[Telegram] ✅ Notification sent successfully");
    return true;
  } catch (error) {
    console.error("[Telegram] Error sending notification:", error);
    return false;
  }
}

/**
 * Format SOL amount for display
 */
function formatSol(lamports: number): string {
  return (lamports / 1e9).toFixed(3);
}

/**
 * Truncate wallet address for display
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

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
    // Only send webhooks on mainnet
    const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT || "";
    const isMainnet = rpcEndpoint.includes("mainnet");

    if (!isMainnet) {
      console.log("[Webhook] Skipping notification (not mainnet)");
      return { success: true, skipped: true };
    }

    const potInSol = formatSol(args.totalPot);
    const displayName = args.creatorDisplayName || truncateAddress(args.creatorAddress);
    const timeRemaining = Math.max(0, Math.floor((args.endTimestamp * 1000 - Date.now()) / 1000));

    // Send Discord notification
    const discordSent = await sendDiscordNotification({
      title: "🎮 New Game Started!",
      description: `**${displayName}** just started a new battle!`,
      color: 0x00ff00, // Green
      fields: [
        { name: "💰 Initial Pot", value: `${potInSol} SOL`, inline: true },
        { name: "🎯 Round", value: `#${args.roundId}`, inline: true },
        { name: "⏱️ Time Left", value: `${timeRemaining}s`, inline: true },
      ],
      footer: { text: "Join now at domin8.fun" },
    });

    // Send Telegram notification
    const telegramMessage = `
🎮 <b>New Game Started!</b>

<b>${displayName}</b> just started a new battle!

💰 Initial Pot: <b>${potInSol} SOL</b>
🎯 Round: #${args.roundId}
⏱️ Time Left: ${timeRemaining}s

🔥 Join now at domin8.fun
    `.trim();

    const telegramSent = await sendTelegramNotification(telegramMessage);

    console.log(
      `[Webhook] Game creation notification - Discord: ${discordSent}, Telegram: ${telegramSent}`
    );

    return {
      success: discordSent || telegramSent,
      discord: discordSent,
      telegram: telegramSent,
    };
  },
});

/**
 * Send game winner webhook notification
 * Called by game scheduler after winner is determined
 *
 * @param roundId - The round ID of the completed game
 * @param winnerWalletAddress - Winner's wallet address
 * @param betAmount - Amount the winner bet in lamports
 * @param totalPot - Total pot in lamports
 * @param participantCount - Number of participants in the game
 */
export const notifyGameWinner = internalAction({
  args: {
    roundId: v.number(),
    winnerWalletAddress: v.string(),
    betAmount: v.number(),
    totalPot: v.number(),
    participantCount: v.number(),
  },
  handler: async (ctx, args) => {
    // Only send webhooks on mainnet
    const rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT || "";
    const isMainnet = rpcEndpoint.includes("mainnet");

    if (!isMainnet) {
      console.log("[Webhook] Skipping notification (not mainnet)");
      return { success: true, skipped: true };
    }

    // Get winner display name from players table
    const winnerDisplayName = await ctx.runQuery(internal.players.getPlayerDisplayNameInternal, {
      walletAddress: args.winnerWalletAddress,
    });

    const displayName = winnerDisplayName || truncateAddress(args.winnerWalletAddress);
    const prizeInSol = formatSol(args.totalPot * 0.95); // 95% to winner
    const betInSol = formatSol(args.betAmount);
    const isSoloGame = args.participantCount === 1;

    // Calculate multiplier (prize / bet)
    const multiplier = isSoloGame ? 1 : (args.totalPot * 0.95) / args.betAmount;

    // Send Discord notification
    const discordSent = await sendDiscordNotification({
      title: "🏆 Winner Announced!",
      description: isSoloGame
        ? `**${displayName}** played solo and got their bet back!`
        : `**${displayName}** won the battle!`,
      color: 0xffd700, // Gold
      fields: [
        { name: "💎 Prize", value: `${prizeInSol} SOL`, inline: true },
        { name: "🎲 Their Bet", value: `${betInSol} SOL`, inline: true },
        { name: "📈 Multiplier", value: `${multiplier.toFixed(2)}x`, inline: true },
        { name: "👥 Players", value: `${args.participantCount}`, inline: true },
        { name: "🎯 Round", value: `#${args.roundId}`, inline: true },
      ],
      footer: { text: "Congratulations! Play again at domin8.fun" },
    });

    // Send Telegram notification
    const telegramMessage = isSoloGame
      ? `
🏆 <b>Game Ended!</b>

<b>${displayName}</b> played solo and got their bet back!

💎 Refund: <b>${betInSol} SOL</b>
🎯 Round: #${args.roundId}

🎮 Join the next game at domin8.fun
      `.trim()
      : `
🏆 <b>Winner Announced!</b>

<b>${displayName}</b> won the battle!

💎 Prize: <b>${prizeInSol} SOL</b>
🎲 Their Bet: ${betInSol} SOL
📈 Multiplier: ${multiplier.toFixed(2)}x
👥 Players: ${args.participantCount}
🎯 Round: #${args.roundId}

🎮 Join the next game at domin8.fun
      `.trim();

    const telegramSent = await sendTelegramNotification(telegramMessage);

    console.log(
      `[Webhook] Game winner notification - Discord: ${discordSent}, Telegram: ${telegramSent}`
    );

    return {
      success: discordSent || telegramSent,
      discord: discordSent,
      telegram: telegramSent,
    };
  },
});
