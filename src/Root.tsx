import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { FlappyPage } from "./features/flappy";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { PlayerNamesProvider } from "./contexts/PlayerNamesContext";
import { getSolanaRpcUrl } from "./lib/utils";

const privyAppId = import.meta.env.NEXT_PUBLIC_PRIVY_APP_ID ?? import.meta.env.VITE_PRIVY_APP_ID;
const solanaRpcUrl = getSolanaRpcUrl();
const solanaRpcWsUrl = solanaRpcUrl.startsWith("ws")
  ? solanaRpcUrl
  : solanaRpcUrl.replace(/^https?:/, solanaRpcUrl.startsWith("https://") ? "wss:" : "ws:");

function AppProviders() {
  return (
    <PrivyProvider
      appId={privyAppId}
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
              rpc: createSolanaRpc(solanaRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(solanaRpcWsUrl),
            },
            "solana:devnet": {
              rpc: createSolanaRpc(solanaRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(solanaRpcWsUrl),
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
        <Outlet />
      </PlayerNamesProvider>
    </PrivyProvider>
  );
}

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppProviders />}>
          <Route path="/" element={<App />} />
          <Route path="/gamestate" element={<GameStatePage />} />
        </Route>
        <Route path="/flappy" element={<FlappyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
