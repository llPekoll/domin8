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
  },
};

export default config;
