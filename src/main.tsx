import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import "./index.css";
import { Root } from "./Root.tsx";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <PrivyProvider
        appId={import.meta.env.VITE_PRIVY_APP_ID}
        config={{
          // SOLANA EMBEDDED WALLETS ONLY
          // Login with email/social - embedded wallet created automatically
          loginMethods: ["wallet", "email", "google"],

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
              // "solana:mainnet": {
              //   rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
              //   rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
              // },
              // "solana:devnet": {
              //   rpc: createSolanaRpc("https://api.devnet.solana.com"),
              //   rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.devnet.solana.com"),
              // },
              "solana:devnet": {
                rpc: createSolanaRpc("http://127.0.0.1:8899"),
                rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:8900"),
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
        <Root />
      </PrivyProvider>
      <Toaster />
    </ConvexProvider>
  </StrictMode>
);
