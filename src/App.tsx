import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { IRefPhaserGame } from "./PhaserGame";
import { isMobile as isMobileDevice } from "react-device-detect";
import { useActiveGame } from "./hooks/useActiveGame";
import { usePrivyWallet } from "./hooks/usePrivyWallet";
import { useBossInfo } from "./hooks/useBossInfo";
import { useGameParticipants } from "./hooks/useGameParticipants";
import { EventBus } from "./game/EventBus";
import { setActiveGameData, setCurrentUserWallet } from "./game/main";
import type { Character } from "./types/character";
import { useAutoCreatePlayer } from "./hooks/useAutoCreatePlayer";
import { useGameCreatedNotification } from "./hooks/useGameCreatedNotification";
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

  // Get boss info (previous winner)
  const walletAddress = publicKey?.toBase58() || null;
  const { isBoss, bossWallet } = useBossInfo(walletAddress);

  // Track boss's first bet in current round (resets when round changes)
  const [bossFirstBetPlaced, setBossFirstBetPlaced] = useState(false);
  const [bossLockedCharacterId, setBossLockedCharacterId] = useState<number | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);

  // Auto-create player when wallet connects
  useAutoCreatePlayer(connected, publicKey?.toBase58() || null, externalWalletAddress || undefined);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  // Send notification when game transitions from WAITING to OPEN (first bet placed)
  useGameCreatedNotification(currentRoundState);

  // Get unified participants from Convex (includes resolved names, boss status)
  const { participants } = useGameParticipants();

  // Reset boss state when round changes
  useEffect(() => {
    const currentRoundId = currentRoundState?.gameRound?.toString() || null;
    if (currentRoundId !== lastRoundId) {
      console.log("🔄 [ROUND CHANGE] Resetting boss state:", {
        oldRoundId: lastRoundId,
        newRoundId: currentRoundId,
      });
      setLastRoundId(currentRoundId);
      setBossFirstBetPlaced(false);
      setBossLockedCharacterId(null);
    }
  }, [currentRoundState?.gameRound, lastRoundId]);

  // Callback for when boss places their first bet
  const handleBossFirstBet = useCallback(
    (characterId: number) => {
      console.log("🔒 [APP] handleBossFirstBet called:", {
        characterId,
        isBoss,
        bossFirstBetPlaced,
      });
      if (isBoss && !bossFirstBetPlaced) {
        console.log("🔒 [APP] SETTING bossFirstBetPlaced=true, lockedCharId=", characterId);
        setBossFirstBetPlaced(true);
        setBossLockedCharacterId(characterId);
      }
    },
    [isBoss, bossFirstBetPlaced]
  );

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

  // Emit boss wallet info to Phaser game scene
  useEffect(() => {
    EventBus.emit("boss-info-update", { bossWallet });
  }, [bossWallet]);

  // Simple: Just pipe blockchain data to Phaser via EventBus
  // Only updates when key fields actually change
  // Include bossWallet to avoid timing issues
  useEffect(() => {
    const fullData = stableGameState?._fullData || null;

    setActiveGameData(fullData);
    EventBus.emit("blockchain-state-update", { gameState: fullData, bossWallet });
  }, [stableGameState, bossWallet]);

  // Emit unified participants to Phaser (from Convex, includes resolved names)
  // Also re-emit when Phaser Game scene becomes ready (in case it missed the first emit)
  useEffect(() => {
    if (participants && participants.length > 0) {
      console.log(`👥 [App] Emitting ${participants.length} participants to Phaser`);
      EventBus.emit("participants-update", { participants });
    }
  }, [participants]);

  // Re-emit game state and participants when Game scene becomes ready (handles late scene initialization)
  useEffect(() => {
    const handleSceneReady = (scene: any) => {
      // Only re-emit for Game scene (not CharacterPreview or other scenes)
      if (scene?.scene?.key === "Game") {
        const fullData = stableGameState?._fullData || null;

        // Re-emit boss wallet info
        console.log(`👑 [App] Scene ready - re-emitting boss info:`, bossWallet);
        EventBus.emit("boss-info-update", { bossWallet });

        // Re-emit blockchain state (includes map data) FIRST
        console.log(`🗺️ [App] Scene ready - re-emitting blockchain state`);
        EventBus.emit("blockchain-state-update", { gameState: fullData, bossWallet });

        // Re-emit participants AFTER map data is set (small delay to ensure order)
        if (participants && participants.length > 0) {
          setTimeout(() => {
            console.log(`👥 [App] Scene ready - re-emitting ${participants.length} participants`);
            EventBus.emit("participants-update", { participants });
          }, 100);
        }
      }
    };

    EventBus.on("current-scene-ready", handleSceneReady);
    return () => {
      EventBus.off("current-scene-ready", handleSceneReady);
    };
  }, [participants, bossWallet, stableGameState]);

  // Shared props for all layouts
  const layoutProps = {
    phaserRef,
    selectedCharacter,
    onCharacterSelected: setSelectedCharacter,
    walletReady,
    connected,
    // Boss-related props
    isBoss,
    bossFirstBetPlaced,
    bossLockedCharacterId,
    onBossFirstBet: handleBossFirstBet,
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
