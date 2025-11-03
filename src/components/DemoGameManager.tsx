import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  DemoParticipant,
  generateDemoParticipant,
  generateDemoWinner,
  generateRandomSpawnIntervals,
  DEMO_PARTICIPANT_COUNT,
} from "../lib/demoGenerator";
import { IRefPhaserGame } from "../PhaserGame";
import { DEMO_TIMINGS } from "../config/demoTimings";
import { generateRandomEllipsePositions } from "../config/spawnConfig";
import { logger } from "../lib/logger";

export type DemoPhase = "spawning" | "arena" | "results";

interface DemoGameManagerProps {
  isActive: boolean; // True when no real game exists
  phaserRef: React.RefObject<IRefPhaserGame | null>;
}

export interface DemoState {
  isActive: boolean;
  phase: DemoPhase;
  countdown: number;
  participants: DemoParticipant[];
  map: any;
}

export interface DemoStateForUI {
  phase: DemoPhase;
  countdown: number;
  participantCount: number;
}

export function DemoGameManager({ isActive, phaserRef }: DemoGameManagerProps) {
  const [countdown, setCountdown] = useState(30);
  const [spawnedParticipants, setSpawnedParticipants] = useState<DemoParticipant[]>([]);
  const [phase, setPhase] = useState<DemoPhase>("spawning");
  const [shuffledPositions, setShuffledPositions] = useState<Array<{ x: number; y: number }>>([]);
  const isSpawningRef = useRef(false);
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const spawnCountRef = useRef(0);

  // Get the preloaded demo map and characters from Phaser
  // These are already loaded in Preloader, so we just fetch them for reference
  const allMapsQuery = useQuery(api.maps.getAllActiveMaps);
  const charactersQuery = useQuery(api.characters.getActiveCharacters);

  // Memoize to prevent reference changes from triggering re-spawns
  const characters = useMemo(() => charactersQuery ?? undefined, [charactersQuery?.length]);

  // Select random map client-side (only recalculate when map count changes)
  const demoMap = useMemo(() => {
    if (!allMapsQuery || allMapsQuery.length === 0) return undefined;
    return allMapsQuery[Math.floor(Math.random() * allMapsQuery.length)];
  }, [allMapsQuery?.length]);

  // Notify parent of state changes AND update Phaser UI
  useEffect(() => {
    // Update Phaser DemoScene UI
    if (phaserRef.current?.scene?.scene.key === "DemoScene") {
      const scene = phaserRef.current.scene as any;
      if (scene.updateDemoUI) {
        scene.updateDemoUI(phase, countdown, spawnedParticipants.length);
      }
    }
  }, [phase, countdown, spawnedParticipants.length, phaserRef]);

  // Initialize demo mode when activated
  useEffect(() => {
    if (isActive) {
      setCountdown(DEMO_TIMINGS.SPAWNING_PHASE_DURATION / 1000); // Convert to seconds
      setSpawnedParticipants([]);
      setPhase("spawning");

      // Generate truly random positions around ellipse with collision avoidance
      logger.game.debug("[DemoGameManager] 🎲 GENERATING RANDOM POSITIONS - New Game");
      const newRandomPositions = generateRandomEllipsePositions(
        DEMO_PARTICIPANT_COUNT,
        512, // centerX
        384 // centerY
      );
      setShuffledPositions(newRandomPositions);
      logger.game.debug(
        "[DemoGameManager] First 3 positions in new game:",
        newRandomPositions.slice(0, 3).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      );

      isSpawningRef.current = false;
      spawnCountRef.current = 0;
      spawnTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      spawnTimeoutsRef.current = [];
    } else {
      // Clean up when deactivated
      logger.game.debug("[DemoGameManager] Deactivating demo mode");
      setSpawnedParticipants([]);
      setShuffledPositions([]);
      isSpawningRef.current = false;
      spawnCountRef.current = 0;
      spawnTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      spawnTimeoutsRef.current = [];
    }
  }, [isActive]);

  // Demo countdown timer (20s spawning phase)
  useEffect(() => {
    if (!isActive || phase !== "spawning") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Transition to arena phase after 20 seconds
          setPhase("arena");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, phase]);

  // Gradually spawn demo bots with random intervals during the 20-second spawning phase
  useEffect(() => {
    if (
      !isActive ||
      phase !== "spawning" ||
      !demoMap ||
      !characters ||
      characters.length === 0 ||
      shuffledPositions.length === 0
    ) {
      logger.game.debug("[DemoGameManager] Spawn effect early return - conditions not met", {
        isActive,
        phase,
        hasDemoMap: !!demoMap,
        hasCharacters: (characters?.length ?? 0) > 0,
        hasPositions: shuffledPositions.length > 0,
      });
      return;
    }

    // Check if already spawning to prevent double spawning
    if (isSpawningRef.current || spawnTimeoutsRef.current.length > 0) {
      logger.game.debug("[DemoGameManager] Already spawning or timeouts exist, skipping", {
        isSpawning: isSpawningRef.current,
        timeoutCount: spawnTimeoutsRef.current.length,
      });
      return;
    }

    logger.game.debug("[DemoGameManager] Starting spawn sequence");
    isSpawningRef.current = true;
    spawnCountRef.current = 0; // Reset spawn count

    // Generate random spawn intervals for all bots
    const spawnIntervals = generateRandomSpawnIntervals(DEMO_PARTICIPANT_COUNT);

    // Clear any existing timeouts first
    spawnTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    spawnTimeoutsRef.current = [];

    // Schedule each bot spawn with its random interval
    let cumulativeTime = 0;
    spawnIntervals.forEach((interval, index) => {
      cumulativeTime += interval;

      const timeout = setTimeout(() => {
        // Use ref-based counting to avoid race conditions
        if (spawnCountRef.current >= DEMO_PARTICIPANT_COUNT) {
          logger.game.debug(`[DemoGameManager] Spawn ${index}: Max participants reached via ref`);
          return;
        }

        const currentSpawnIndex = spawnCountRef.current;
        spawnCountRef.current++;

        // Get next position from shuffled state
        if (!shuffledPositions || shuffledPositions.length === 0) {
          logger.game.error("[DemoGameManager] No shuffled positions available!");
          return;
        }

        const nextPosition = shuffledPositions[currentSpawnIndex];
        if (!nextPosition) {
          logger.game.error(`[DemoGameManager] No position at index ${currentSpawnIndex}`);
          return;
        }

        logger.game.debug(`[DemoGameManager] 🎯 USING SHUFFLED POSITION - Spawn #${currentSpawnIndex}:`, {
          arrayIndex: currentSpawnIndex,
          totalPositions: shuffledPositions.length,
          position: { x: Math.round(nextPosition.x), y: Math.round(nextPosition.y) },
          isFromShuffledArray: true,
        });

        const newParticipant = generateDemoParticipant(
          currentSpawnIndex,
          characters,
          nextPosition // Use shuffled position from pre-generated list
        );

        logger.game.debug(`[DemoGameManager] ✅ Participant created with position:`, {
          id: newParticipant._id,
          spawnIndex: currentSpawnIndex,
          participantPosition: newParticipant.position,
          matchesShuffledArray:
            Math.round(newParticipant.position!.x) === Math.round(nextPosition.x) &&
            Math.round(newParticipant.position!.y) === Math.round(nextPosition.y),
          totalSpawned: spawnCountRef.current,
        });

        // Spawn in Phaser scene first
        if (phaserRef.current?.scene?.scene.key === "DemoScene") {
          logger.game.debug(`[DemoGameManager] Calling spawnDemoParticipant for ${newParticipant._id}`);
          (phaserRef.current.scene as any).spawnDemoParticipant?.(newParticipant);
        }

        // Then update state
        setSpawnedParticipants((prev) => {
          logger.game.debug(
            `[DemoGameManager] Updating state: prev.length=${prev.length}, adding ${newParticipant._id}`
          );
          return [...prev, newParticipant];
        });
      }, cumulativeTime);

      spawnTimeoutsRef.current.push(timeout);
    });

    // Cleanup all timeouts on unmount or phase change
    return () => {
      logger.game.debug("[DemoGameManager] Spawn effect cleanup, clearing timeouts");
      spawnTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      spawnTimeoutsRef.current = [];
      // Don't reset isSpawningRef here - only reset when phase changes to spawning
    };
  }, [isActive, phase, demoMap, characters, shuffledPositions]);

  // Handle arena phase: move bots to center and determine winner
  useEffect(() => {
    if (!isActive || phase !== "arena" || spawnedParticipants.length === 0) return;

    // Immediately move all participants to center when arena starts
    if (phaserRef.current?.scene) {
      const scene = phaserRef.current.scene;
      if (scene.scene.key === "DemoScene") {
        (scene as any).moveParticipantsToCenter?.();
      }
    }

    // After 2 seconds (when they reach center), start explosion
    const explosionTimer = setTimeout(() => {
      const winner = generateDemoWinner(spawnedParticipants);

      // Trigger explosion + physics
      if (phaserRef.current?.scene) {
        const scene = phaserRef.current.scene;
        if (scene.scene.key === "DemoScene") {
          (scene as any).showDemoWinner?.(winner);
        }
      }

      setPhase("results");

      // After results phase duration, restart demo
      setTimeout(() => {
        // Clear participants in DemoScene
        if (phaserRef.current?.scene) {
          const scene = phaserRef.current.scene;
          if (scene.scene.key === "DemoScene") {
            (scene as any).clearDemoParticipants?.();
          }
        }

        // Reset demo state
        setCountdown(DEMO_TIMINGS.SPAWNING_PHASE_DURATION / 1000); // Convert to seconds
        setSpawnedParticipants([]);

        // Regenerate random positions for next game
        const newRandomPositions = generateRandomEllipsePositions(DEMO_PARTICIPANT_COUNT, 512, 384);
        setShuffledPositions(newRandomPositions);

        isSpawningRef.current = false;
        spawnCountRef.current = 0;
        spawnTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
        spawnTimeoutsRef.current = [];
        setPhase("spawning");
      }, DEMO_TIMINGS.RESULTS_PHASE_DURATION);
    }, 2000); // 2 seconds for bots to reach center, then explosion

    return () => clearTimeout(explosionTimer);
  }, [isActive, phase, spawnedParticipants]);

  // Set demo map when scene is ready and map is loaded
  useEffect(() => {
    logger.game.debug("[DemoGameManager] Set map effect triggered", {
      isActive,
      hasDemoMap: !!demoMap,
      mapName: demoMap?.name,
      backgroundKey: demoMap?.background,
      sceneExists: !!phaserRef.current?.scene,
      sceneKey: phaserRef.current?.scene?.scene.key,
      setDemoMapExists: typeof (phaserRef.current?.scene as any)?.setDemoMap === "function",
    });

    if (!isActive || !demoMap || !phaserRef.current?.scene) {
      return;
    }

    const scene = phaserRef.current.scene;
    if (scene.scene.key === "DemoScene") {
      logger.game.debug("[DemoGameManager] Calling setDemoMap on DemoScene with:", {
        mapName: demoMap.name,
        backgroundKey: demoMap.background,
        assetPath: demoMap.assetPath,
      });
      (scene as any).setDemoMap?.(demoMap);
    }
  }, [isActive, demoMap, phaserRef.current?.scene]);

  // This component doesn't render anything, it just manages state
  return null;
}
