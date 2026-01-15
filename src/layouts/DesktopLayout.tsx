import { RefObject } from "react";
import { IRefPhaserGame, PhaserGame } from "../PhaserGame";
import { Header } from "../components/Header";
import { CharacterSelection2 } from "../components/CharacterSelection2";
import { BettingPanel } from "../components/BettingPanel";
import { MultiParticipantPanel } from "../components/MultiParticipantPanel";
import { PotDisplayPanel } from "../components/PotDisplayPanel";
import { WinnerShareOverlay } from "../components/WinnerShareOverlay";
import { LastWinnerCard } from "../components/LastWinnerCard";
import { LandscapeEnforcer } from "../components/LandscapeEnforcer";
import { ConnectWalletOverlay } from "../components/ConnectWalletOverlay";
import { ChatPanel } from "../components/ChatPanel";
import { LevelProgressBar } from "../components/LevelProgressBar";
import { LevelUpNotification } from "../components/LevelUpNotification";
import type { Character } from "../types/character";

interface DesktopLayoutProps {
  phaserRef: RefObject<IRefPhaserGame | null>;
  selectedCharacter: Character | null;
  onCharacterSelected: (character: Character | null) => void;
  walletReady: boolean;
  connected: boolean;
}

export function DesktopLayout({
  phaserRef,
  selectedCharacter,
  onCharacterSelected,
  walletReady,
  connected,
}: DesktopLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Landscape Enforcer - For tablets in portrait */}
      <LandscapeEnforcer />

      <div className="fixed inset-0 w-full h-full z-0">
        <PhaserGame ref={phaserRef} />
      </div>

      {/* Connect Wallet Overlay - Shows when not connected */}
      {walletReady && !connected && <ConnectWalletOverlay />}

      <div className="relative z-10">
        <Header />
      </div>

      {/* Chat Panel - Top Left under Header (resizable) */}
      <ChatPanel resizable />

      {/* Level Progress Bar - Top Left under Chat */}
      <div className="fixed top-[340px] left-4 z-40">
        <LevelProgressBar />
      </div>

      {/* Level Up Notification - Center overlay */}
      <LevelUpNotification />

      {/* Character Selection Carousel - Bottom Left */}
      <CharacterSelection2 onCharacterSelected={onCharacterSelected} />

      {/* Betting Panel - Bottom Center */}
      <div className="fixed items-center bottom-4 left-1/2 -translate-x-1/2 z-50">
        <BettingPanel selectedCharacter={selectedCharacter} />
      </div>

      {/* Pot Display - Top Center */}
      <PotDisplayPanel />

      <div className="fixed top-18 right-4">
        <LastWinnerCard />
      </div>
      <MultiParticipantPanel />
      <WinnerShareOverlay />
    </div>
  );
}
