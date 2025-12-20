import { Scene } from "phaser";
import { charactersData, allMapsData, STAGE_WIDTH, STAGE_HEIGHT } from "../main";
import { logger } from "../../lib/logger";
import { loadBackgroundConfig } from "../config/backgrounds";
import { EventBus } from "../EventBus";

/**
 * OneVOnePreloader - Lightweight preloader for 1v1 modal
 * 
 * This preloader loads only the assets needed for 1v1 fights
 * and directly starts the OneVOne scene (doesn't try to start Demo/Game)
 */
export class OneVOnePreloader extends Scene {
  constructor() {
    super("OneVOnePreloader");
  }

  init() {
    // Use camera center for positioning (STAGE_WIDTH=1188, STAGE_HEIGHT=540)
    const centerX = STAGE_WIDTH / 2;
    const centerY = STAGE_HEIGHT / 2;
    
    // Simple progress bar
    this.add.rectangle(centerX, centerY, 468, 32).setStrokeStyle(1, 0xffffff);
    const bar = this.add.rectangle(centerX - 230, centerY, 4, 28, 0xffffff);

    this.load.on("progress", (progress: number) => {
      bar.width = 4 + 460 * progress;
    });
  }

  preload() {
        this.load.setPath("assets");

    // Load fonts
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

    // Check data availability
    if (!charactersData || charactersData.length === 0) {
      console.error("[OneVOnePreloader] No characters data available!");
      logger.game.error("[OneVOnePreloader] No characters data available!");
      return;
    }
    if (!allMapsData || allMapsData.length === 0) {
      logger.game.error("[OneVOnePreloader] No maps data available!");
      return;
    }

        logger.game.debug("[OneVOnePreloader] Loading assets for 1v1 modal");

    // Load all character sprites
    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");
      const jsonPath = character.assetPath.replace(".png", ".json");
      this.load.atlas(key, character.assetPath, jsonPath);
      this.load.json(`${key}-json`, jsonPath);
    });

    // Load backgrounds
    const backgroundIds = allMapsData.map((map) => map.id);
    backgroundIds.forEach((id) => {
      const bgConfig = loadBackgroundConfig(id);
      if (!bgConfig) return;

      if (bgConfig.type === "animated") {
        const jsonPath = bgConfig.assetPath.replace(".png", ".json");
        this.load.atlas(bgConfig.textureKey, bgConfig.assetPath, jsonPath);
      } else {
        this.load.image(bgConfig.textureKey, bgConfig.assetPath);
      }

      if (bgConfig.overlays) {
        bgConfig.overlays.forEach((overlay) => {
          const overlayJsonPath = overlay.assetPath.replace(".png", ".json");
          this.load.atlas(overlay.textureKey, overlay.assetPath, overlayJsonPath);
        });
      }
    });

    // Load VFX
    this.load.atlas("explosion-fullscreen", "vfx/fight-effect.png", "vfx/fight-effect.json");
    this.load.atlas("blood", "vfx/blood_spritesheet.png", "vfx/blood_spritesheet.json");
    this.load.atlas("dust", "dust_char.png", "dust_char.json");
    this.load.image("logo", "logo.webp");
    this.load.image("throne", "misc/throne.png");

    // Load sounds
    this.load.audio("battle-theme", "sounds/battleThemeA.mp3");
    this.load.audio("domin8-intro", "sounds/domin8-intro.mp3");
    this.load.audio("explosion-dust", "sounds/explosion-dust.wav");
    this.load.audio("victory", "sounds/victory2.mp3");
    this.load.audio("insert-coin", "sounds/insert-coin.mp3");
    this.load.audio("challenger", "sounds/challenger.mp3");

    // Load impacts
    for (let i = 1; i <= 8; i++) {
      if (i !== 2) this.load.audio(`impact-${i}`, `sounds/impacts/sfx_sounds_impact${i}.wav`);
    }

    // Load death screams
    for (let i = 1; i <= 14; i++) {
      this.load.audio(`death-scream-${i}`, `sounds/death-screams/human/sfx_deathscream_human${i}.wav`);
    }

    this.load.on("loaderror", (file: any) => {
      logger.game.error("[OneVOnePreloader] Failed to load:", file.key, file.src);
    });
  }

  create() {
    if (!charactersData || charactersData.length === 0) {
      logger.game.error("[OneVOnePreloader] No characters data for animations");
      return;
    }

    // Create animations (same logic as main Preloader)
    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");
      const jsonData = this.cache.json.get(`${key}-json`);
      if (!jsonData) return;

      const frameTags = jsonData?.meta?.frameTags || [];
      if (frameTags.length === 0) return;

      const frames = jsonData?.frames || [];
      if (frames.length === 0) return;

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

      const shouldLoop = (animName: string) => ["idle", "win", "run"].includes(animName);

      let idleFrameTag: any = null;
      frameTags.forEach((tag: any) => {
        const animName = tag.name.toLowerCase();
        const animKey = `${key}-${animName}`;

        if (animName === "idle") idleFrameTag = tag;

        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNames(key, {
            prefix: prefix,
            suffix: suffix,
            start: tag.from,
            end: tag.to,
          }),
          frameRate: 10,
          repeat: shouldLoop(animName) ? -1 : 0,
        });
      });

      // Create fallback animations
      const essentialAnims = ["idle", "walk", "run", "win", "falling", "landing", "poke", "poke1"];
      essentialAnims.forEach((animType) => {
        const animKey = `${key}-${animType}`;
        if (this.anims.exists(animKey)) return;
        if (idleFrameTag) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNames(key, {
              prefix: prefix,
              suffix: suffix,
              start: idleFrameTag.from,
              end: idleFrameTag.to,
            }),
            frameRate: 10,
            repeat: shouldLoop(animType) ? -1 : 0,
          });
        }
      });
    });

    // Create VFX animations
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

    // Directly start OneVOne scene (the key difference from main Preloader)
        logger.game.info("[OneVOnePreloader] Assets loaded, starting OneVOne scene");
    this.scene.start("OneVOne");
    EventBus.emit("preloader-complete");
  }
}
