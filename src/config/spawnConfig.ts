/**
 * Spawn Configuration
 * Controls the shape and positioning of participant spawn locations
 * NEW: Fully randomized spawns - no predictable patterns
 */
import { logger } from "../lib/logger";

export const SPAWN_CONFIG = {
  // Ellipse ratios - multiply radius by these values for each axis
  ELLIPSE_RATIO_X: 2.5, // 2.5x wider on horizontal axis
  ELLIPSE_RATIO_Y: 0.5, // 0.5x flatter on vertical axis

  // Spawn radius ranges
  MIN_SPAWN_RADIUS: 200, // Minimum distance from center
  MAX_SPAWN_RADIUS: 400, // Maximum distance from center

  // Position jitter (additional random offset after ellipse calculation)
  POSITION_JITTER_X: 80, // ±40 pixels horizontal
  POSITION_JITTER_Y: 60, // ±30 pixels vertical

  // Minimum distance between spawn points to avoid overlap
  MIN_DISTANCE_BETWEEN_SPAWNS: 50, // pixels
} as const;

/**
 * Calculate elliptical spawn position with randomness
 * @param angle - Angle in radians (0 to 2π)
 * @param radius - Base radius before ellipse transformation
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param withRandomness - Whether to apply jitter (default true)
 * @returns Position {x, y}
 */
export function calculateEllipsePosition(
  angle: number,
  radius: number,
  centerX: number,
  centerY: number,
  withRandomness: boolean = true
): { x: number; y: number } {
  const baseX = centerX + Math.cos(angle) * radius * SPAWN_CONFIG.ELLIPSE_RATIO_X;
  const baseY = centerY + Math.sin(angle) * radius * SPAWN_CONFIG.ELLIPSE_RATIO_Y;

  if (!withRandomness) {
    return { x: baseX, y: baseY };
  }

  // Add random jitter to make it unpredictable
  const jitterX = (Math.random() - 0.5) * SPAWN_CONFIG.POSITION_JITTER_X;
  const jitterY = (Math.random() - 0.5) * SPAWN_CONFIG.POSITION_JITTER_Y;

  return {
    x: baseX + jitterX,
    y: baseY + jitterY,
  };
}

/**
 * Calculate distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Generate truly random ellipse positions with collision avoidance
 * Each spawn point is:
 * - Random angle around the ellipse
 * - Random radius within range
 * - Random jitter applied
 * - Guaranteed minimum distance from other spawns
 *
 * @param count - Number of positions to generate
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @returns Array of random positions with no predictable pattern
 */
export function generateRandomEllipsePositions(
  count: number,
  centerX: number,
  centerY: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  logger.game.debug(`[SpawnConfig] 🎲 Generating ${count} FULLY RANDOM positions`);

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let position: { x: number; y: number } | null = null;
    const maxAttempts = 50; // Prevent infinite loop

    // Try to find a valid position that doesn't overlap with existing ones
    while (attempts < maxAttempts) {
      // Completely random angle (0 to 2π)
      const randomAngle = Math.random() * Math.PI * 2;

      // Completely random radius within range
      const randomRadius =
        SPAWN_CONFIG.MIN_SPAWN_RADIUS +
        Math.random() * (SPAWN_CONFIG.MAX_SPAWN_RADIUS - SPAWN_CONFIG.MIN_SPAWN_RADIUS);

      // Calculate position with jitter
      const candidatePosition = calculateEllipsePosition(
        randomAngle,
        randomRadius,
        centerX,
        centerY,
        true // Apply jitter
      );

      // Check if this position is far enough from existing positions
      let isTooClose = false;
      for (const existingPos of positions) {
        if (distance(candidatePosition, existingPos) < SPAWN_CONFIG.MIN_DISTANCE_BETWEEN_SPAWNS) {
          isTooClose = true;
          break;
        }
      }

      if (!isTooClose || positions.length === 0) {
        position = candidatePosition;
        break;
      }

      attempts++;
    }

    // If we couldn't find a non-overlapping position after many attempts, just use the last candidate
    if (!position) {
      const fallbackAngle = Math.random() * Math.PI * 2;
      const fallbackRadius =
        SPAWN_CONFIG.MIN_SPAWN_RADIUS +
        Math.random() * (SPAWN_CONFIG.MAX_SPAWN_RADIUS - SPAWN_CONFIG.MIN_SPAWN_RADIUS);
      position = calculateEllipsePosition(fallbackAngle, fallbackRadius, centerX, centerY, true);
      logger.game.warn(
        `[SpawnConfig] ⚠️ Could not find non-overlapping position for spawn ${i}, using fallback`
      );
    }

    positions.push(position);

    logger.game.debug(`[SpawnConfig] 🎯 Random spawn ${i}:`, {
      x: Math.round(position.x),
      y: Math.round(position.y),
      attempts,
    });
  }

  logger.game.debug(
    "[SpawnConfig] ✅ Generated positions - first 3:",
    positions.slice(0, 3).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  );
  logger.game.debug(
    "[SpawnConfig] ✅ Generated positions - last 3:",
    positions.slice(-3).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  );

  return positions;
}
