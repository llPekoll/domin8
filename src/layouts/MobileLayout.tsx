import { RefObject } from "react";
import { IRefPhaserGame, PhaserGame } from "../PhaserGame";
import { HeaderMobile } from "../components/HeaderMobile";
import { CharacterCarouselMobile } from "../components/CharacterCarouselMobile";
import { PotDisplayMobile } from "../components/PotDisplayMobile";
import { ParticipantListMobile } from "../components/ParticipantListMobile";
import { BettingPanelMobile } from "../components/BettingPanelMobile";
import { WinnerShareOverlay } from "../components/WinnerShareOverlay";
import { ConnectWalletMobile } from "../components/ConnectWalletMobile";
import type { Character } from "../types/character";

interface MobileLayoutProps {
  phaserRef: RefObject<IRefPhaserGame | null>;
  selectedCharacter: Character | null;
  onCharacterSelected: (character: Character | null) => void;
  walletReady: boolean;
  connected: boolean;
}

export function MobileLayout({
  phaserRef,
  selectedCharacter,
  onCharacterSelected,
  walletReady,
  connected,
}: MobileLayoutProps) {
  return (
    <div className="flex flex-col h-[100dvh] bg-black overflow-hidden">
      {/* Connect Wallet Overlay - Shows when not connected */}
      {walletReady && !connected && <ConnectWalletMobile />}

      {/* Minimal Header - Logo + Balance */}
      <HeaderMobile />

      {/* Phaser Game - Top portion */}
      <div className="h-[35vh] w-full relative flex-shrink-0">
        <PhaserGame ref={phaserRef} />
      </div>

      {/* Character Selection - Horizontal strip */}
      <CharacterCarouselMobile onCharacterSelected={onCharacterSelected} />

      {/* Pot Display - Compact bar */}
      <PotDisplayMobile />

      {/* Player List - Scrollable middle */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <ParticipantListMobile />
      </div>

      {/* Betting Panel - Fixed bottom */}
      <BettingPanelMobile selectedCharacter={selectedCharacter} />

      {/* Winner Overlay */}
      <WinnerShareOverlay />
    </div>
  );
}
