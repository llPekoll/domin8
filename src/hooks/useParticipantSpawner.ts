import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IRefPhaserGame } from "../PhaserGame";

/**
 * Custom hook to handle real-time participant spawning in Phaser game
 *
 * This hook:
 * - Subscribes to bets with character data for the current round
 * - Spawns characters with fall-from-sky animation when ready
 * - Prevents duplicate spawns
 * - Resets tracking when round changes
 *
 * @param phaserRef - Reference to the Phaser game instance
 * @param currentRoundState - Current game round state from blockchain
 */
export function useParticipantSpawner(
  phaserRef: React.RefObject<IRefPhaserGame | null>,
  currentRoundState: any
) {
  // Subscribe to bets with character data for real-time participant spawning
  const betsWithCharacters = useQuery(
    api.characters.getBetsWithCharacterData,
    currentRoundState ? { roundId: currentRoundState.roundId } : "skip"
  );
  console.log({ betsWithCharacters });
  // Track which participants have been spawned to prevent duplicates
  const spawnedParticipantIds = useRef(new Set<string>());

  // Reset spawned tracking when round changes
  useEffect(() => {
    if (currentRoundState) {
      console.log(
        `[useParticipantSpawner] Round changed to ${currentRoundState.roundId}, clearing spawn tracking`
      );
      spawnedParticipantIds.current.clear();
    }
  }, [currentRoundState?.roundId]);

  // Spawn participants in real-time as they place bets and get character assignments
  useEffect(() => {
    if (!betsWithCharacters || !phaserRef.current?.scene) return;

    const scene = phaserRef.current.scene as any;

    // Only spawn in real game scene (not demo)
    if (scene.scene.key !== "RoyalRumble") {
      console.log("[useParticipantSpawner] Not in RoyalRumble scene, skipping spawn");
      return;
    }

    // Check if scene has the spawn method
    if (typeof scene.spawnParticipantImmediately !== "function") {
      console.warn(
        "[useParticipantSpawner] Scene does not have spawnParticipantImmediately method"
      );
      return;
    }

    // Spawn each bet that's ready and not yet spawned
    betsWithCharacters.forEach((bet) => {
      // Only spawn if:
      // 1. Has character and position assigned (readyToSpawn)
      // 2. Not already spawned
      if (bet.readyToSpawn && !spawnedParticipantIds.current.has(bet._id)) {
        console.log(`🎮 [useParticipantSpawner] Spawning participant for bet ${bet.betIndex}:`, {
          betId: bet._id,
          character: bet.character?.name,
          amount: bet.amount / 1_000_000_000, // Convert lamports to SOL
          position: bet.position,
          displayName: bet.displayName,
        });

        // Spawn the character with fall-from-sky animation
        scene.spawnParticipantImmediately({
          _id: bet._id,
          betAmount: bet.amount / 1_000_000_000, // Convert lamports to SOL for scale calculation
          character: bet.character || { name: "Warrior", spriteKey: "warrior" },
          spawnIndex: bet.betIndex || 0,
          displayName: bet.displayName,
          isBot: false,
          position: bet.position,
        });

        // Mark as spawned
        spawnedParticipantIds.current.add(bet._id);

        console.log(
          `✅ [useParticipantSpawner] Participant spawned successfully, total spawned: ${spawnedParticipantIds.current.size}`
        );
      }
    });
  }, [betsWithCharacters, phaserRef]);

  return {
    betsWithCharacters,
    spawnedCount: spawnedParticipantIds.current.size,
  };
}
