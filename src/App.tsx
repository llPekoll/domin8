import { useRef, useState, useEffect } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { GameLobby } from "./components/GameLobby";
import { DemoGameManager } from "./components/DemoGameManager";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { MultiParticipantPanel } from "./components/MultiParticipantPanel";
import { useActiveGame } from "./hooks/useActiveGame";
import { EventBus } from "./game/EventBus";
import { GamePhase } from "./game/managers/GamePhaseManager";

export default function App() {
  const [sceneReady, setSceneReady] = useState(false); // Track when Phaser scene is ready
  const [currentGamePhase, setCurrentGamePhase] = useState<GamePhase>(GamePhase.IDLE);

  // References to the PhaserGame component (game and scene are exposed)
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  // Listen to game phase changes from GamePhaseManager
  useEffect(() => {
    const handlePhaseChange = (phase: GamePhase) => {
      setCurrentGamePhase(phase);
    };

    EventBus.on("game-phase-changed", handlePhaseChange);

    return () => {
      EventBus.off("game-phase-changed", handlePhaseChange);
    };
  }, []);

  // Demo mode is active when no real game exists or game is finished (status 2)
  const isDemoMode =
    !currentRoundState || currentRoundState.status === 2 || currentRoundState.betCount === 0;

  // Event emitted from the PhaserGame component
  const currentScene = (scene: Phaser.Scene) => {
    setSceneReady(true); // Mark scene as ready to trigger effect

    // Handle scene based on whether we're in demo or real game
    if (scene.scene.key === "Game" && currentRoundState) {
      // Real game scene - update with blockchain game state
      (scene as any).updateGameState?.(currentRoundState);

      // Blockchain calls now handled by Solana crank system (no frontend trigger needed)
    } else if (scene.scene.key === "Demo") {
      // Demo scene is ready - DemoGameManager will handle it
    }
  };

  // Switch scenes when transitioning between demo and real game
  useEffect(() => {
    if (!phaserRef.current?.scene) {
      return;
    }

    const scene = phaserRef.current.scene;
    // Status 0 = open/waiting (with bets), 1 = closed/determining winner, 2 = finished
    // Only show real game if status 0 or 1 AND has at least 1 bet
    const hasRealGame =
      currentRoundState && currentRoundState.status !== 2 && (currentRoundState.betCount ?? 0) > 0;

    // Check if we should prevent scene switching (during celebration or VRF)
    const isInCriticalPhase =
      currentGamePhase === GamePhase.CELEBRATING ||
      currentGamePhase === GamePhase.VRF_PENDING ||
      currentGamePhase === GamePhase.CLEANUP;

    // If real game starts and we're in demo scene, switch to game scene
    if (hasRealGame && scene.scene.key === "Demo") {
      // Use the transition method instead of direct scene.start
      (scene as any).transitionToRealGame?.();
    }

    // If no game (or finished game) and we're in game scene, switch back to demo
    // BUT: Don't switch during critical phases (VRF_PENDING, CELEBRATING, CLEANUP)
    if (!hasRealGame && scene.scene.key === "Game" && !isInCriticalPhase) {
      // Use the transition method instead of direct scene.start
      (scene as any).transitionToDemo?.();
    } else if (!hasRealGame && scene.scene.key === "Game" && isInCriticalPhase) {
    }

    // Update game scene with real blockchain game state
    if (hasRealGame && scene.scene.key === "Game") {
      (scene as any).updateGameState?.(currentRoundState);
    }
  }, [currentRoundState, sceneReady, currentGamePhase]); // Re-run when scene becomes ready, game state changes, or phase changes

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

      {/* Blockchain Debug Dialog (dev only) */}
      <BlockchainDebugDialog />
    </div>
  );
}
