import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fun.domin8.app',
  appName: 'Domin8',
  webDir: 'dist',
  android: {
    // Fullscreen immersive mode
    backgroundColor: '#000000',
    // Allow mixed content for wallet connections
    allowMixedContent: true,
  },
  server: {
    // Allow loading from your domain
    allowNavigation: ['domin8.fun', '*.domin8.fun', '*.solana.com'],
    // Allow cleartext for localhost dev
    cleartext: true,
  },
  plugins: {
    App: {
      // Handle deep links
    },
  }
};

export default config;
