import { Scene } from "phaser";
import { logger } from "../../lib/logger";
import { loadBackgroundConfig, BackgroundConfig } from "../config/backgrounds";

/**
 * BackgroundManager - Manages static and animated backgrounds with click support
 */
export class BackgroundManager {
  private scene: Scene;
  private background: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null = null;
  private currentConfig: BackgroundConfig | null = null;
  private centerX: number;
  private centerY: number;

  constructor(scene: Scene, centerX: number, centerY: number) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  /**
   * Update center coordinates (called on resize)
   */
  updateCenter(centerX: number, centerY: number) {
    this.centerX = centerX;
    this.centerY = centerY;

    if (this.background?.scene) {
      this.background.setPosition(this.centerX, this.centerY);
      this.scaleToFit();
    }
  }

  /**
   * Set background by ID (loads config from bg{id}.ts file)
   * This is the main method to use for the new config system
   */
  setBackgroundById(id: number): void {
    logger.game.debug(`[BackgroundManager] 🎨 Loading background ID: ${id}`);

    // Load config
    const config = loadBackgroundConfig(id);
    if (!config) {
      logger.game.error(`[BackgroundManager] ❌ Config not found for ID ${id}. Check bg${id}.ts exists.`);
      return;
    }

    logger.game.debug("[BackgroundManager] Config loaded:", {
      id: config.id,
      name: config.name,
      type: config.type,
      textureKey: config.textureKey,
      assetPath: config.assetPath,
    });

    // Verify texture was loaded by Preloader
    if (!this.scene.textures.exists(config.textureKey)) {
      logger.game.error(`[BackgroundManager] ❌ Texture '${config.textureKey}' not loaded!`, {
        hint: `Check Preloader.ts includes bg${id} in backgroundIds array`,
        configFile: `bg${id}.ts`,
        assetPath: config.assetPath,
        availableTextures: this.scene.textures.getTextureKeys(),
      });
      return;
    }

    // Store config and create background
    this.currentConfig = config;
    this.createBackgroundFromConfig(config);
  }

  /**
   * Set background from texture key (legacy method for old map system)
   */
  setTexture(textureKey: string): void {
    logger.game.debug(`[BackgroundManager] 🎨 setTexture (legacy): ${textureKey}`);

    if (!this.scene.textures.exists(textureKey)) {
      logger.game.error(`[BackgroundManager] ❌ Texture '${textureKey}' not found`);
      return;
    }

    // Create a temporary static config for legacy support
    const legacyConfig: BackgroundConfig = {
      id: 0,
      name: "Legacy",
      textureKey,
      assetPath: "",
      type: "static",
    };

    this.currentConfig = legacyConfig;
    this.createBackgroundFromConfig(legacyConfig);
  }

  /**
   * Create background game object from config
   */
  private createBackgroundFromConfig(config: BackgroundConfig): void {
    logger.game.debug("[BackgroundManager] Creating background:", config.type);

    // Clean up old background
    this.destroyBackground();

    // Create based on type
    if (config.type === "animated") {
      this.createAnimatedBackground(config);
    } else {
      this.createStaticBackground(config);
    }

    // Common setup for both types
    if (this.background) {
      this.background.setOrigin(0.5, 0.5);
      this.background.setDepth(0);
      this.background.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.scaleToFit();

      // Setup interactivity if configured
      if (config.clickable?.enabled) {
        this.setupClickable(config);
      }

      logger.game.debug("[BackgroundManager] ✅ Background created:", {
        type: config.type,
        width: this.background.width,
        height: this.background.height,
        clickable: !!config.clickable?.enabled,
      });
    }
  }

  /**
   * Create static image background
   */
  private createStaticBackground(config: BackgroundConfig): void {
    logger.game.debug("[BackgroundManager] Creating static image:", config.textureKey);
    this.background = this.scene.add.image(this.centerX, this.centerY, config.textureKey);
  }

  /**
   * Create animated sprite background
   */
  private createAnimatedBackground(config: BackgroundConfig): void {
    logger.game.debug("[BackgroundManager] Creating animated sprite:", config.textureKey);

    // Create sprite
    const sprite = this.scene.add.sprite(this.centerX, this.centerY, config.textureKey);
    this.background = sprite;

    // Setup animation if configured
    if (config.animations?.idle) {
      const animConfig = config.animations.idle;
      const animKey = `${config.textureKey}_idle`;

      logger.game.debug("[BackgroundManager] Setting up animation:", {
        key: animKey,
        prefix: animConfig.prefix,
        suffix: animConfig.suffix,
        frames: `${animConfig.start}-${animConfig.end}`,
        frameRate: animConfig.frameRate,
      });

      // Create animation definition if it doesn't exist
      if (!this.scene.anims.exists(animKey)) {
        try {
          this.scene.anims.create({
            key: animKey,
            frames: this.scene.anims.generateFrameNames(config.textureKey, {
              prefix: animConfig.prefix,
              suffix: animConfig.suffix,
              start: animConfig.start,
              end: animConfig.end,
            }),
            frameRate: animConfig.frameRate,
            repeat: -1, // Loop forever
          });

          logger.game.debug(`[BackgroundManager] Animation '${animKey}' created successfully`);
        } catch (error) {
          logger.game.error(`[BackgroundManager] Failed to create animation '${animKey}':`, error);
          return;
        }
      }

      // Play the animation
      try {
        sprite.play(animKey);
        logger.game.debug(`[BackgroundManager] ✅ Playing animation '${animKey}'`);
      } catch (error) {
        logger.game.error(`[BackgroundManager] Failed to play animation '${animKey}':`, error);
      }
    } else {
      logger.game.warn("[BackgroundManager] Animated background has no idle animation configured");
    }
  }

  /**
   * Setup clickable interaction
   */
  private setupClickable(config: BackgroundConfig): void {
    if (!this.background || !config.clickable) return;

    this.background.setInteractive({ cursor: "pointer" });

    this.background.on("pointerdown", () => {
      logger.game.debug("[BackgroundManager] Background clicked");

      if (!config.clickable) return;

      switch (config.clickable.action) {
        case "url":
          if (config.clickable.url) {
            logger.game.debug("[BackgroundManager] Opening URL:", config.clickable.url);
            window.open(config.clickable.url, "_blank");
          }
          break;
        case "custom":
          if (config.clickable.onClickHandler) {
            logger.game.debug("[BackgroundManager] Executing custom handler");
            config.clickable.onClickHandler(this.scene);
          }
          break;
        default:
          break;
      }
    });

    logger.game.debug("[BackgroundManager] ✅ Clickable setup complete");
  }

  /**
   * Scale background to cover entire screen
   */
  private scaleToFit(): void {
    if (!this.background?.scene) {
      return;
    }

    const scaleX = this.scene.cameras.main.width / this.background.width;
    const scaleY = this.scene.cameras.main.height / this.background.height;
    const scale = Math.max(scaleX, scaleY);

    this.background.setScale(scale);
  }

  /**
   * Destroy current background
   */
  private destroyBackground(): void {
    if (this.background) {
      logger.game.debug("[BackgroundManager] Destroying old background");
      this.background.destroy();
      this.background = null;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.destroyBackground();
  }
}
