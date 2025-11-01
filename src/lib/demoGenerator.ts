// Demo mode utilities - all client-side, no database
import { DEMO_TIMINGS } from "../config/demoTimings";
import { logger } from "./logger";

export const DEMO_BOT_NAMES = [
  "Shadow",
  "Blaze",
  "Frost",
  "Thunder",
  "Viper",
  "Phoenix",
  "Storm",
  "Titan",
  "Ghost",
  "Spark",
  "Crusher",
  "Ninja",
  "Savage",
  "Fury",
  "Chaos",
  "Doom",
  "Reaper",
  "Ace",
  "Nova",
  "Echo",
  "Bolt",
  "Striker",
  "Hunter",
  "Warrior",
];

export const DEMO_PARTICIPANT_COUNT = 20; // Always 20 for long game format

export interface DemoParticipant {
  _id: string; // Use _id to match database structure
  id: string; // Keep for backward compatibility
  displayName: string;
  character: any; // Full character object from database
  characterId?: any; // Optional for compatibility with Phaser
  colorHue: number;
  betAmount: number;
  size: number;
  power: number;
  position?: { x: number; y: number };
  spawnIndex: number;
  eliminated: false;
  isBot: true;
}

export function generateDemoParticipant(
  index: number,
  dbCharacters: any[], // Accept database characters as parameter
  position?: { x: number; y: number } // Position is now required (pre-calculated)
): DemoParticipant {
  // Random bot name (ensure unique)
  const name =
    DEMO_BOT_NAMES[Math.floor(Math.random() * DEMO_BOT_NAMES.length)] +
    Math.floor(Math.random() * 999);

  // Random character type from database
  const character = dbCharacters[Math.floor(Math.random() * dbCharacters.length)];

  // Random bet amount (0.01 - 1 SOL equivalent, represented as 10-1000 coins)
  const betAmount = Math.floor(Math.random() * 990) + 10;

  const id = `demo_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    _id: id, // Primary id for database compatibility
    id, // Keep for backward compatibility
    displayName: `${name} (BOT)`, // Add BOT label to make it clear
    character,
    colorHue: Math.floor(Math.random() * 360),
    betAmount,
    size: Math.max(0.8, Math.min(2.0, betAmount / 500)),
    power: betAmount,
    position,
    spawnIndex: index,
    eliminated: false,
    isBot: true,
  };
}

export function generateDemoWinner(participants: DemoParticipant[]): DemoParticipant {
  // Weighted random selection based on bet amounts
  const totalWeight = participants.reduce((sum, p) => sum + p.betAmount, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (const participant of participants) {
    cumulative += participant.betAmount;
    if (random <= cumulative) {
      return participant;
    }
  }

  return participants[0]; // Fallback
}

/**
 * Generate random spawn intervals with dramatic variance
 * Creates unpredictable timing: fast bursts, long pauses, everything in between
 * Characters spawn over ~20 seconds with totally random timing
 *
 * @param count - Number of spawns to generate
 * @param totalTime - Total time available (default 20 seconds)
 * @returns Array of cumulative spawn times in milliseconds
 */
export function generateRandomSpawnIntervals(
  count: number,
  totalTime: number = DEMO_TIMINGS.SPAWNING_PHASE_DURATION
): number[] {
  // For testing with small counts, spawn immediately
  if (count <= 3) {
    const intervals: number[] = [];
    for (let i = 0; i < count; i++) {
      intervals.push(DEMO_TIMINGS.TEST_MODE_SPAWN_INTERVAL * (i + 1));
    }
    return intervals;
  }

  const minInterval = DEMO_TIMINGS.BOT_SPAWN_MIN_INTERVAL;
  const maxInterval = DEMO_TIMINGS.BOT_SPAWN_MAX_INTERVAL;

  // Generate spawn timings with clustering behavior
  // Some spawns will be close together (bursts), others far apart (dramatic pauses)
  const spawnTimes: number[] = [];
  let remainingTime = totalTime;
  let remainingBots = count;

  logger.game.debug(
    `[DemoGenerator] 🎲 Generating spawn intervals for ${count} bots over ${totalTime}ms`
  );

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      // Last bot: use all remaining time to fill the 20 seconds
      spawnTimes.push(remainingTime);
      logger.game.debug(`[DemoGenerator] Bot ${i}: ${Math.round(remainingTime)}ms (final bot)`);
    } else {
      // Calculate average time per remaining bot
      const avgTime = remainingTime / remainingBots;

      // Create dramatic variance: 30% chance of burst spawn, 20% chance of long pause
      let randomInterval: number;
      const roll = Math.random();

      if (roll < 0.3) {
        // BURST: 30% chance - spawn very quickly (0.2-0.8s)
        randomInterval = minInterval + Math.random() * 600;
        logger.game.debug(`[DemoGenerator] Bot ${i}: ${Math.round(randomInterval)}ms ⚡ BURST`);
      } else if (roll < 0.5) {
        // LONG PAUSE: 20% chance - dramatic gap (2-3s)
        randomInterval = Math.max(
          minInterval,
          Math.min(maxInterval, avgTime * 1.5 + Math.random() * 1000)
        );
        logger.game.debug(`[DemoGenerator] Bot ${i}: ${Math.round(randomInterval)}ms 🕐 PAUSE`);
      } else {
        // NORMAL: 50% chance - varied timing around average (0.5-2s)
        randomInterval = Math.max(
          minInterval,
          Math.min(maxInterval, avgTime + (Math.random() - 0.5) * avgTime * 1.2)
        );
        logger.game.debug(`[DemoGenerator] Bot ${i}: ${Math.round(randomInterval)}ms 🎯 NORMAL`);
      }

      spawnTimes.push(randomInterval);
      remainingTime -= randomInterval;
      remainingBots--;
    }
  }

  // Calculate cumulative times for logging
  const cumulative = 0;

  logger.game.debug("[DemoGenerator] ✅ Spawn schedule:", {
    totalDuration: Math.round(cumulative),
    firstSpawn: Math.round(spawnTimes[0]),
    lastSpawn: Math.round(spawnTimes[spawnTimes.length - 1]),
    averageInterval: Math.round(cumulative / count),
  });

  return spawnTimes;
}
