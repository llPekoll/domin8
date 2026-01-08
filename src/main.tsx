import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import "./index.css";
import { Root } from "./Root.tsx";
import { AssetsProvider } from "./contexts/AssetsContext";
import { Analytics } from "@vercel/analytics/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <AssetsProvider>
        <Root />
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
