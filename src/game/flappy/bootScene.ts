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
    // Load blood splatter spritesheet (using atlas loader for better compatibility)
    this.load.atlas("blood", "/assets/vfx/blood_spritesheet.png", "/assets/vfx/blood_spritesheet.json");
  }

  create() {
    // Set nearest-neighbor filtering for all textures (crisp pixel art)
    this.textures.get("flappy-bg").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-pipe-bottom").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-pipe-top").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("flappy-bird").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get("blood").setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Create blood splatter animations manually from frame tags
    // Frame tags from JSON: 1(0-10), 2(12-23), 3(25-32), 4(34-44), 5(46-54), 6(56-67), 7(69-82), 8(84-93), 9(95-106)
    const bloodAnims = [
      { name: "blood_1", start: 0, end: 10 },
      { name: "blood_2", start: 12, end: 23 },
      { name: "blood_3", start: 25, end: 32 },
      { name: "blood_4", start: 34, end: 44 },
      { name: "blood_5", start: 46, end: 54 },
      { name: "blood_6", start: 56, end: 67 },
      { name: "blood_7", start: 69, end: 82 },
      { name: "blood_8", start: 84, end: 93 },
      { name: "blood_9", start: 95, end: 106 },
    ];

    for (const anim of bloodAnims) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: "blood", frame: `blood_spritesheet ${i}.ase` });
      }
      this.anims.create({
        key: anim.name,
        frames,
        frameRate: 15,
        repeat: 0,
      });
    }

    this.eventsBus.emit("flappy:state", { state: "playing", score: 0 });
    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }
}
