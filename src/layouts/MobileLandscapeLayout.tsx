import { RefObject } from "react";
import { IRefPhaserGame, PhaserGame } from "../PhaserGame";
import { HeaderMobile } from "../components/HeaderMobile";
import { CharacterCarouselMobile } from "../components/CharacterCarouselMobile";
import { PotDisplayMobile } from "../components/PotDisplayMobile";
import { BettingPanelMobile } from "../components/BettingPanelMobile";
import { WinnerShareOverlay } from "../components/WinnerShareOverlay";
import { ConnectWalletMobile } from "../components/ConnectWalletMobile";
import type { Character } from "../types/character";

interface MobileLandscapeLayoutProps {
  phaserRef: RefObject<IRefPhaserGame | null>;
  selectedCharacter: Character | null;
  onCharacterSelected: (character: Character | null) => void;
  walletReady: boolean;
  connected: boolean;
}

export function MobileLandscapeLayout({
  phaserRef,
  selectedCharacter,
  onCharacterSelected,
  walletReady,
  connected,
}: MobileLandscapeLayoutProps) {
  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden">
      {/* Connect Wallet Overlay */}
      {walletReady && !connected && <ConnectWalletMobile />}

      {/* Left Side - Game (60%) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal Header */}
        <HeaderMobile />

        {/* Phaser Game - Takes remaining height */}
        <div className="flex-1 relative">
          <PhaserGame ref={phaserRef} />
        </div>
      </div>

      {/* Right Sidebar - Controls (40%) */}
      <div className="w-[40%] max-w-[320px] flex flex-col bg-black/60 border-l border-amber-500/20">
        {/* Character Carousel */}
        <CharacterCarouselMobile onCharacterSelected={onCharacterSelected} />

        {/* Pot Display */}
        <PotDisplayMobile />

        {/* Spacer to push betting to bottom */}
        <div className="flex-1" />

        {/* Betting Panel */}
        <BettingPanelMobile selectedCharacter={selectedCharacter} />
      </div>

      {/* Winner Overlay */}
      <WinnerShareOverlay />
    </div>
  );
}
