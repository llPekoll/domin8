import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import { Root } from "./Root.tsx";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { AssetsProvider } from "./contexts/AssetsContext";
import { PlayerNamesProvider } from "./contexts/PlayerNamesContext";
import { ActiveWalletProvider } from "./contexts/ActiveWalletContext";
import { SocketProvider } from "./lib/socket";

// TonConnect manifest URL
// In dev: use VITE_TONCONNECT_MANIFEST_URL env var (must be publicly accessible)
// In prod: served from the app's public folder
const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tonconnect-manifest.json`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SocketProvider>
      <AssetsProvider>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
          <ActiveWalletProvider>
            <PlayerNamesProvider>
              <Root />
            </PlayerNamesProvider>
          </ActiveWalletProvider>
        </TonConnectUIProvider>
      </AssetsProvider>
      <Toaster
        position="top-right"
        closeButton
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
    </SocketProvider>
  </StrictMode>
);
