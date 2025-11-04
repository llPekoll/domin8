import { Scene } from "phaser";
import { currentMapData, charactersData, allMapsData, demoMapData } from "../main";
import { logger } from "../../lib/logger";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    //  A simple progress bar. This is the outline of the bar.
    this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

    //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
    const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0xffffff);

    //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
    this.load.on("progress", (progress: number) => {
      //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
      bar.width = 4 + 460 * progress;
    });
  }

  preload() {
    this.load.setPath("assets");

    // Load custom fonts
    this.load.addFile(
      new Phaser.Loader.FileTypes.FontFile(this.load, {
        type: "font",
        key: "metal-slug",
        url: "fonts/metal-slug-colour.colr.ttf",
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
    });

    // Load ALL active maps (so any map can be used for real games)
    logger.game.debug("[Preloader] Loading all maps:", allMapsData.length);
    allMapsData.forEach((map) => {
      logger.game.debug("[Preloader] Loading map:", map.background, map.assetPath);
      this.load.image(map.background, map.assetPath);
    });

    // Load VFX assets
    this.load.atlas("explosion", "vfx/Explosion.png", "vfx/Explosion.json");
    this.load.atlas("blood", "vfx/blood_spritesheet.png", "vfx/blood_spritesheet.json");
    this.load.atlas("dust", "dust_char.png", "dust_char.json");
    this.load.image("logo", "logo.webp");

    // Load winner throne
    this.load.image("throne", "misc/throne.png");

    // Load sound effects
    this.load.audio("battle-theme", "sounds/battleThemeA.mp3");
    this.load.audio("domin8-intro", "sounds/domin8-intro.mp3");
    this.load.audio("explosion-dust", "sounds/explosion-dust.wav");
    this.load.audio("victory", "sounds/victory2.mp3");
    this.load.audio("insert-coin", "sounds/insert-coin.mp3");

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

    // Create animations for all characters dynamically from database
    logger.game.debug("[Preloader] Creating animations for", charactersData.length, "characters");
    charactersData.forEach((character) => {
      const key = character.name.toLowerCase().replace(/\s+/g, "-");

      // Determine prefix and suffix from the character name
      const prefix = character.name + " ";
      const suffix = ".aseprite";

      // Create idle animation
      if (character.animations.idle) {
        this.anims.create({
          key: `${key}-idle`,
          frames: this.anims.generateFrameNames(key, {
            prefix: prefix,
            suffix: suffix,
            start: character.animations.idle.start,
            end: character.animations.idle.end,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }

      // Create walk animation
      if (character.animations.walk) {
        this.anims.create({
          key: `${key}-walk`,
          frames: this.anims.generateFrameNames(key, {
            prefix: prefix,
            suffix: suffix,
            start: character.animations.walk.start,
            end: character.animations.walk.end,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }

      // Create attack animation if it exists
      if (character.animations.attack) {
        this.anims.create({
          key: `${key}-attack`,
          frames: this.anims.generateFrameNames(key, {
            prefix: prefix,
            suffix: suffix,
            start: character.animations.attack.start,
            end: character.animations.attack.end,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    });

    // Create explosion animation
    this.anims.create({
      key: "explosion",
      frames: this.anims.generateFrameNames("explosion", {
        prefix: "Explosion 2 SpriteSheet ",
        suffix: ".png",
        start: 0,
        end: 17,
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

    // Start with DemoScene by default
    this.scene.start("Demo");
  }
}
