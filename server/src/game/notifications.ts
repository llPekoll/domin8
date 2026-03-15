/**
 * Notification functions - Discord, Telegram, Push
 */
import { config } from "../config.js";

function formatSol(lamports: number): string {
  return (lamports / 1e9).toFixed(3);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Send a message to Discord via webhook
 */
export async function sendDiscordNotification(embed: {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}): Promise<boolean> {
  if (!config.discordWebhookUrl) return false;

  try {
    const response = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      console.error(`[Discord] HTTP error: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Discord] Error:", error);
    return false;
  }
}

/**
 * Send a message to Telegram via Bot API
 */
export async function sendTelegramNotification(message: string): Promise<boolean> {
  if (!config.telegramBotToken || !config.telegramChatId) return false;

  try {
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) return false;
    return true;
  } catch (error) {
    console.error("[Telegram] Error:", error);
    return false;
  }
}

/**
 * Notify game created
 */
export async function notifyGameCreated(args: {
  roundId: number;
  transactionSignature: string;
  startTimestamp: number;
  endTimestamp: number;
  totalPot: number;
  creatorAddress: string;
  creatorDisplayName: string;
  map?: number;
}): Promise<{ success: boolean }> {
  // Only notify on mainnet
  const isMainnet = config.solanaRpcEndpoint.includes("mainnet");
  if (!isMainnet) return { success: true };

  const potInSol = formatSol(args.totalPot);
  const displayName = args.creatorDisplayName || truncateAddress(args.creatorAddress);
  const timeRemaining = Math.max(0, Math.floor((args.endTimestamp * 1000 - Date.now()) / 1000));

  await sendDiscordNotification({
    title: "New Game Started!",
    description: `**${displayName}** just started a new battle!`,
    color: 0x00ff00,
    fields: [
      { name: "Initial Pot", value: `${potInSol} SOL`, inline: true },
      { name: "Round", value: `#${args.roundId}`, inline: true },
      { name: "Time Left", value: `${timeRemaining}s`, inline: true },
    ],
    footer: { text: "Join now at domin8.fun" },
  });

  await sendTelegramNotification(
    `<b>New Game Started!</b>\n\n<b>${displayName}</b> just started a new battle!\n\nInitial Pot: <b>${potInSol} SOL</b>\nRound: #${args.roundId}\nTime Left: ${timeRemaining}s\n\nJoin now at domin8.fun`
  );

  return { success: true };
}

/**
 * Notify game winner
 */
export async function notifyGameWinner(args: {
  roundId: number;
  winnerWalletAddress: string;
  betAmount: number;
  totalPot: number;
  participantCount: number;
}): Promise<{ success: boolean }> {
  const isMainnet = config.solanaRpcEndpoint.includes("mainnet");
  if (!isMainnet) return { success: true };

  const displayName = truncateAddress(args.winnerWalletAddress);
  const isSoloGame = args.participantCount === 1;
  const prizeInSol = formatSol(isSoloGame ? args.totalPot : args.totalPot * 0.95);
  const betInSol = formatSol(args.betAmount);
  const multiplier = isSoloGame ? 1 : (args.totalPot * 0.95) / args.betAmount;

  await sendDiscordNotification({
    title: "Winner Announced!",
    description: isSoloGame
      ? `**${displayName}** played solo and got their bet back!`
      : `**${displayName}** won the battle!`,
    color: 0xffd700,
    fields: [
      { name: "Prize", value: `${prizeInSol} SOL`, inline: true },
      { name: "Their Bet", value: `${betInSol} SOL`, inline: true },
      { name: "Multiplier", value: `${multiplier.toFixed(2)}x`, inline: true },
      { name: "Players", value: `${args.participantCount}`, inline: true },
      { name: "Round", value: `#${args.roundId}`, inline: true },
    ],
    footer: { text: "Play again at domin8.fun" },
  });

  const telegramMsg = isSoloGame
    ? `<b>Game Ended!</b>\n\n<b>${displayName}</b> played solo and got their bet back!\n\nRefund: <b>${betInSol} SOL</b>\nRound: #${args.roundId}`
    : `<b>Winner Announced!</b>\n\n<b>${displayName}</b> won the battle!\n\nPrize: <b>${prizeInSol} SOL</b>\nTheir Bet: ${betInSol} SOL\nMultiplier: ${multiplier.toFixed(2)}x\nPlayers: ${args.participantCount}\nRound: #${args.roundId}`;

  await sendTelegramNotification(telegramMsg);

  return { success: true };
}
