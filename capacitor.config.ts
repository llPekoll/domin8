import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "fun.domin8.app",
  appName: "Domin8",
  webDir: "dist",
  server: {
    // For development - comment out for production
    // url: "http://192.168.1.x:5173",
    // cleartext: true,
    androidScheme: "https",
  },
  plugins: {
    App: {
      // Deep link configuration for Phantom wallet
    },
    Browser: {
      // Use system browser for OAuth
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#000000",
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#000000",
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true, // Set to false for production
    // Custom user agent to bypass MWA WebView check
    // The MWA library blocks WebViews, but Capacitor can handle intents
    overrideUserAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  },
};

export default config;
