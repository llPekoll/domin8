import { useState, useEffect } from "react";
import { EventBus } from "../game/EventBus";
import { GamePhase } from "../game/managers/GlobalGameStateManager";

// Track latest phase globally so late-mounting components get the correct value
let latestPhase: GamePhase = GamePhase.IDLE;

// Global listener — runs once at module load, keeps latestPhase in sync
EventBus.on("game-phase-changed", (phase: GamePhase) => {
  latestPhase = phase;
});

/**
 * React hook that tracks the current Phaser game phase.
 * Reads the latest phase on mount, then listens for updates.
 */
export function useGamePhase(): GamePhase {
  const [phase, setPhase] = useState<GamePhase>(() => latestPhase);

  useEffect(() => {
    // Sync in case phase changed between render and effect
    setPhase(latestPhase);

    const handlePhaseChanged = (newPhase: GamePhase) => {
      setPhase(newPhase);
    };

    EventBus.on("game-phase-changed", handlePhaseChanged);
    return () => {
      EventBus.off("game-phase-changed", handlePhaseChanged);
    };
  }, []);

  return phase;
}

/** Phases where the betting panel should be visible */
const BETTING_PHASES = new Set<GamePhase>([
  GamePhase.INSERT_COIN,
  GamePhase.WAITING,
]);

export function isBettingPhase(phase: GamePhase): boolean {
  return BETTING_PHASES.has(phase);
}
