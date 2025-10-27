import { useRef, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { GameLobby } from "./components/GameLobby";
import { BlockchainRandomnessDialog } from "./components/BlockchainRandomnessDialog";
import { DemoGameManager } from "./components/DemoGameManager";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { api } from "../convex/_generated/api";

export default function App() {
  const [showBlockchainDialog, setShowBlockchainDialog] = useState(false);

  // References to the PhaserGame component (game and scene are exposed)
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Get current game state from Convex (auto-synced from blockchain every 5s)
  const currentRoundState = useQuery(api.events.getCurrentRoundState);

  // Demo mode is active when no real game exists or game is in "finished" state
  // const isDemoMode = !currentRoundState || currentRoundState.status === "finished";
  const isDemoMode = false; // TEMP: disable demo mode for testing real game

  // Event emitted from the PhaserGame component
  const currentScene = (scene: Phaser.Scene) => {
    console.log("zefgzeiureizfgzeiurgferiufhegirfghIUFHEZOIFGZER")
    // Handle scene based on whether we're in demo or real game
    if (scene.scene.key === "RoyalRumble" && currentRoundState) {
      // Real game scene - update with blockchain game state
      (scene as any).updateGameState?.(currentRoundState);

      // Blockchain calls now handled by Solana crank system (no frontend trigger needed)
      console.log(`Game active - Round ${currentRoundState.roundId}, Status: ${currentRoundState.status}`);
    } else if (scene.scene.key === "DemoScene") {
      // Demo scene is ready - DemoGameManager will handle it
      console.log("DemoScene is ready");
    }
  };

  // Switch scenes when transitioning between demo and real game
  useEffect(() => {
    if (!phaserRef.current?.scene) return;

    const scene = phaserRef.current.scene;
    const hasRealGame = currentRoundState && currentRoundState.status !== "finished";

    // If real game starts and we're in demo scene, switch to game scene
    if (hasRealGame && scene.scene.key === "DemoScene") {
      console.log("Switching from DemoScene to RoyalRumble - Real game started");
      console.log("Game state:", currentRoundState);
      scene.scene.start("RoyalRumble");
    }

    // If no game (or finished game) and we're in game scene, switch back to demo
    if (!hasRealGame && scene.scene.key === "RoyalRumble") {
      console.log("Switching from RoyalRumble to DemoScene - Game ended or idle");
      scene.scene.start("DemoScene");
    }

    // Update game scene with real blockchain game state
    if (hasRealGame && scene.scene.key === "RoyalRumble") {
      (scene as any).updateGameState?.(currentRoundState);

      console.log(`Game - Round ${currentRoundState.roundId}, Status: ${currentRoundState.status}`);
      console.log("Bets count:", currentRoundState.betCount);
      console.log("Total pot:", currentRoundState.totalPot / 1_000_000_000, "SOL");
    }
  }, [currentRoundState]);

  // Show blockchain dialog during awaitingWinnerRandomness phase when randomness not fulfilled
  useEffect(() => {
    const shouldShowDialog = 
      currentRoundState?.status === "awaitingWinnerRandomness" && 
      currentRoundState?.randomnessFulfilled === false;
    setShowBlockchainDialog(shouldShowDialog);
  }, [currentRoundState]);

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

      {/* Blockchain Randomness Dialog */}
      <BlockchainRandomnessDialog open={showBlockchainDialog} />

      {/* Blockchain Debug Dialog (dev only) */}
      <BlockchainDebugDialog />
    </div>
  );
}
