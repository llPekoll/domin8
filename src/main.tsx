import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import "./index.css";
import { Root } from "./Root.tsx";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { AssetsProvider } from "./contexts/AssetsContext";
import { PlayerNamesProvider } from "./contexts/PlayerNamesContext";
import { Analytics } from "@vercel/analytics/react";
import { configureStatusBar } from "./utils/statusBar";
import { Capacitor } from "@capacitor/core";

// Configure native status bar (Android/iOS)
void configureStatusBar();

const platform = Capacitor.getPlatform();
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
console.log("[App] Platform:", platform);
console.log("[App] User Agent:", navigator.userAgent);
console.log("[App] Is Android:", isAndroid);
console.log("[App] Is Mobile:", isMobile);

// Register MWA on Android (detect via user agent for PWA/web support)
if (isAndroid) {
  console.log("[MWA] Attempting registration on Android...");

  // Dynamic import to avoid crash on HTTP
  import("@solana-mobile/wallet-standard-mobile")
    .then((mwaModule) => {
      try {
        mwaModule.registerMwa({
          appIdentity: {
            name: "Domin8",
            uri: window.location.origin,
          },
          authorizationCache: mwaModule.createDefaultAuthorizationCache(),
          chains: ["solana:mainnet-beta", "solana:mainnet", "solana:devnet"],
          chainSelector: mwaModule.createDefaultChainSelector(),
          onWalletNotFound: async () => {
            console.log("[MWA] Wallet not found - no UI shown");
          },
        });
        console.log("[MWA] Registration complete!");

        // Check what wallets were detected
        setTimeout(() => {
          import("@wallet-standard/app").then(({ getWallets }) => {
            const { get } = getWallets();
            const wallets = get();
            console.log(
              "[MWA] Detected wallets:",
              wallets.map((w) => w.name)
            );
          });
        }, 500);
      } catch (err) {
        console.error("[MWA] Registration failed:", err);
      }
    })
    .catch((err) => {
      console.error("[MWA] Failed to load MWA module:", err);
    });
} else {
  console.log("[MWA] Skipped - isAndroid:", isAndroid);
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <AssetsProvider>
        <PrivyProvider
          appId={import.meta.env.VITE_PRIVY_APP_ID}
          config={{
            // SOLANA EMBEDDED WALLETS ONLY
            // Login with email/social - embedded wallet created automatically
            loginMethods: ["wallet", "email", "google", "twitter", "discord"],

            // Appearance configuration
            appearance: {
              theme: "dark",
              accentColor: "#6366f1",
              showWalletLoginFirst: !isAndroid, // On Android, show email first; on desktop show wallet first
              walletChainType: "solana-only",
              // Don't restrict walletList - let all detected wallets show (including MWA)
            },
            externalWallets: {
              solana: {
                connectors: toSolanaWalletConnectors(), // Detects all wallet-standard wallets including MWA
              },
            },
            // External wallets enabled - allows MWA and browser extension wallets

            // Embedded wallets - create for ALL users (in-game wallet)
            embeddedWallets: {
              solana: {
                createOnLogin: "all-users", // Always create embedded wallet for in-game funds
              },
            },

            solana: {
              rpcs: {
                "solana:mainnet": {
                  rpc: createSolanaRpc(import.meta.env.VITE_SOLANA_RPC_URL),
                  rpcSubscriptions: createSolanaRpcSubscriptions(
                    import.meta.env.VITE_SOLANA_RPC_URL.replace(/^https?:/, "wss:")
                  ),
                },
                "solana:devnet": {
                  rpc: createSolanaRpc(import.meta.env.VITE_SOLANA_RPC_URL),
                  rpcSubscriptions: createSolanaRpcSubscriptions(
                    import.meta.env.VITE_SOLANA_RPC_URL.replace(/^https?:/, "wss:")
                  ),
                },
              },
            },
            // Additional configuration
            mfa: {
              noPromptOnMfaRequired: false,
            },

            // Configure legal and terms
            // legal: {
            //   termsAndConditionsUrl: "/terms",
            //   privacyPolicyUrl: "/privacy",
            // },
          }}
        >
          <PlayerNamesProvider>
            <Root />
          </PlayerNamesProvider>
        </PrivyProvider>
      </AssetsProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: '"metal-slug", "Press Start 2P"',
            fontSize: "14px",
            backgroundColor: "#2c1810",
            color: "#FFD700",
            border: "3px solid #FFA500",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 0 20px rgba(255, 165, 0, 0.3)",
            minWidth: "350px",
          },
          className: "domin8-toast",
          duration: 8000,
        }}
        theme="dark"
      />
    </ConvexProvider>
    <Analytics />
  </StrictMode>
);
