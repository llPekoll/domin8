import Phaser from "phaser";

type GameState = "playing" | "gameover";

type PipePair = {
  top: Phaser.Physics.Arcade.Image;
  bottom: Phaser.Physics.Arcade.Image;
  scored: boolean;
};

export class GameScene extends Phaser.Scene {
  private eventsBus: Phaser.Events.EventEmitter;
  private bird!: Phaser.Physics.Arcade.Sprite;
  private pipes: PipePair[] = [];
  private pipesGroup!: Phaser.Physics.Arcade.Group;
  private pipeTimer?: Phaser.Time.TimerEvent;
  private isGameOver = false;
  private score = 0;
  private readonly pipeSpeed = -200;
  private readonly groundHeight = 80;
  private restartKey?: Phaser.Input.Keyboard.Key;
  private parallaxLayers: Phaser.GameObjects.TileSprite[] = [];
  private parallaxSpeeds: number[] = [];
  private runStartTime = 0;

  constructor(eventsBus: Phaser.Events.EventEmitter) {
    super("GameScene");
    this.eventsBus = eventsBus;
  }

  create() {
    this.isGameOver = false;
    this.score = 0;
    this.pipes = [];
    this.runStartTime = this.time.now;

    this.cameras.main.setBackgroundColor("#060b1a");
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);

    this.createParallax();
    this.createBird();
    this.pipesGroup = this.physics.add.group();
    this.createGround();
    this.setupInput();

    this.pipeTimer = this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: this.spawnPipePair,
      callbackScope: this,
    });

    this.eventsBus.emit("flappy:score", this.score);
    this.eventsBus.emit("flappy:state", { state: "playing" satisfies GameState, score: this.score });
    this.eventsBus.on("flappy:restart", this.handleRestart, this);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventsBus.off("flappy:restart", this.handleRestart, this);
      if (this.pipeTimer) {
        this.pipeTimer.remove(false);
      }
      this.input.keyboard?.off("keydown-SPACE", this.handleFlap, this);
      this.input.keyboard?.off("keydown-UP", this.handleFlap, this);
      this.input.keyboard?.off("keydown-W", this.handleFlap, this);
      this.input.off("pointerdown", this.handleFlap, this);
      this.restartKey = undefined;

      this.pipes.forEach((pair) => {
        pair.top.destroy();
        pair.bottom.destroy();
      });
      this.pipes = [];
      this.parallaxLayers.forEach((layer) => layer.destroy());
      this.parallaxLayers = [];
    });
  }

  update() {
    if (!this.bird.body) return;

    if (this.isGameOver) {
      const fallRotation = Phaser.Math.Clamp(this.bird.body.velocity.y / 500, -0.4, 0.8);
      this.bird.setRotation(fallRotation);
      return;
    }

    if (this.bird.y <= 0 || this.bird.y >= this.scale.height - this.groundHeight) {
      this.handleGameOver();
    }

    this.pipes = this.pipes.filter((pair) => {
      const offScreen = pair.top.x + pair.top.displayWidth / 2 < -20;
      if (offScreen) {
        pair.top.destroy();
        pair.bottom.destroy();
        return false;
      }

      if (!pair.scored && pair.top.x + pair.top.displayWidth / 2 < this.bird.x) {
        pair.scored = true;
        this.incrementScore();
      }
      return true;
    });

    this.parallaxLayers.forEach((layer, index) => {
      const speed = this.parallaxSpeeds[index] ?? 0.5;
      layer.tilePositionX += speed;
    });

    const tilt = Phaser.Math.Clamp(this.bird.body.velocity.y / 400, -0.45, 0.6);
    this.bird.setRotation(tilt);

    if (this.restartKey?.isDown && this.isGameOver) {
      this.handleRestart();
    }
  }

  private createGround() {
    const groundGroup = this.physics.add.staticGroup();
    const ground = groundGroup.create(
      this.scale.width / 2,
      this.scale.height - this.groundHeight / 2,
      "flappy-ground"
    ) as Phaser.Physics.Arcade.Sprite;

    ground.setDisplaySize(this.scale.width, this.groundHeight);
    ground.setOrigin(0.5, 0.5);
    ground.refreshBody();

    this.physics.add.collider(this.bird, ground, this.handleGameOver, undefined, this);
  }

  private createBird() {
    this.bird = this.physics.add.sprite(this.scale.width * 0.25, this.scale.height / 2, "flappy-bird");
    this.bird.setCollideWorldBounds(true);
    this.bird.setDepth(2);
    this.bird.setMaxVelocity(400, 700);
    this.bird.body.setCircle(14, 8, 2);
  }

  private setupInput() {
    this.input.keyboard?.on("keydown-SPACE", this.handleFlap, this);
    this.input.keyboard?.on("keydown-UP", this.handleFlap, this);
    this.input.keyboard?.on("keydown-W", this.handleFlap, this);
    this.input.on("pointerdown", this.handleFlap, this);
    this.restartKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.physics.add.overlap(this.bird, this.pipesGroup, this.handleGameOver, undefined, this);
  }

  private createParallax() {
    const depthStart = -5;
    const bands = [
      { alpha: 0.5, speed: 0.4, tint: 0x0ea5e9 },
      { alpha: 0.35, speed: 0.65, tint: 0x7c3aed },
      { alpha: 0.25, speed: 0.9, tint: 0x22d3ee },
    ];

    this.parallaxLayers = bands.map((band, idx) => {
      const tile = this.add.tileSprite(
        this.scale.width / 2,
        (this.scale.height - this.groundHeight) / 2,
        this.scale.width,
        this.scale.height,
        "flappy-band"
      );
      tile.setTint(band.tint);
      tile.setAlpha(band.alpha);
      tile.setDepth(depthStart + idx);
      return tile;
    });

    this.parallaxSpeeds = bands.map((band) => band.speed);
  }

  private spawnPipePair() {
    if (this.isGameOver) return;

    const gapSize = Phaser.Math.Between(150, 190);
    const playableHeight = this.scale.height - this.groundHeight;
    const gapCenter = Phaser.Math.Between(200, playableHeight - 200);

    const topHeight = gapCenter - gapSize / 2;
    const bottomHeight = playableHeight - (gapCenter + gapSize / 2);
    const pipeX = this.scale.width + 60;

    const topPipe = this.pipesGroup.create(pipeX, gapCenter - gapSize / 2, "flappy-pipe") as Phaser.Physics.Arcade.Image;
    topPipe.setOrigin(0.5, 1);
    topPipe.setDisplaySize(80, topHeight);
    topPipe.setVelocityX(this.pipeSpeed);
    topPipe.setImmovable(true);
    topPipe.body.setAllowGravity(false);

    const bottomPipe = this.pipesGroup.create(pipeX, gapCenter + gapSize / 2, "flappy-pipe") as Phaser.Physics.Arcade.Image;
    bottomPipe.setOrigin(0.5, 0);
    bottomPipe.setDisplaySize(80, bottomHeight);
    bottomPipe.setVelocityX(this.pipeSpeed);
    bottomPipe.setImmovable(true);
    bottomPipe.body.setAllowGravity(false);

    this.pipes.push({ top: topPipe, bottom: bottomPipe, scored: false });
  }

  private handleFlap() {
    if (this.isGameOver) return;
    this.bird.setVelocityY(-330);
  }

  private incrementScore() {
    this.score += 1;
    this.eventsBus.emit("flappy:score", this.score);
  }

  private handleGameOver = () => {
    if (this.isGameOver) return;

    this.isGameOver = true;
    this.pipeTimer?.remove(false);
    this.pipesGroup.setVelocityX(0);
    this.physics.pause();
    this.bird.setTint(0xff7b7b);
    this.cameras.main.flash(200, 244, 114, 182);
    this.cameras.main.shake(250, 0.006);
    this.eventsBus.emit("flappy:gameover", { score: this.score });
    const durationMs = Math.max(0, this.time.now - this.runStartTime);
    this.eventsBus.emit("run:completed", { score: this.score, durationMs });
    this.eventsBus.emit("flappy:state", { state: "gameover" satisfies GameState, score: this.score });
  };

  private handleRestart = () => {
    if (!this.isGameOver) return;
    this.eventsBus.emit("flappy:state", { state: "playing" satisfies GameState, score: 0 });
    this.scene.restart();
  };
}
