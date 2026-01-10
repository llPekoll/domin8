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
    // Load pipe images
    this.load.image("flappy-pipe-bottom", "/assets/maps/flappy/fp_pipe.png");
    this.load.image("flappy-pipe-top", "/assets/maps/flappy/fp_pipe_up.png");

    // Create procedural textures (bird only now)
    this.createTextures();
  }

  create() {
    this.eventsBus.emit("flappy:state", { state: "playing", score: 0 });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  private createTextures() {
    const graphics = this.add.graphics();

    // Bird texture - amber/orange theme
    graphics.clear();
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillRoundedRect(0, 0, 28, 20, 5);
    graphics.lineStyle(1, 0xfbbf24, 1);
    graphics.strokeRoundedRect(1, 1, 26, 18, 4);
    graphics.fillStyle(0x1c1917, 1);
    graphics.fillCircle(22, 7, 3);
    graphics.generateTexture("flappy-bird", 28, 20);

    graphics.destroy();
  }
}
