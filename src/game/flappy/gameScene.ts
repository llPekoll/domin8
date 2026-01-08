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
  private readonly pipeSpeed = -120;
  private readonly groundHeight = 20;
  private restartKey?: Phaser.Input.Keyboard.Key;
  private background!: Phaser.GameObjects.TileSprite;
  private fire!: Phaser.GameObjects.TileSprite;
  private bgScrollSpeed = 0.8; // Background scroll speed
  private bgTileScale = 2; // Calculated in createBackground
  private fireTileScale = 2; // Calculated in createFire
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

    this.cameras.main.setBackgroundColor("#050816");
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);

    this.createBackground();
    this.createFire();
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
    this.eventsBus.emit("flappy:state", {
      state: "playing" satisfies GameState,
      score: this.score,
    });
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
    });
  }

  update() {
    if (!this.bird.body) return;

    if (this.isGameOver) {
      const fallRotation = Phaser.Math.Clamp(this.bird.body.velocity.y / 500, -0.4, 0.8);
      this.bird.setRotation(fallRotation);
      // Fire still scrolls during game over for effect (optional: remove this line to stop)
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

    // Scroll background horizontally (sliding effect)
    // Divide by tileScale since tilePositionX works in texture space
    this.background.tilePositionX += this.bgScrollSpeed / this.bgTileScale;

    // Scroll fire at same speed as pipes (pipeSpeed is negative, so negate it)
    // Convert pipe speed (pixels/sec at 60fps) to tilePosition units
    const fireScrollSpeed = -this.pipeSpeed / 60 / this.fireTileScale;
    this.fire.tilePositionX += fireScrollSpeed;

    const tilt = Phaser.Math.Clamp(this.bird.body.velocity.y / 400, -0.45, 0.6);
    this.bird.setRotation(tilt);

    if (this.restartKey?.isDown && this.isGameOver) {
      this.handleRestart();
    }
  }

  private createGround() {
    const groundGroup = this.physics.add.staticGroup();

    // Invisible ground hitbox at the bottom
    const ground = groundGroup.create(
      this.scale.width / 2,
      this.scale.height - this.groundHeight / 2,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;

    ground.setDisplaySize(this.scale.width, this.groundHeight);
    ground.setOrigin(0.5, 0.5);
    ground.setVisible(false);
    ground.refreshBody();

    this.physics.add.collider(this.bird, ground, this.handleGameOver, undefined, this);
  }

  private createBird() {
    this.bird = this.physics.add.sprite(
      this.scale.width * 0.25,
      this.scale.height / 2,
      "flappy-bird"
    );
    this.bird.setCollideWorldBounds(true);
    this.bird.setDepth(2);
    this.bird.setMaxVelocity(300, 500);
    this.bird.body.setCircle(10, 6, 2);
  }

  private setupInput() {
    this.input.keyboard?.on("keydown-SPACE", this.handleFlap, this);
    this.input.keyboard?.on("keydown-UP", this.handleFlap, this);
    this.input.keyboard?.on("keydown-W", this.handleFlap, this);
    this.input.on("pointerdown", this.handleFlap, this);
    this.restartKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.physics.add.overlap(this.bird, this.pipesGroup, this.handleGameOver, undefined, this);
  }

  private createBackground() {
    // Background image is 246x180
    // Game is 240x360 (120x180 * 2)
    //
    // Like BackgroundManager.scaleToFit(), we scale to COVER the camera:
    // - scaleY = gameHeight / textureHeight = 360 / 180 = 2
    // - scaleX = gameWidth / textureWidth = 240 / 246 = 0.976
    // - scale = Math.max(scaleX, scaleY) = 2
    //
    // TileSprite fills game area, tileScale controls texture rendering size
    const texture = this.textures.get("flappy-bg");
    const frame = texture.get();

    // Calculate scale to cover (like BackgroundManager)
    const scaleX = this.scale.width / frame.width;
    const scaleY = this.scale.height / frame.height;
    const coverScale = Math.max(scaleX, scaleY);

    // Create TileSprite centered (like main game backgrounds)
    this.background = this.add.tileSprite(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      "flappy-bg"
    );
    this.background.setOrigin(0.5, 0.5);
    this.background.setTileScale(coverScale);
    this.background.setDepth(-10);

    // Store scale for scroll speed calculation
    this.bgTileScale = coverScale;

    console.log("[Flappy Debug]", {
      scene: { width: this.scale.width, height: this.scale.height },
      texture: { width: frame.width, height: frame.height },
      coverScale,
      background: {
        displayWidth: this.background.displayWidth,
        displayHeight: this.background.displayHeight,
      },
    });
  }

  private createFire() {
    // Fire strip at the bottom of the screen
    // Scrolls at same speed as pipes
    const texture = this.textures.get("flappy-fire");
    const frame = texture.get();

    // Scale fire to match the game's pixel scale
    // Fire should tile horizontally, scale vertically to fit
    const scaleY = this.scale.height / 180; // Match background scale (180 is bg height)
    this.fireTileScale = scaleY;

    const fireHeight = frame.height * this.fireTileScale;

    // Create TileSprite at bottom of screen
    this.fire = this.add.tileSprite(
      this.scale.width / 2,
      this.scale.height - fireHeight / 2,
      this.scale.width,
      fireHeight,
      "flappy-fire"
    );
    this.fire.setOrigin(0.5, 0.5);
    this.fire.setTileScale(this.fireTileScale);
    this.fire.setDepth(1); // Above background, below bird
  }

  private spawnPipePair() {
    if (this.isGameOver) return;

    const gapSize = Phaser.Math.Between(100, 130);
    const playableHeight = this.scale.height - this.groundHeight;
    const gapCenter = Phaser.Math.Between(120, playableHeight - 120);

    const topHeight = gapCenter - gapSize / 2;
    const bottomHeight = playableHeight - (gapCenter + gapSize / 2);
    const pipeX = this.scale.width + 40;
    const pipeWidth = 50;

    const topPipe = this.pipesGroup.create(
      pipeX,
      gapCenter - gapSize / 2,
      "flappy-pipe"
    ) as Phaser.Physics.Arcade.Image;
    topPipe.setOrigin(0.5, 1);
    topPipe.setDisplaySize(pipeWidth, topHeight);
    topPipe.setVelocityX(this.pipeSpeed);
    topPipe.setImmovable(true);
    topPipe.body.setAllowGravity(false);

    const bottomPipe = this.pipesGroup.create(
      pipeX,
      gapCenter + gapSize / 2,
      "flappy-pipe"
    ) as Phaser.Physics.Arcade.Image;
    bottomPipe.setOrigin(0.5, 0);
    bottomPipe.setDisplaySize(pipeWidth, bottomHeight);
    bottomPipe.setVelocityX(this.pipeSpeed);
    bottomPipe.setImmovable(true);
    bottomPipe.body.setAllowGravity(false);

    this.pipes.push({ top: topPipe, bottom: bottomPipe, scored: false });
  }

  private handleFlap() {
    if (this.isGameOver) return;
    this.bird.setVelocityY(-220);
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
    this.eventsBus.emit("flappy:state", {
      state: "gameover" satisfies GameState,
      score: this.score,
    });
  };

  private handleRestart = () => {
    if (!this.isGameOver) return;
    this.eventsBus.emit("flappy:state", { state: "playing" satisfies GameState, score: 0 });
    this.scene.restart();
  };
}
