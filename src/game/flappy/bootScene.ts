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
    // Load character
    this.load.image("flappy-bird", "/assets/characters/flappy/char.png");
  }

  create() {
    // Set nearest-neighbor filtering for all textures (crisp pixel art)
    this.textures.get("flappy-bg").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-pipe-bottom").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-pipe-top").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-bird").setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.eventsBus.emit("flappy:state", { state: "playing", score: 0 });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
