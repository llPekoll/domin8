import { useRef, useEffect } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { PlayerOnboarding } from "./components/PlayerOnboarding";
import { CharacterSelection } from "./components/CharacterSelection";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { MultiParticipantPanel } from "./components/MultiParticipantPanel";
import { useActiveGame } from "./hooks/useActiveGame";
import { EventBus } from "./game/EventBus";
import { setActiveGameData } from "./game/main";

export default function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

  // Simple: Just pipe blockchain data to Phaser via EventBus
  // SceneManager handles all the logic (phase detection, scene updates, transitions)
  useEffect(() => {
    console.log("📡 [App] Emitting blockchain state to Phaser:", {
      hasGameState: !!currentRoundState,
      status: currentRoundState?.status,
      map: currentRoundState?.map,
    });

    // Store in global state for Phaser scenes to access during initialization
    setActiveGameData(currentRoundState);

    // Also emit via EventBus for runtime updates
    EventBus.emit("blockchain-state-update", currentRoundState);
  }, [currentRoundState]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 w-full h-full">
        <PhaserGame ref={phaserRef} />
      </div>

      <div className="relative z-10">
        <Header />
        <div className="min-h-screen pt-16 pb-24">
          <div className="absolute right-4 top-20 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 space-y-4">
            <PlayerOnboarding />
            <CharacterSelection />
          </div>
        </div>
      </div>

      <MultiParticipantPanel />
      <BlockchainDebugDialog />
    </div>
  );
}
