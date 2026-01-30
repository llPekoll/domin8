import { Scene } from "phaser";
import {
  currentMapData,
  charactersData,
  allMapsData,
  demoMapData,
  activeGameData,
  blockchainDataReady,
  GAME_STATUS,
} from "../main";
import { logger } from "../../lib/logger";
import { loadBackgroundConfig } from "../config/backgrounds";
import { EventBus } from "../EventBus";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  private percentText!: Phaser.GameObjects.Text;
  private loadingBars: Phaser.GameObjects.Rectangle[] = [];
  private monkeSprite!: Phaser.GameObjects.Sprite;

  init() {
    // Reset state for scene restarts
    this.loadingBars = [];
    this.monkeSprite = undefined!;

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Create segmented loading bar (like the image)
    const barCount = 100;
    const barWidth = 8;
    const barHeight = 24;
    const barSpacing = 2;
    const totalWidth = barCount * (barWidth + barSpacing);
    const startX = centerX - totalWidth / 2;
    const barY = centerY + 150;

    // Create bar outline/background
    this.add
      .rectangle(centerX, barY, totalWidth + 20, barHeight + 10)
      .setStrokeStyle(2, 0xffffff)
      .setFillStyle(0x000000, 0.5);

    // Create individual bar segments
    for (let i = 0; i < barCount; i++) {
      const bar = this.add.rectangle(
        startX + i * (barWidth + barSpacing) + barWidth / 2,
        barY,
        barWidth,
        barHeight,
        0x333333
      );
      this.loadingBars.push(bar);
    }

    // Add "Loading" and percentage on same line, aligned right below the bar
    const rightEdge = centerX + totalWidth / 2;

    this.percentText = this.add
      .text(rightEdge, barY + 50, "0%", {
        fontFamily: "jersey15",
        fontSize: "36px",
        color: "#ffffff",
      })
      .setOrigin(1, 0.5); // Right-aligned

    // Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
    this.load.on("progress", (progress: number) => {
      // Update segmented bars
      const filledBars = Math.floor(progress * this.loadingBars.length);
      for (let i = 0; i < this.loadingBars.length; i++) {
        if (i < filledBars) {
          this.loadingBars[i].setFillStyle(0xffffff);
        } else {
          this.loadingBars[i].setFillStyle(0x333333);
        }
      }

      // Update percentage text
      this.percentText.setText(`${Math.floor(progress * 100)}%`);
    });

    // Create monke immediately (assets loaded in Boot scene)
    this.createMonkeAnimation();
  }

  private createMonkeAnimation() {
    // Prevent creating multiple sprites
    if (this.monkeSprite) return;

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;
    const barY = centerY + 150;

    // Same bar dimensions as in init()
    const barCount = 100;
    const barWidth = 8;
    const barSpacing = 2;
    const totalWidth = barCount * (barWidth + barSpacing);
    const leftEdge = centerX - totalWidth / 2;

    // Check if atlas is loaded
    if (!this.textures.exists("monke-loader")) return;

    // Create win animation for monke loader
    if (!this.anims.exists("monke-loader-win")) {
      this.anims.create({
        key: "monke-loader-win",
        frames: this.anims.generateFrameNames("monke-loader", {
          prefix: "monke ",
          suffix: ".ase",
          start: 18,
          end: 33,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Create the monke sprite on the LEFT, above the loading bar
    this.monkeSprite = this.add.sprite(leftEdge + 80, barY - 120, "monke-loader");
    this.monkeSprite.setScale(5);
    this.monkeSprite.play("monke-loader-win");
  }

  preload() {
    this.load.setPath("assets");

    // Note: monke-loader assets are loaded in Boot scene for instant display

    // Load custom fonts
    this.load.addFile(
      new Phaser.Loader.FileTypes.FontFile(this.load, {
        type: "font",
        key: "metal-slug",
        url: "fonts/metal-slug-colour.colr.ttf",
      } as any)
    );
    this.load.addFile(
      new Phaser.Loader.FileTypes.FontFile(this.load, {
        type: "font",
        key: "jersey",
        url: "fonts/Jersey10-Regular.ttf",
      } as any)
    );
    this.load.addFile(
      new Phaser.Loader.FileTypes.FontFile(this.load, {
        type: "font",
        key: "jersey15",
        url: "fonts/Jersey15-Regular.ttf",
      } as any)
    );

    // Check if data is available (should always be true due to PhaserGame.tsx guard)
    if (!charactersData || charactersData.length === 0) {
      logger.game.error("[Preloader] No characters data available! This should not happen.");
      return;
    }
    if (!allMapsData || allMapsData.length === 0) {
      logger.game.error("[Preloader] No maps data available!");
      return;
    }

    logger.game.debug("[Preloader] Data check passed:", {
      charactersCount: charactersData.length,
      mapsCount: allMapsData.length,
      demoMap: demoMapData?.name,
      currentMap: currentMapData?.name || "none",
    });

    // Load all character sprites dynamically from database
    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");
      const jsonPath = character.assetPath.replace(".png", ".json");
      logger.game.debug("[Preloader] Loading character atlas:", key, character.assetPath);
      this.load.atlas(key, character.assetPath, jsonPath);
      // Also load JSON separately with a different key so we can access frameTags in create()
      this.load.json(`${key}-json`, jsonPath);
    });

    // Load background configs (animated/static backgrounds)
    // Get map IDs from database to know which backgrounds to load
    const backgroundIds = allMapsData.map((map) => map.id);

    console.log("🎨🎨🎨 PRELOADER: About to load backgrounds, IDs:", backgroundIds);
    logger.game.debug("[Preloader] 🎨 Starting to load background configs from maps...");

    backgroundIds.forEach((id) => {
      console.log(`🔍 PRELOADER: Loading background ID ${id}...`);
      const bgConfig = loadBackgroundConfig(id);

      if (!bgConfig) {
        console.error(`❌ PRELOADER: Failed to load config for ID ${id}`);
        logger.game.error(`[Preloader] ❌ Failed to load config for background ID ${id}`);
        return;
      }

      console.log(`✅ PRELOADER: Config loaded for bg${id}:`, bgConfig);
      logger.game.debug(`[Preloader] ✅ Config loaded for bg${id}:`, {
        name: bgConfig.name,
        textureKey: bgConfig.textureKey,
        assetPath: bgConfig.assetPath,
        type: bgConfig.type,
      });

      if (bgConfig.type === "animated") {
        // Load as atlas for animated backgrounds
        const jsonPath = bgConfig.assetPath.replace(".png", ".json");

        logger.game.debug(`[Preloader] 📦 Loading animated atlas:`, {
          textureKey: bgConfig.textureKey,
          pngPath: bgConfig.assetPath,
          jsonPath: jsonPath,
          fullPngPath: `assets/${bgConfig.assetPath}`,
          fullJsonPath: `assets/${jsonPath}`,
        });

        this.load.atlas(bgConfig.textureKey, bgConfig.assetPath, jsonPath);
        console.log(`📦 PRELOADER: load.atlas() called for '${bgConfig.textureKey}'`);
      } else {
        // Load as image for static backgrounds
        logger.game.debug(
          `[Preloader] 🖼️ Loading static image:`,
          bgConfig.textureKey,
          bgConfig.assetPath
        );
        this.load.image(bgConfig.textureKey, bgConfig.assetPath);
      }

      // Load overlays if configured
      if (bgConfig.overlays && bgConfig.overlays.length > 0) {
        bgConfig.overlays.forEach((overlay) => {
          const overlayJsonPath = overlay.assetPath.replace(".png", ".json");
          logger.game.debug(`[Preloader] 🎭 Loading overlay atlas:`, {
            textureKey: overlay.textureKey,
            pngPath: overlay.assetPath,
            jsonPath: overlayJsonPath,
          });
          this.load.atlas(overlay.textureKey, overlay.assetPath, overlayJsonPath);
          console.log(`🎭 PRELOADER: load.atlas() called for overlay '${overlay.textureKey}'`);
        });
      }
    });

    logger.game.debug("[Preloader] 🎨 Background configs queued for loading");

    // Load VFX assets
    this.load.atlas("explosion-fullscreen", "vfx/fight-effect.png", "vfx/fight-effect.json");
    this.load.atlas("blood", "vfx/blood_spritesheet.png", "vfx/blood_spritesheet.json");
    this.load.atlas("dust", "dust_char.png", "dust_char.json");
    this.load.image("logo", "logo.webp");

    // Load arena masks for each map
    this.load.image("mask_classic", "maps/classic/mask_classic.png");
    this.load.image("mask_secte", "maps/secte/mask_secte.png");

    // Load winner throne
    this.load.image("throne", "misc/throne.png");

    // Load boss crown indicator
    this.load.image("crown", "misc/crown.png");

    // Load badge assets
    this.load.image("badge-lvl1-1", "badge/badge-lvl1-1.png");
    this.load.image("badge-lvl1-2", "badge/badge-lvl1-2.png");
    this.load.image("badge-lvl1-3", "badge/badge-lvl1-3.png");
    this.load.image("badge-lvl2-1", "badge/badge-lvl2-1.png");
    this.load.image("badge-lvl2-2", "badge/badge-lvl2-2.png");
    this.load.image("badge-lvl2-3", "badge/badge-lvl2-3.png");
    this.load.image("badge-lvl2-4", "badge/badge-lvl2-4.png");
    this.load.image("badge-lvl3-1", "badge/badge-lvl3-1.png");
    this.load.image("badge-lvl4-1", "badge/badge-lvl4-1.png");

    // Load sound effects
    this.load.audio("battle-theme", "sounds/battleThemeA.mp3");
    this.load.audio("fire-sounds", "sounds/fire-sounds.mp3");
    this.load.audio("domin8-intro", "sounds/domin8-intro.mp3");
    this.load.audio("explosion-dust", "sounds/explosion-dust.wav");
    this.load.audio("victory", "sounds/victory2.mp3");
    this.load.audio("insert-coin", "sounds/insert-coin.mp3");
    this.load.audio("challenger", "sounds/challenger.mp3");
    this.load.audio("countdown-5sec", "sounds/5-second-countdown.mp3");
    this.load.audio("boss-power-up", "sounds/01-power-up-mario.mp3");

    // Load impact sounds for character landing
    this.load.audio("impact-1", "sounds/impacts/sfx_sounds_impact1.wav");
    this.load.audio("impact-3", "sounds/impacts/sfx_sounds_impact3.wav");
    this.load.audio("impact-4", "sounds/impacts/sfx_sounds_impact4.wav");
    this.load.audio("impact-5", "sounds/impacts/sfx_sounds_impact5.wav");
    this.load.audio("impact-6", "sounds/impacts/sfx_sounds_impact6.wav");
    this.load.audio("impact-7", "sounds/impacts/sfx_sounds_impact7.wav");
    this.load.audio("impact-8", "sounds/impacts/sfx_sounds_impact8.wav");

    // Load death scream sounds for character elimination
    this.load.audio("death-scream-1", "sounds/death-screams/human/sfx_deathscream_human1.wav");
    this.load.audio("death-scream-2", "sounds/death-screams/human/sfx_deathscream_human2.wav");
    this.load.audio("death-scream-3", "sounds/death-screams/human/sfx_deathscream_human3.wav");
    this.load.audio("death-scream-4", "sounds/death-screams/human/sfx_deathscream_human4.wav");
    this.load.audio("death-scream-5", "sounds/death-screams/human/sfx_deathscream_human5.wav");
    this.load.audio("death-scream-6", "sounds/death-screams/human/sfx_deathscream_human6.wav");
    this.load.audio("death-scream-7", "sounds/death-screams/human/sfx_deathscream_human7.wav");
    this.load.audio("death-scream-8", "sounds/death-screams/human/sfx_deathscream_human8.wav");
    this.load.audio("death-scream-9", "sounds/death-screams/human/sfx_deathscream_human9.wav");
    this.load.audio("death-scream-10", "sounds/death-screams/human/sfx_deathscream_human10.wav");
    this.load.audio("death-scream-11", "sounds/death-screams/human/sfx_deathscream_human11.wav");
    this.load.audio("death-scream-12", "sounds/death-screams/human/sfx_deathscream_human12.wav");
    this.load.audio("death-scream-13", "sounds/death-screams/human/sfx_deathscream_human13.wav");
    this.load.audio("death-scream-14", "sounds/death-screams/human/sfx_deathscream_human14.wav");

    // Log load errors for debugging
    this.load.on("loaderror", (file: any) => {
      console.error("❌❌❌ PRELOADER LOAD ERROR:", file.key, file.src, file);
      logger.game.error("[Preloader] Failed to load file:", file.key, file.src);
    });
  }

  create() {
    // Safety check before creating animations
    if (!charactersData || charactersData.length === 0) {
      logger.game.error("[Preloader] No characters data for animations, starting DemoScene anyway");
      this.scene.start("Demo");
      return;
    }

    // Create animations for all characters dynamically by parsing frameTags from JSON atlas
    logger.game.debug("[Preloader] Creating animations for", charactersData.length, "characters");
    console.log(
      "✅ [Preloader] Starting animation creation for",
      charactersData.length,
      "characters"
    );

    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");
      console.log(`✅ [Preloader] Processing character: ${character.name}, key: ${key}`);

      // Get the JSON atlas data from cache (loaded with -json suffix)
      const jsonData = this.cache.json.get(`${key}-json`);
      console.log(
        `✅ [Preloader] JSON data for ${key}:`,
        jsonData ? "FOUND" : "NOT FOUND",
        jsonData
      );

      if (!jsonData) {
        logger.game.warn(`[Preloader] No JSON data found for ${key}, skipping animation creation`);
        console.error(`❌ [Preloader] No JSON data found for ${key}`);
        return;
      }

      // Parse frameTags from the JSON metadata
      const frameTags = jsonData?.meta?.frameTags || [];
      console.log(`✅ [Preloader] frameTags for ${key}:`, frameTags.length, frameTags);

      if (frameTags.length === 0) {
        logger.game.warn(`[Preloader] No frameTags found in ${key}.json, skipping`);
        console.error(`❌ [Preloader] No frameTags found in ${key}.json`);
        return;
      }

      logger.game.debug(`[Preloader] Found ${frameTags.length} frameTags for ${character.name}`);

      // Determine frame naming convention from first frame
      const frames = jsonData?.frames || [];
      if (frames.length === 0) {
        logger.game.warn(`[Preloader] No frames found for ${key}`);
        return;
      }

      // Extract prefix and suffix from first frame filename
      const firstFrameName = frames[0].filename;
      let prefix = "";
      let suffix = "";

      // Check for common suffixes (.aseprite, .ase, .png)
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

      console.log(`✅ [Preloader] Frame naming for ${key}: prefix="${prefix}", suffix="${suffix}"`);

      // Helper function to determine if animation should loop
      const shouldLoop = (animName: string) => ["idle", "win", "run"].includes(animName);

      // Helper function to create a single animation
      const createAnimation = (animName: string, frameTag: any, isFallback = false) => {
        const animKey = `${key}-${animName}`;

        console.log(
          `✅ [Preloader] Creating ${isFallback ? "fallback " : ""}animation: ${animKey}, frames ${frameTag.from}-${frameTag.to}`
        );

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

        console.log(`✅ [Preloader] Animation created: ${animKey}`);
        logger.game.debug(
          `[Preloader] Created ${isFallback ? "fallback " : ""}animation: ${animKey} (frames ${frameTag.from}-${frameTag.to})`
        );
      };

      // Store idle animation for fallback and create animations from frameTags
      let idleFrameTag: any = null;

      frameTags.forEach((tag: any) => {
        const animName = tag.name.toLowerCase();

        // Store idle for fallback
        if (animName === "idle") {
          idleFrameTag = tag;
        }

        createAnimation(animName, tag);
      });

      // Create fallback animations using idle if they don't exist
      const essentialAnims = ["idle", "walk", "run", "win", "falling", "landing", "poke", "poke1"];

      essentialAnims.forEach((animType) => {
        const animKey = `${key}-${animType}`;

        // Skip if animation already exists
        if (this.anims.exists(animKey)) {
          return;
        }

        // Use idle animation as fallback
        if (idleFrameTag) {
          createAnimation(animType, idleFrameTag, true);
        }
      });
    });

    // Create fullscreen explosion animation
    this.anims.create({
      key: "explosion-fullscreen",
      frames: this.anims.generateFrameNames("explosion-fullscreen", {
        prefix: "fight-effect ",
        suffix: ".ase",
        start: 0,
        end: 40,
      }),
      frameRate: 18,
      repeat: 0,
    });

    // Create blood animations
    const bloodAnimations = [
      { key: "blood-ground-middle", start: 0, end: 10, frameRate: 15 },
      { key: "blood-from-left", start: 12, end: 23, frameRate: 15 },
      { key: "blood-from-left2", start: 25, end: 32, frameRate: 15 },
      { key: "blood-from-left3", start: 34, end: 44, frameRate: 15 },
      { key: "blood-from-left4", start: 46, end: 54, frameRate: 15 },
      { key: "blood-from-left5", start: 56, end: 67, frameRate: 15 },
      { key: "blood-from-left6-big", start: 69, end: 82, frameRate: 18 },
      { key: "blood-ground-middle2", start: 84, end: 93, frameRate: 15 },
      { key: "blood-from-left7", start: 95, end: 106, frameRate: 15 },
    ];

    bloodAnimations.forEach((anim) => {
      this.anims.create({
        key: anim.key,
        frames: this.anims.generateFrameNames("blood", {
          prefix: "blood_spritesheet ",
          suffix: ".ase",
          start: anim.start,
          end: anim.end,
        }),
        frameRate: anim.frameRate,
        repeat: 0,
      });
    });

    // Create dust back animation (plays behind character)
    this.anims.create({
      key: "dust-back",
      frames: this.anims.generateFrameNames("dust", {
        prefix: "dust_char ",
        suffix: ".aseprite",
        start: 0,
        end: 20,
      }),
      frameRate: 24,
    });

    // Create dust front animation (plays in front of character)
    this.anims.create({
      key: "dust-front",
      frames: this.anims.generateFrameNames("dust", {
        prefix: "dust_char ",
        suffix: ".aseprite",
        start: 21,
        end: 40,
      }),
      frameRate: 24,
    });

    // ✅ Wait for blockchain data before deciding which scene to start
    this.waitForBlockchainThenStartScene();
  }

  /**
   * Wait for blockchain data (with timeout), then start appropriate scene
   *
   * Scene Decision Logic:
   * - No game data / CLOSED (2): MapCarousel (spinning background selection)
   * - WAITING (0): Game scene with "Insert Coin" mode (waiting for first bet)
   * - OPEN (1): Game scene with active betting and countdown
   */
  private waitForBlockchainThenStartScene() {
    const maxWaitTime = 2000; // Wait max 2 seconds for blockchain
    const checkInterval = 100; // Check every 100ms
    let elapsedTime = 0;

    const checkAndStart = () => {
      if (blockchainDataReady || elapsedTime >= maxWaitTime) {
        // Blockchain loaded or timeout reached, make decision
        // Handle status as BN or number (blockchain returns BN)
        const rawStatus = activeGameData?.status;
        const gameStatus =
          typeof rawStatus === "object" && rawStatus?.toNumber ? rawStatus.toNumber() : rawStatus;

        logger.game.debug("[Preloader] Starting scene decision:", {
          blockchainReady: blockchainDataReady,
          timedOut: elapsedTime >= maxWaitTime,
          rawStatus,
          gameStatus,
          activeGameData: activeGameData
            ? {
                status: gameStatus,
                gameRound: activeGameData.gameRound?.toString?.() || activeGameData.gameRound,
                betsCount: activeGameData.bets?.length,
              }
            : null,
          elapsedMs: elapsedTime,
        });

        // Stop any currently running scenes
        ["Demo", "Game", "MapCarousel"].forEach((sceneName) => {
          if (this.scene.isActive(sceneName)) {
            this.scene.stop(sceneName);
          }
        });

        // Decide which scene to start based on game status
        // gameStatus can be 0 (WAITING), 1 (OPEN), or 2 (CLOSED)
        if (activeGameData && (gameStatus === 0 || gameStatus === 1 || gameStatus === 2)) {
          if (gameStatus === GAME_STATUS.WAITING) {
            // Game created by backend, waiting for first bet
            // Show Game scene with "Insert Coin" mode
            logger.game.info("[Preloader] Starting Game scene (WAITING - Insert Coin mode)");
            this.scene.start("Game", { mode: "insert-coin" });
          } else if (gameStatus === GAME_STATUS.OPEN) {
            // Game has bets, countdown is running
            // Show Game scene with active betting
            logger.game.info("[Preloader] Starting Game scene (OPEN - Active betting)");
            this.scene.start("Game", { mode: "betting" });
          } else if (gameStatus === GAME_STATUS.CLOSED) {
            // Game ended, show MapCarousel for next game selection
            logger.game.info("[Preloader] Starting MapCarousel (CLOSED - Game ended)");
            this.scene.start("MapCarousel");
          } else {
            // Unknown status, default to MapCarousel
            logger.game.warn("[Preloader] Unknown game status:", gameStatus);
            this.scene.start("MapCarousel");
          }
        } else {
          // No active game data, show MapCarousel
          logger.game.info("[Preloader] Starting MapCarousel (No active game)");
          this.scene.start("MapCarousel");
        }

        EventBus.emit("preloader-complete");
      } else {
        // Still waiting for blockchain, check again
        elapsedTime += checkInterval;
        this.time.delayedCall(checkInterval, checkAndStart, [], this);
      }
    };

    // Start checking
    checkAndStart();
  }
}
