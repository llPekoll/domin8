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
              showWalletLoginFirst: true,
              walletChainType: "solana-only",
              walletList: ["phantom", "solflare", "backpack", "metamask"],
            },
            externalWallets: {
              solana: {
                connectors: toSolanaWalletConnectors(), // For detecting EOA browser wallets
              },
            },
            // NO external wallets - prevents redirect to wallet websites
            // Users get embedded Solana wallet automatically

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
                // "solana:devnet": {
                //   rpc: createSolanaRpc("http://127.0.0.1:8899"),
                //   rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:8900"),
                // },
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
  </StrictMode>
);
