/**
 * Spawn Configuration
 * Controls the shape and positioning of participant spawn locations
 * NEW: Per-map ellipse configuration based on Aseprite measurements
 */
import { logger } from "../lib/logger";

/**
 * Map-specific spawn configuration
 * Measurements taken from Aseprite ellipse tool
 */
export interface MapSpawnConfig {
  centerX: number; // Center X position in pixels
  centerY: number; // Center Y position in pixels (from top of image)
  radiusX: number; // Horizontal ellipse radius (from Aseprite measurement)
  radiusY: number; // Vertical ellipse radius (max of top/bottom)
  minSpawnRadius: number; // Inner dead zone (avoid center clustering)
  maxSpawnRadius: number; // Outer spawn boundary (radiusY - character margin)
  minSpacing: number; // Minimum distance between character spawns
}

/**
 * Calculate elliptical spawn position
 * @param angle - Angle in radians (0 to 2π)
 * @param radius - Distance from center
 * @param config - Map-specific spawn configuration
 * @returns Position {x, y}
 */
export function calculateEllipsePosition(
  angle: number,
  radius: number,
  config: MapSpawnConfig
): { x: number; y: number } {
  // Calculate position on ellipse using radiusX and radiusY from config
  const normalizedRadius = radius / config.radiusY; // Normalize to vertical radius
  const x = config.centerX + Math.cos(angle) * config.radiusX * normalizedRadius;
  const y = config.centerY + Math.sin(angle) * config.radiusY * normalizedRadius;

  return { x, y };
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
 * - Random radius within map-specific range
 * - Guaranteed minimum distance from other spawns
 *
 * @param count - Number of positions to generate
 * @param config - Map-specific spawn configuration (from database)
 * @returns Array of random positions with no predictable pattern
 */
export function generateRandomEllipsePositions(
  count: number,
  config: MapSpawnConfig
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  logger.game.debug(`[SpawnConfig] 🎲 Generating ${count} random positions with config:`, {
    centerX: config.centerX,
    centerY: config.centerY,
    radiusX: config.radiusX,
    radiusY: config.radiusY,
    minSpawnRadius: config.minSpawnRadius,
    maxSpawnRadius: config.maxSpawnRadius,
  });

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let position: { x: number; y: number } | null = null;
    const maxAttempts = 50; // Prevent infinite loop

    // Try to find a valid position that doesn't overlap with existing ones
    while (attempts < maxAttempts) {
      // Completely random angle (0 to 2π)
      const randomAngle = Math.random() * Math.PI * 2;

      // Completely random radius within map-specific range
      const randomRadius =
        config.minSpawnRadius + Math.random() * (config.maxSpawnRadius - config.minSpawnRadius);

      // Calculate position on ellipse
      const candidatePosition = calculateEllipsePosition(randomAngle, randomRadius, config);

      // Check if this position is far enough from existing positions
      let isTooClose = false;
      for (const existingPos of positions) {
        if (distance(candidatePosition, existingPos) < config.minSpacing) {
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
        config.minSpawnRadius + Math.random() * (config.maxSpawnRadius - config.minSpawnRadius);
      position = calculateEllipsePosition(fallbackAngle, fallbackRadius, config);
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
