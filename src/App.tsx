import { useRef, useEffect, useMemo, useState } from "react";
import { IRefPhaserGame } from "./PhaserGame";
import { isMobile as isMobileDevice } from "react-device-detect";
import { useActiveGame } from "./hooks/useActiveGame";
import { usePrivyWallet } from "./hooks/usePrivyWallet";
import { EventBus } from "./game/EventBus";
import { setActiveGameData, setCurrentUserWallet } from "./game/main";
import type { Character } from "./types/character";
import { useAutoCreatePlayer } from "./hooks/useAutoCreatePlayer";
import { useGameCreatedWebhook } from "./hooks/useGameCreatedWebhook";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { MobileLayout } from "./layouts/MobileLayout";
import { MobileLandscapeLayout } from "./layouts/MobileLandscapeLayout";

// Custom hook for device detection (mobile + orientation)
function useDeviceLayout() {
  const [layout, setLayout] = useState<"desktop" | "mobile-portrait" | "mobile-landscape">(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isLandscape = width > height;

    // Real mobile device - use mobile layouts
    if (isMobileDevice) {
      return isLandscape ? "mobile-landscape" : "mobile-portrait";
    }

    // Desktop browser with narrow viewport (Chrome DevTools) - use mobile for testing
    // Only trigger mobile if BOTH narrow width AND portrait-ish aspect ratio
    if (width < 500) {
      return isLandscape ? "mobile-landscape" : "mobile-portrait";
    }

    // Desktop
    return "desktop";
  });

  useEffect(() => {
    const checkLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isLandscape = width > height;

      // Real mobile device - use mobile layouts
      if (isMobileDevice) {
        setLayout(isLandscape ? "mobile-landscape" : "mobile-portrait");
        return;
      }

      // Desktop browser with very narrow viewport (Chrome DevTools mobile emulation)
      if (width < 500) {
        setLayout(isLandscape ? "mobile-landscape" : "mobile-portrait");
        return;
      }

      // Desktop
      setLayout("desktop");
    };

    window.addEventListener("resize", checkLayout);
    window.addEventListener("orientationchange", checkLayout);
    return () => {
      window.removeEventListener("resize", checkLayout);
      window.removeEventListener("orientationchange", checkLayout);
    };
  }, []);

  return layout;
}

export default function App() {
  const layout = useDeviceLayout();
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Track selected character from carousel
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Get current user's wallet
  const { connected, ready: walletReady, publicKey, externalWalletAddress } = usePrivyWallet();

  // Auto-create player when wallet connects
  useAutoCreatePlayer(connected, publicKey?.toBase58() || null, externalWalletAddress || undefined);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  // Send webhook when game transitions from WAITING to OPEN (first bet placed)
  useGameCreatedWebhook(currentRoundState);

  // ✅ Create a stable reference that only changes when meaningful data changes
  // This prevents infinite re-renders from object recreation
  const stableGameState = useMemo(() => {
    if (!currentRoundState) return null;

    // Serialize bet data to detect actual changes
    const betSignature =
      currentRoundState.bets
        ?.map((b) => `${b.walletIndex}-${b.amount?.toString()}-${b.skin}`)
        .join("|") || "";

    return {
      gameRound: currentRoundState.gameRound?.toString(),
      status: currentRoundState.status,
      betCount: currentRoundState.bets?.length || 0,
      betSignature, // Detects new bets even if count stays same
      map: currentRoundState.map,
      winner: currentRoundState.winner?.toBase58(),
      endDate: currentRoundState.endDate?.toString(),
      // Include the full data for Phaser to use
      _fullData: currentRoundState,
    };
  }, [
    currentRoundState?.gameRound?.toString(),
    currentRoundState?.status,
    currentRoundState?.bets?.length,
    currentRoundState?.bets
      ?.map((b) => `${b.walletIndex}-${b.amount?.toString()}-${b.skin}`)
      .join("|"),
    currentRoundState?.map,
    currentRoundState?.winner?.toBase58(),
    currentRoundState?.endDate?.toString(),
  ]);

  // Update current user wallet in Phaser
  useEffect(() => {
    const walletAddress = publicKey?.toBase58() || null;
    setCurrentUserWallet(walletAddress);
    console.log(`👤 [App] Current user wallet set:`, walletAddress);
  }, [publicKey]);

  // Simple: Just pipe blockchain data to Phaser via EventBus
  // Only updates when key fields actually change
  useEffect(() => {
    const fullData = stableGameState?._fullData || null;


    setActiveGameData(fullData);
    EventBus.emit("blockchain-state-update", fullData);
  }, [stableGameState]);

  // Wait for user to connect with Privy before loading the UI
  if (!connected) {
    return null;
  }

  // Shared props for all layouts
  const layoutProps = {
    phaserRef,
    selectedCharacter,
    onCharacterSelected: setSelectedCharacter,
    walletReady,
    connected,
  };

  // Render appropriate layout based on device and orientation
  if (layout === "mobile-portrait") {
    return <MobileLayout {...layoutProps} />;
  }

  if (layout === "mobile-landscape") {
    return <MobileLandscapeLayout {...layoutProps} />;
  }

  return <DesktopLayout {...layoutProps} />;
}
