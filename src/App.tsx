import { useRef, useEffect, useMemo, useState } from "react";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { Header } from "./components/Header";
import { PlayerOnboarding } from "./components/PlayerOnboarding";
import { CharacterSelection2 } from "./components/CharacterSelection2";
import { BettingPanel } from "./components/BettingPanel";
import { BlockchainDebugDialog } from "./components/BlockchainDebugDialog";
import { MultiParticipantPanel } from "./components/MultiParticipantPanel";
import { PotDisplayPanel } from "./components/PotDisplayPanel";
import { WinnerShareOverlay } from "./components/WinnerShareOverlay";
import { useActiveGame } from "./hooks/useActiveGame";
import { usePrivyWallet } from "./hooks/usePrivyWallet";
import { EventBus } from "./game/EventBus";
import { setActiveGameData, setCurrentUserWallet } from "./game/main";
import type { Character } from "./types/character";

export default function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);

  // Track selected character from carousel
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Get current user's wallet
  const { publicKey } = usePrivyWallet();

  // Get current game state directly from blockchain (no Convex, <1s updates)
  const { activeGame: currentRoundState } = useActiveGame();

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
    const timestamp = Date.now();
    const fullData = stableGameState?._fullData || null;

    console.log(`📡 [App] [${timestamp}] Blockchain state changed:`, {
      hasGameState: !!fullData,
      status: fullData?.status,
      map: fullData?.map,
      hasBets: !!fullData?.bets,
      betCount: fullData?.bets?.length || 0,
    });

    // Store in global state for Phaser scenes to access during initialization
    setActiveGameData(fullData);

    // Also emit via EventBus for runtime updates
    console.log(`📡 [App] [${timestamp}] 🚀 Emitting blockchain-state-update event`);
    EventBus.emit("blockchain-state-update", fullData);
    console.log(`📡 [App] [${timestamp}] ✅ blockchain-state-update event emitted`);
  }, [stableGameState]);

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
          </div>
        </div>
      </div>

      {/* Character Selection Carousel - Bottom Left */}
      <CharacterSelection2 onCharacterSelected={setSelectedCharacter} />

      {/* Betting Panel - Bottom Center */}
      <BettingPanel selectedCharacter={selectedCharacter} />

      {/* Pot Display - Top Center */}
      <PotDisplayPanel />

      <MultiParticipantPanel />
      <BlockchainDebugDialog />
      <WinnerShareOverlay />
    </div>
  );
}
