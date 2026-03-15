export const config = {
  port: parseInt(process.env.PORT || "3002"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/domin8",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  nodeEnv: process.env.NODE_ENV || "development",

  // Solana
  solanaRpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || "http://127.0.0.1:8899",
  crankAuthorityPrivateKey: process.env.CRANK_AUTHORITY_PRIVATE_KEY || "",
  presenceBotPrivateKey: process.env.PRESENCE_BOT_PRIVATE_KEY || "",
  presenceBotEnabled: process.env.PRESENCE_BOT_ENABLED !== "false",

  // Notifications
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",

  // Web Push VAPID keys
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@domin8.fun",

  // Privy (for bot executor)
  privyAppId: process.env.VITE_PRIVY_APP_ID || "",
  privyAppSecret: process.env.PRIVY_APP_SECRET || "",
  privyBotSignerId: process.env.PRIVY_BOT_SIGNER_ID || "",
  privyBotAuthPrivateKey: process.env.PRIVY_BOT_AUTH_PRIVATE_KEY || "",

  // Game timing constants (in milliseconds)
  cronInterval: 50_000, // 50 seconds
  sendPrizeDelay: 2_000, // 2 seconds
  createGameDelay: 18_000, // 18 seconds
};
