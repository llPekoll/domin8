/**
 * Secte Background Animated Overlays Configuration
 *
 * This module manages the animated overlay elements for the Secte background (bg2).
 * Each overlay is a separate animated sprite that can play idle animations and be clickable.
 *
 * IMPORTANT: All overlay sprites are the SAME SIZE as the background (bg.png).
 * They should be positioned at (0, 0) to perfectly align with the static background.
 * Only non-transparent pixels will be visible and clickable (pixel-perfect detection).
 */

export interface SecteOverlayAnimation {
  prefix: string; // Frame name prefix (e.g., "cat ")
  suffix: string; // Frame name suffix (e.g., ".aseprite")
  start: number; // First frame index
  end: number; // Last frame index
  frameRate: number; // Animation speed (fps)
}

export interface SecteOverlayConfig {
  key: string; // Texture key (e.g., "secte_cat")
  x: number; // X position on screen (should be 0 for full-size overlays)
  y: number; // Y position on screen (should be 0 for full-size overlays)
  scale: number; // Scale factor
  depth: number; // Render depth (higher = in front)
  animations: {
    idle: SecteOverlayAnimation; // Loops continuously
    click?: SecteOverlayAnimation; // Plays once on click (optional)
  };
  clickable: boolean; // Whether sprite can be clicked
}

/**
 * Secte overlay configurations
 * All overlays are full-screen size (same as bg.png)
 * Position values are relative offsets from center (will be calculated at runtime)
 * Only non-transparent pixels will be visible and clickable
 *
 * Frame organization (TODO: Update these frame ranges based on your actual animations):
 * - Idle: Frames that loop continuously
 * - Click: Frames that play once when clicked, then return to idle
 */
export const secteOverlays: SecteOverlayConfig[] = [
  {
    key: "secte_cat",
    x: 0, // Centered (offset from camera center)
    y: 0,
    scale: 1.0,
    depth: 3, // Between background (0) and characters (100+)
    animations: {
      idle: {
        prefix: "cat ",
        suffix: ".aseprite",
        start: 0,
        end: 23, // TODO: Update with actual idle frame range (example: 0-23)
        frameRate: 11, // ~90ms per frame = 11 fps
      },
      click: {
        prefix: "cat ",
        suffix: ".aseprite",
        start: 24,
        end: 46, // TODO: Update with actual click frame range (example: 24-46)
        frameRate: 15, // Slightly faster for click animation
      },
    },
    clickable: true,
  },
  {
    key: "secte_flame",
    x: 0, // Centered
    y: 0,
    scale: 1.0,
    depth: 1, // Just above background
    animations: {
      idle: {
        prefix: "flame ",
        suffix: ".aseprite",
        start: 0,
        end: 46, // All frames for idle (not clickable)
        frameRate: 11,
      },
    },
    clickable: false,
  },
  {
    key: "secte_statue",
    x: 0, // Centered
    y: 0,
    scale: 1.0,
    depth: 4, // Highest overlay layer, but still behind characters
    animations: {
      idle: {
        prefix: "statue ",
        suffix: ".aseprite",
        start: 0,
        end: 23, // TODO: Update with actual idle frame range
        frameRate: 11,
      },
      click: {
        prefix: "statue ",
        suffix: ".aseprite",
        start: 24,
        end: 46, // TODO: Update with actual click frame range
        frameRate: 15,
      },
    },
    clickable: true,
  },
  {
    key: "secte_stone",
    x: 0, // Centered
    y: 0,
    scale: 1.0,
    depth: 2, // Middle overlay layer
    animations: {
      idle: {
        prefix: "stone ",
        suffix: ".aseprite",
        start: 0,
        end: 46, // All frames for idle (not clickable)
        frameRate: 11,
      },
    },
    clickable: false,
  },
];

/**
 * Create and setup Secte overlays in a Phaser scene
 * Call this after the static background is added
 *
 * @param scene - The Phaser scene to add overlays to
 * @param backgroundScale - The scale applied to the background (overlays will match this)
 * @returns Array of created sprite objects
 */
export function createSecteOverlays(
  scene: Phaser.Scene,
  backgroundScale: number = 1.0
): Phaser.GameObjects.Sprite[] {
  const sprites: Phaser.GameObjects.Sprite[] = [];

  // Get camera center for positioning
  const centerX = scene.cameras.main.centerX;
  const centerY = scene.cameras.main.centerY;

  secteOverlays.forEach((config) => {
    console.log(`🎭 Creating overlay sprite: ${config.key}`);

    // Verify texture exists
    if (!scene.textures.exists(config.key)) {
      console.error(`❌ Texture '${config.key}' not found!`);
      return;
    }

    // Create sprite at camera center + offset
    const sprite = scene.add.sprite(centerX + config.x, centerY + config.y, config.key);
    sprite.setOrigin(0.5, 0.5); // Center origin
    sprite.setScale(backgroundScale); // Use the same scale as the background
    sprite.setDepth(config.depth);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // Pixel-perfect rendering

    console.log(`✅ Sprite created for ${config.key}:`, {
      position: { x: sprite.x, y: sprite.y },
      scale: sprite.scale,
      depth: sprite.depth,
      textureKey: config.key,
    });

    // Create idle animation if it doesn't exist
    const idleAnimKey = `${config.key}_idle`;
    if (!scene.anims.exists(idleAnimKey)) {
      console.log(`Creating idle animation: ${idleAnimKey}`, {
        prefix: config.animations.idle.prefix,
        suffix: config.animations.idle.suffix,
        start: config.animations.idle.start,
        end: config.animations.idle.end,
      });

      try {
        scene.anims.create({
          key: idleAnimKey,
          frames: scene.anims.generateFrameNames(config.key, {
            prefix: config.animations.idle.prefix,
            suffix: config.animations.idle.suffix,
            start: config.animations.idle.start,
            end: config.animations.idle.end,
          }),
          frameRate: config.animations.idle.frameRate,
          repeat: -1, // Loop forever
        });
        console.log(`✅ Idle animation created: ${idleAnimKey}`);
      } catch (error) {
        console.error(`❌ Failed to create idle animation ${idleAnimKey}:`, error);
        return;
      }
    }

    // Create click animation if configured
    if (config.animations.click) {
      const clickAnimKey = `${config.key}_click`;
      if (!scene.anims.exists(clickAnimKey)) {
        scene.anims.create({
          key: clickAnimKey,
          frames: scene.anims.generateFrameNames(config.key, {
            prefix: config.animations.click.prefix,
            suffix: config.animations.click.suffix,
            start: config.animations.click.start,
            end: config.animations.click.end,
          }),
          frameRate: config.animations.click.frameRate,
          repeat: 0, // Play once
        });
      }
    }

    // Play idle animation
    sprite.play(idleAnimKey);

    // Setup clickable interaction with pixel-perfect detection
    if (config.clickable) {
      sprite.setInteractive({
        pixelPerfect: true, // Only non-transparent pixels trigger clicks
        alphaTolerance: 1, // Pixels with alpha > 1 will count as hits (0-255)
        useHandCursor: true,
      });

      sprite.on("pointerdown", () => {
        console.log(`Clicked on ${config.key} (visible pixels only)!`);

        // Play click animation if available
        if (config.animations.click) {
          const clickAnimKey = `${config.key}_click`;
          sprite.play(clickAnimKey);

          // Return to idle after click animation completes
          sprite.once("animationcomplete", () => {
            sprite.play(idleAnimKey);
          });
        }
      });

      // Optional: Add hover effects (only on visible pixels)
      sprite.on("pointerover", () => {
        sprite.setTint(0xdddddd); // Slight highlight on hover
      });

      sprite.on("pointerout", () => {
        sprite.clearTint();
      });
    }

    sprites.push(sprite);
  });

  return sprites;
}
