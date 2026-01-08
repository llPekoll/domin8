import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  private eventsBus: Phaser.Events.EventEmitter;

  constructor(eventsBus: Phaser.Events.EventEmitter) {
    super("BootScene");
    this.eventsBus = eventsBus;
  }

  preload() {
    // Load background image
    this.load.image("flappy-bg", "/assets/maps/flappy/bg_flappy.png");
    // Load fire strip for bottom hazard
    this.load.image("flappy-fire", "/assets/maps/flappy/fp_fire.png");

    // Create procedural textures
    this.createTextures();
  }

  create() {
    this.eventsBus.emit("flappy:state", { state: "playing", score: 0 });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  private createTextures() {
    const graphics = this.add.graphics();

    // Bird texture - amber/orange theme (smaller for 360x540 resolution)
    graphics.clear();
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillRoundedRect(0, 0, 28, 20, 5);
    graphics.lineStyle(1, 0xfbbf24, 1);
    graphics.strokeRoundedRect(1, 1, 26, 18, 4);
    graphics.fillStyle(0x1c1917, 1);
    graphics.fillCircle(22, 7, 3);
    graphics.generateTexture("flappy-bird", 28, 20);

    // Pipe texture - dark with amber accent
    graphics.clear();
    graphics.fillStyle(0x292524, 1);
    graphics.fillRoundedRect(0, 0, 50, 300, 4);
    graphics.lineStyle(2, 0xf59e0b, 1);
    graphics.strokeRoundedRect(1, 1, 48, 298, 3);
    graphics.generateTexture("flappy-pipe", 50, 300);

    // Ground texture - not needed (invisible)
    graphics.clear();
    graphics.generateTexture("flappy-ground", 1, 1);

    graphics.destroy();
  }
}
