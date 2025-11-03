import { useRef, useState, useEffect } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { GameLobby } from "./components/GameLobby";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { MultiParticipantPanel } from "./components/MultiParticipantPanel";
import { useActiveGame } from "./hooks/useActiveGame";

export default function App() {
  const [sceneReady, setSceneReady] = useState(false); // Track when Phaser scene is ready

  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  const currentScene = () => {
    setSceneReady(true); // Mark scene as ready to trigger effect
  };

  // Update Game scene with blockchain game state
  useEffect(() => {
    if (!phaserRef.current?.scene || !sceneReady || !currentRoundState) {
      return;
    }
    const scene = phaserRef.current.scene;

    // Update game scene with blockchain data (scene handles phase logic internally)
    if (scene.scene.key === "Game") {
      (scene as any).updateGameState?.(currentRoundState);
    }
  }, [currentRoundState, sceneReady]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 w-full h-full">
        <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
      </div>

      <div className="relative z-10">
        <Header />
        <div className="min-h-screen pt-16 pb-24">
          <div className="absolute right-4 top-20 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            <GameLobby />
          </div>
        </div>
      </div>

      <MultiParticipantPanel />
      <BlockchainDebugDialog />
    </div>
  );
}
