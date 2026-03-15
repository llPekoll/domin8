import { Scene } from "phaser";
import { charactersData } from "../main";
import { logger } from "../../lib/logger";

/**
 * Simplified preloader for debug scenes - only loads character assets
 */
export class DebugPreloader extends Scene {
  constructor() {
    super("DebugPreloader");
  }

  preload() {
    this.load.setPath("assets");

    // Load crown image for boss indicator testing
    this.load.image("crown", "misc/crown.png");

    // Check if character data is available
    if (!charactersData || charactersData.length === 0) {
      logger.game.error("[DebugPreloader] No characters data available!");
      return;
    }

    logger.game.info("[DebugPreloader] Loading", charactersData.length, "characters");

    // Load all character sprites dynamically from database
    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");
      const jsonPath = character.assetPath.replace(".png", ".json");
      logger.game.debug("[DebugPreloader] Loading character atlas:", key, character.assetPath);
      this.load.atlas(key, character.assetPath, jsonPath);
      // Also load JSON separately so we can access frameTags
      this.load.json(`${key}-json`, jsonPath);
    });

    // Log load errors for debugging
    this.load.on("loaderror", (file: any) => {
      logger.game.error("[DebugPreloader] Failed to load file:", file.key, file.src);
    });
  }

  create() {
    // Safety check before creating animations
    if (!charactersData || charactersData.length === 0) {
      logger.game.error("[DebugPreloader] No characters data for animations");
      this.scene.start("DebugCharScene");
      return;
    }

    // Create animations for all characters
    logger.game.info("[DebugPreloader] Creating animations for", charactersData.length, "characters");

    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");

      // Get the JSON atlas data from cache
      const jsonData = this.cache.json.get(`${key}-json`);

      if (!jsonData) {
        logger.game.warn(`[DebugPreloader] No JSON data found for ${key}`);
        return;
      }

      // Parse frameTags from the JSON metadata
      const frameTags = jsonData?.meta?.frameTags || [];

      if (frameTags.length === 0) {
        logger.game.warn(`[DebugPreloader] No frameTags found in ${key}.json`);
        return;
      }

      // Determine frame naming convention from first frame
      const frames = jsonData?.frames || [];
      if (frames.length === 0) {
        logger.game.warn(`[DebugPreloader] No frames found for ${key}`);
        return;
      }

      // Extract prefix and suffix from first frame filename
      const firstFrameName = frames[0].filename;
      let prefix = "";
      let suffix = "";

      if (firstFrameName.includes(".aseprite")) {
        suffix = ".aseprite";
        prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
      } else if (firstFrameName.includes(".ase")) {
        suffix = ".ase";
        prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
      } else if (firstFrameName.includes(".png")) {
        suffix = ".png";
        prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
      }

      // Helper function to determine if animation should loop
      const shouldLoop = (animName: string) => ["idle", "win", "run"].includes(animName);

      // Helper function to create a single animation
      const createAnimation = (animName: string, frameTag: any) => {
        const animKey = `${key}-${animName}`;

        if (this.anims.exists(animKey)) return;

        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNames(key, {
            prefix: prefix,
            suffix: suffix,
            start: frameTag.from,
            end: frameTag.to,
          }),
          frameRate: 10,
          repeat: shouldLoop(animName) ? -1 : 0,
        });

        logger.game.debug(`[DebugPreloader] Created animation: ${animKey}`);
      };

      // Store idle animation for fallback
      let idleFrameTag: any = null;

      frameTags.forEach((tag: any) => {
        const animName = tag.name.toLowerCase();
        if (animName === "idle") {
          idleFrameTag = tag;
        }
        createAnimation(animName, tag);
      });

      // Create fallback animations using idle if they don't exist
      const essentialAnims = ["idle", "walk", "run", "win", "falling", "landing", "poke", "poke1"];

      essentialAnims.forEach((animType) => {
        const animKey = `${key}-${animType}`;
        if (!this.anims.exists(animKey) && idleFrameTag) {
          createAnimation(animType, idleFrameTag);
        }
      });
    });

    logger.game.info("[DebugPreloader] Starting DebugCharScene");
    this.scene.start("DebugCharScene");
  }
}
