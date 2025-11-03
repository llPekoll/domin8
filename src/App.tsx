import { useRef, useState, useEffect } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { GameLobby } from "./components/GameLobby";
import { BlockchainRandomnessDialog } from "./components/BlockchainRandomnessDialog";
import { DemoGameManager } from "./components/DemoGameManager";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { MultiParticipantPanel } from "./components/MultiParticipantPanel";
import { useActiveGame } from "./hooks/useActiveGame";
import { logger } from "./lib/logger";

export default function App() {
  const [showBlockchainDialog, setShowBlockchainDialog] = useState(false);
  const [sceneReady, setSceneReady] = useState(false); // Track when Phaser scene is ready

  // References to the PhaserGame component (game and scene are exposed)
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  // Demo mode is active when no real game exists or game is finished (status 2)
  const isDemoMode =
    !currentRoundState || currentRoundState.status === 2 || currentRoundState.betCount === 0;
  logger.ui.debug({ currentRoundState, isDemoMode });

  // Event emitted from the PhaserGame component
  const currentScene = (scene: Phaser.Scene) => {
    logger.ui.debug("[currentScene callback] Scene ready:", scene.scene.key);
    setSceneReady(true); // Mark scene as ready to trigger effect

    // Handle scene based on whether we're in demo or real game
    if (scene.scene.key === "RoyalRumble" && currentRoundState) {
      // Real game scene - update with blockchain game state
      (scene as any).updateGameState?.(currentRoundState);

      // Blockchain calls now handled by Solana crank system (no frontend trigger needed)
      logger.ui.debug(
        `Game active - Round ${currentRoundState.roundId?.toString() || currentRoundState.gameRound?.toString()}, Status: ${currentRoundState.status}`
      );
    } else if (scene.scene.key === "DemoScene") {
      // Demo scene is ready - DemoGameManager will handle it
      logger.ui.debug("DemoScene is ready");
    }
  };

  // Switch scenes when transitioning between demo and real game
  useEffect(() => {
    logger.ui.debug("[Scene Switch Effect] Triggered", {
      hasPhaserRef: !!phaserRef.current,
      hasScene: !!phaserRef.current?.scene,
      sceneKey: phaserRef.current?.scene?.scene.key,
      currentRoundState: currentRoundState
        ? {
            roundId:
              currentRoundState.roundId?.toString() || currentRoundState.gameRound?.toString(),
            status: currentRoundState.status,
          }
        : null,
    });

    if (!phaserRef.current?.scene) {
      logger.ui.debug("[Scene Switch Effect] Waiting for Phaser scene to be ready...");
      return;
    }

    const scene = phaserRef.current.scene;
    // Status 0 = open/waiting (with bets), 1 = closed/determining winner, 2 = finished
    // Only show real game if status 0 or 1 AND has at least 1 bet
    const hasRealGame =
      currentRoundState && currentRoundState.status !== 2 && (currentRoundState.betCount ?? 0) > 0;

    logger.ui.debug("[Scene Switch Effect] Evaluation", {
      hasRealGame,
      status: currentRoundState?.status,
      betCount: currentRoundState?.betCount,
      currentScene: scene.scene.key,
      shouldSwitchToGame: hasRealGame && scene.scene.key === "DemoScene",
      shouldSwitchToDemo: !hasRealGame && scene.scene.key === "RoyalRumble",
    });

    // If real game starts and we're in demo scene, switch to game scene
    if (hasRealGame && scene.scene.key === "DemoScene") {
      logger.ui.debug("✅ Switching from DemoScene to RoyalRumble - Real game started");
      logger.ui.debug("Game state:", currentRoundState);
      // Use the transition method instead of direct scene.start
      (scene as any).transitionToRealGame?.();
    }

    // If no game (or finished game) and we're in game scene, switch back to demo
    if (!hasRealGame && scene.scene.key === "RoyalRumble") {
      logger.ui.debug("✅ Switching from RoyalRumble to DemoScene - Game ended or idle");
      // Use the transition method instead of direct scene.start
      (scene as any).transitionToDemo?.();
    }

    // Update game scene with real blockchain game state
    if (hasRealGame && scene.scene.key === "RoyalRumble") {
      logger.ui.debug("[App] 🎮 Updating game state with blockchain data:", {
        hasBets: !!currentRoundState.bets,
        betCount: currentRoundState.bets?.length || 0,
        hasWallets: !!currentRoundState.wallets,
        walletCount: currentRoundState.wallets?.length || 0,
        hasMap: !!currentRoundState.map,
        mapType: typeof currentRoundState.map,
        mapValue: currentRoundState.map,
        fullData: currentRoundState,
      });

      logger.ui.debug("[App] 🗺️ Map enrichment status:", {
        rawMapValue: currentRoundState.map,
        isMapObject: typeof currentRoundState.map === "object",
        isMapNumber: typeof currentRoundState.map === "number",
        hasBackground: !!(currentRoundState.map as any)?.background,
        mapDetails: currentRoundState.map,
      });

      (scene as any).updateGameState?.(currentRoundState);

      const roundId =
        currentRoundState.roundId?.toString() || currentRoundState.gameRound?.toString();
      const betCount = currentRoundState.betCount || 0;
      const totalPot = currentRoundState.totalPot
        ? Number(currentRoundState.totalPot.toString()) / 1_000_000_000
        : 0;

      logger.ui.debug(`Game - Round ${roundId}, Status: ${currentRoundState.status}`);
      logger.ui.debug("Bets count:", betCount);
      logger.ui.debug("Total pot:", totalPot, "SOL");
    }
  }, [currentRoundState, sceneReady]); // Re-run when scene becomes ready or game state changes

  // Show blockchain dialog during winner determination phase (status 1)
  // ONLY for real blockchain games (NOT demo mode)
  useEffect(() => {
    // Show dialog when game is determining winner (status 1) AND not in demo mode
    const shouldShowDialog = !isDemoMode && currentRoundState?.status === 1;
    setShowBlockchainDialog(shouldShowDialog);
  }, [currentRoundState, isDemoMode]);

  // Note: Participant data now comes directly from blockchain via useActiveGame
  // Bet data includes skin and position for spawning characters

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Demo Game Manager - handles all demo logic */}
      <DemoGameManager isActive={isDemoMode} phaserRef={phaserRef} />

      {/* Full Background Phaser Game */}
      <div className="fixed inset-0 w-full h-full">
        <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
      </div>

      {/* Overlay UI Elements */}
      <div className="relative z-10">
        <Header />
        <div className="min-h-screen pt-16 pb-24">
          <div className="absolute right-4 top-20 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            <GameLobby />
          </div>
        </div>
      </div>

      {/* Participant List Panel (bottom-right) */}
      <MultiParticipantPanel />

      {/* Blockchain Randomness Dialog */}
      <BlockchainRandomnessDialog open={showBlockchainDialog} />

      {/* Blockchain Debug Dialog (dev only) */}
      <BlockchainDebugDialog />
    </div>
  );
}
