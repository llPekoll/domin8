import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  private eventsBus: Phaser.Events.EventEmitter;

  constructor(eventsBus: Phaser.Events.EventEmitter) {
    super("BootScene");
    this.eventsBus = eventsBus;
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.eventsBus.emit("flappy:state", { state: "playing", score: 0 });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  private createTextures() {
    const graphics = this.add.graphics();

    // Bird texture
    graphics.clear();
    graphics.fillStyle(0x7c3aed, 1);
    graphics.fillRoundedRect(0, 0, 44, 32, 8);
    graphics.lineStyle(2, 0x22d3ee, 1);
    graphics.strokeRoundedRect(2, 2, 40, 28, 6);
    graphics.fillStyle(0xfbbf24, 1);
    graphics.fillCircle(34, 10, 4);
    graphics.generateTexture("flappy-bird", 44, 32);

    // Pipe texture
    graphics.clear();
    graphics.fillStyle(0x14f195, 1);
    graphics.fillRoundedRect(0, 0, 80, 500, 6);
    graphics.lineStyle(4, 0x0ea5e9, 1);
    graphics.strokeRoundedRect(2, 2, 76, 496, 4);
    graphics.generateTexture("flappy-pipe", 80, 500);

    // Ground texture
    graphics.clear();
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillRect(0, 0, 480, 80);
    graphics.lineStyle(3, 0x22d3ee, 1);
    graphics.strokeRect(0, 0, 480, 80);
    graphics.generateTexture("flappy-ground", 480, 80);

    // Parallax band texture (soft gradient bars)
    graphics.clear();
    graphics.fillStyle(0x0b1224, 0.9);
    graphics.fillRect(0, 0, 200, 200);
    graphics.fillStyle(0x0ea5e9, 0.12);
    graphics.fillRect(0, 30, 200, 24);
    graphics.fillRect(0, 120, 200, 18);
    graphics.fillStyle(0x7c3aed, 0.12);
    graphics.fillRect(0, 70, 200, 22);
    graphics.fillRect(0, 160, 200, 20);
    graphics.generateTexture("flappy-band", 200, 200);
  }
}
