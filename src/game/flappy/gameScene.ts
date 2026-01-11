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
  private backgrounds: Phaser.GameObjects.Image[] = [];
  private bgScrollSpeed = 0.8; // Background scroll speed (pixels per frame)
  private bgScale = 2; // Calculated in createBackground
  private runStartTime = 0;

  // Animated lava
  private lavaBackGraphics!: Phaser.GameObjects.Graphics; // Back layer (behind pipes)
  private lavaFrontGraphics!: Phaser.GameObjects.Graphics; // Front layer (in front of pipes)
  private lavaOutlineGraphics!: Phaser.GameObjects.Graphics;
  private bubbleGraphics!: Phaser.GameObjects.Graphics;
  private lavaTime = 0;
  private lavaScrollOffset = 0; // Scroll offset for lava (same speed as pipes)
  private readonly lavaDepth = 30; // Depth of lava
  private bubbles: { x: number; y: number; size: number; speed: number; wobble: number }[] = [];
  private splashes: { x: number; amplitude: number; age: number }[] = [];

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
    this.createLava();
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
      this.input.keyboard?.off("keydown-SPACE", void this.handleFlap, this);
      this.input.keyboard?.off("keydown-UP", void this.handleFlap, this);
      this.input.keyboard?.off("keydown-W", void this.handleFlap, this);
      this.input.off("pointerdown", void this.handleFlap, this);
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

    // Scroll background sprites horizontally
    const texture = this.textures.get("flappy-bg");
    const frame = texture.get();
    const scaledWidth = frame.width * this.bgScale;

    for (const bg of this.backgrounds) {
      bg.x -= this.bgScrollSpeed;
      // Wrap around when off screen
      if (bg.x + scaledWidth <= 0) {
        bg.x += scaledWidth * 2;
      }
    }

    // Update animated lava, bubbles, and splashes
    this.lavaTime += 0.016;
    // Scroll lava at same speed as pipes (pipeSpeed is negative, so we add positive value)
    this.lavaScrollOffset += Math.abs(this.pipeSpeed) * 0.016;
    this.updateSplashes();
    this.updateBubbles();
    this.drawLava();

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
    // Scale down the character to fit the game
    this.bird.setScale(0.4);
    this.bird.setCollideWorldBounds(true);
    this.bird.setDepth(2);
    this.bird.setMaxVelocity(300, 500);
    // Adjust hitbox for scaled sprite (centered circle)
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setCircle(20, 30, 20); // radius, offsetX, offsetY for centered hitbox
  }

  private setupInput() {
    this.input.keyboard?.on("keydown-SPACE", this.handleFlap, this);
    this.input.keyboard?.on("keydown-UP", this.handleFlap, this);
    this.input.keyboard?.on("keydown-W", this.handleFlap, this);
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.restartKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Use pixel-perfect collision check
    this.physics.add.overlap(
      this.bird,
      this.pipesGroup,
      this.handlePipeCollision,
      this.checkPixelCollision as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      this
    );
  }

  private checkPixelCollision(
    bird: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    pipe: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): boolean {
    const birdSprite = bird as Phaser.Physics.Arcade.Sprite;
    const pipeImage = pipe as Phaser.Physics.Arcade.Image;

    // Get bounds for both sprites
    const birdBounds = birdSprite.getBounds();
    const pipeBounds = pipeImage.getBounds();

    // Check if bounding boxes overlap first (early exit)
    if (
      birdBounds.x > pipeBounds.x + pipeBounds.width ||
      birdBounds.x + birdBounds.width < pipeBounds.x ||
      birdBounds.y > pipeBounds.y + pipeBounds.height ||
      birdBounds.y + birdBounds.height < pipeBounds.y
    ) {
      return false;
    }

    // Calculate overlap region in world coordinates
    const overlapX = Math.max(birdBounds.x, pipeBounds.x);
    const overlapY = Math.max(birdBounds.y, pipeBounds.y);
    const overlapRight = Math.min(birdBounds.x + birdBounds.width, pipeBounds.x + pipeBounds.width);
    const overlapBottom = Math.min(birdBounds.y + birdBounds.height, pipeBounds.y + pipeBounds.height);

    // Sample pixels in the overlap region (step by 3 pixels for performance)
    const step = 3;
    for (let worldX = overlapX; worldX < overlapRight; worldX += step) {
      for (let worldY = overlapY; worldY < overlapBottom; worldY += step) {
        // Convert world position to bird texture position
        const birdTexX = Math.floor((worldX - birdBounds.x) / birdSprite.scaleX);
        const birdTexY = Math.floor((worldY - birdBounds.y) / birdSprite.scaleY);

        // Convert world position to pipe texture position
        const pipeTexX = Math.floor((worldX - pipeBounds.x) / pipeImage.scaleX);
        const pipeTexY = Math.floor((worldY - pipeBounds.y) / pipeImage.scaleY);

        // Get pixel alpha for both sprites
        const birdAlpha = this.textures.getPixelAlpha(birdTexX, birdTexY, "flappy-bird");
        const pipeAlpha = this.textures.getPixelAlpha(pipeTexX, pipeTexY, pipeImage.texture.key);

        // Collision only if both pixels are opaque
        if (birdAlpha > 50 && pipeAlpha > 50) {
          return true;
        }
      }
    }

    return false;
  }

  private handlePipeCollision() {
    this.handleGameOver();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    // Always flap on tap/click
    this.handleFlap();

    // Also create splash ripple on lava surface
    const lavaBaseY = this.scale.height - this.lavaDepth - this.groundHeight;
    // Stronger splash if clicking near lava surface
    const intensity = pointer.y > lavaBaseY - 40 ? 1.5 : 0.8;
    this.addSplash(pointer.x, intensity);
  }

  private addSplash(x: number, intensity: number) {
    this.splashes.push({
      x,
      amplitude: 8 * intensity,
      age: 0,
    });
  }

  private updateSplashes() {
    // Decay splashes over time
    this.splashes = this.splashes.filter((splash) => {
      splash.amplitude *= 0.95;
      splash.age += 0.016;
      return splash.amplitude > 0.5;
    });
  }

  private createBackground() {
    // Background image is 246x180
    // Use regular sprites instead of TileSprite for proper pixel art filtering
    const texture = this.textures.get("flappy-bg");
    const frame = texture.get();

    // Calculate scale to cover screen height
    const scaleX = this.scale.width / frame.width;
    const scaleY = this.scale.height / frame.height;
    const coverScale = Math.max(scaleX, scaleY);
    this.bgScale = coverScale;

    // Create two background sprites for seamless scrolling
    const scaledWidth = frame.width * coverScale;
    const bgOffsetY = -20; // Move background down to show the scare at top

    for (let i = 0; i < 2; i++) {
      const bg = this.add.image(i * scaledWidth, this.scale.height / 2 + bgOffsetY, "flappy-bg");
      bg.setOrigin(0, 0.5);
      bg.setScale(coverScale);
      bg.setDepth(-10);
      this.backgrounds.push(bg);
    }

    console.log("[Flappy Debug]", {
      scene: { width: this.scale.width, height: this.scale.height },
      texture: { width: frame.width, height: frame.height },
      coverScale,
      scaledWidth,
    });
  }

  private createLava() {
    // Create graphics objects for animated lava
    // Back layer goes behind pipes (depth 0.5)
    this.lavaBackGraphics = this.add.graphics();
    this.lavaBackGraphics.setDepth(0.5); // Behind pipes (pipes are depth 1)

    // Front layer goes in front of pipes (depth 5)
    this.lavaFrontGraphics = this.add.graphics();
    this.lavaFrontGraphics.setDepth(5); // In front of pipes

    this.lavaOutlineGraphics = this.add.graphics();
    this.lavaOutlineGraphics.setDepth(6); // Above front lava

    this.bubbleGraphics = this.add.graphics();
    this.bubbleGraphics.setDepth(5.5); // Between front lava and outline

    // Create initial bubbles
    for (let i = 0; i < 5; i++) {
      this.createBubble();
    }

    // Initial draw
    this.drawLava();
  }

  private createBubble() {
    const height = this.scale.height;
    this.bubbles.push({
      x: Math.random() * this.scale.width,
      y: height,
      size: 1 + Math.random() * 2,
      speed: 15 + Math.random() * 25,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  private updateBubbles() {
    const height = this.scale.height;
    const baseY = height - this.lavaDepth - this.groundHeight;
    const time = this.lavaTime;
    const scrollSpeed = Math.abs(this.pipeSpeed) * 0.016; // Same speed as pipes

    // Update existing bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      bubble.y -= bubble.speed * 0.016;
      bubble.wobble += 0.1;
      bubble.x += Math.sin(bubble.wobble) * 0.3;
      // Move bubble left with the lava (same speed as pipes)
      bubble.x -= scrollSpeed;

      // Remove if off screen (left side)
      if (bubble.x < -10) {
        this.bubbles.splice(i, 1);
        continue;
      }

      // Calculate surface Y at bubble's X position (using scrolled wave)
      const wx = bubble.x + this.lavaScrollOffset;
      let surfaceY = baseY;
      surfaceY += Math.sin(wx * 0.04 + time * 1.5) * 2.5;
      surfaceY += Math.sin(wx * 0.08 + time * 2.2) * 1.2;

      // Remove if above lava surface (bubble pops)
      if (bubble.y < surfaceY) {
        // Pop! Add a tiny splash
        this.addSplash(bubble.x, 0.3);
        this.bubbles.splice(i, 1);
      }
    }

    // Spawn new bubbles occasionally (from right side to scroll in)
    if (Math.random() < 0.03 && this.bubbles.length < 8) {
      this.createBubble();
    }

    // Draw bubbles
    this.bubbleGraphics.clear();
    for (const bubble of this.bubbles) {
      // Bright yellow core
      this.bubbleGraphics.fillStyle(0xffdd44, 0.9);
      this.bubbleGraphics.fillCircle(bubble.x, bubble.y, bubble.size);
    }
  }

  private drawLava() {
    const width = this.scale.width;
    const height = this.scale.height;
    const baseY = height - this.lavaDepth - this.groundHeight;
    const time = this.lavaTime;

    this.lavaBackGraphics.clear();
    this.lavaFrontGraphics.clear();
    this.lavaOutlineGraphics.clear();

    // === BACK LAYER (darker, slightly higher) - BEHIND PIPES ===
    const scrollX = this.lavaScrollOffset; // Scroll offset synced with pipes
    const backPoints: { x: number; y: number }[] = [];
    for (let x = 0; x <= width; x += 1) {
      let y = baseY - 8;
      // Calmer waves for back layer (offset by scroll to move with pipes)
      const wx = x + scrollX;
      y += Math.sin(wx * 0.03 + time * 1.2) * 3;
      y += Math.sin(wx * 0.07 + time * 1.8) * 1.5;
      y += Math.sin(wx * 0.12 + time * 2.5) * 0.8;
      backPoints.push({ x, y });
    }

    // Draw back lava layer (dark) - on back graphics (behind pipes)
    this.lavaBackGraphics.fillStyle(0x330800);
    this.lavaBackGraphics.beginPath();
    this.lavaBackGraphics.moveTo(0, height);
    for (const point of backPoints) {
      this.lavaBackGraphics.lineTo(point.x, point.y);
    }
    this.lavaBackGraphics.lineTo(width, height);
    this.lavaBackGraphics.closePath();
    this.lavaBackGraphics.fillPath();

    // === FRONT LAYER (main lava with gradient effect) - IN FRONT OF PIPES ===
    const frontPoints: { x: number; y: number }[] = [];
    for (let x = 0; x <= width; x += 1) {
      let y = baseY;
      // Animated waves (offset by scroll to move with pipes)
      const wx = x + scrollX;
      y += Math.sin(wx * 0.04 + time * 1.5) * 2.5;
      y += Math.sin(wx * 0.08 + time * 2.2) * 1.2;
      y += Math.sin(wx * 0.15 + time * 3.0) * 0.6;

      // Add splash ripples
      for (const splash of this.splashes) {
        const dist = Math.abs(x - splash.x);
        if (dist < 80) {
          const ripple = Math.sin(dist * 0.1 - splash.age * 10) * splash.amplitude;
          const falloff = 1 - dist / 80;
          y += ripple * falloff * falloff;
        }
      }

      frontPoints.push({ x, y });
    }

    // Draw front lava - gradient from dark orange (top) to bright yellow (bottom)
    // Draw multiple horizontal strips to create gradient effect
    const gradientSteps = 8;
    const lavaBottom = height;

    for (let i = 0; i < gradientSteps; i++) {
      const t = i / gradientSteps;
      // Interpolate colors: dark orange -> bright orange -> yellow
      let r, g, b;
      if (t < 0.5) {
        // Dark orange to bright orange
        const lt = t * 2;
        r = Math.floor(0x99 + (0xff - 0x99) * lt);
        g = Math.floor(0x33 + (0x66 - 0x33) * lt);
        b = Math.floor(0x00 + (0x00 - 0x00) * lt);
      } else {
        // Bright orange to yellow
        const lt = (t - 0.5) * 2;
        r = 0xff;
        g = Math.floor(0x66 + (0xaa - 0x66) * lt);
        b = Math.floor(0x00 + (0x33 - 0x00) * lt);
      }
      const color = (r << 16) | (g << 8) | b;

      this.lavaFrontGraphics.fillStyle(color);
      this.lavaFrontGraphics.beginPath();

      // Top edge of this strip
      const stripTopRatio = i / gradientSteps;
      const stripBottomRatio = (i + 1) / gradientSteps;

      this.lavaFrontGraphics.moveTo(0, lavaBottom);

      // Bottom edge first (going right)
      for (let j = 0; j <= width; j += 2) {
        const point = frontPoints[j] || frontPoints[frontPoints.length - 1];
        const stripY = point.y + (lavaBottom - point.y) * stripBottomRatio;
        this.lavaFrontGraphics.lineTo(j, stripY);
      }

      // Top edge (going left)
      for (let j = width; j >= 0; j -= 2) {
        const point = frontPoints[j] || frontPoints[0];
        const stripY = point.y + (lavaBottom - point.y) * stripTopRatio;
        this.lavaFrontGraphics.lineTo(j, stripY);
      }

      this.lavaFrontGraphics.closePath();
      this.lavaFrontGraphics.fillPath();
    }

    // === BRIGHT OUTLINE (hot surface edge) ===
    this.lavaOutlineGraphics.lineStyle(1, 0xffdd44, 1.0);
    this.lavaOutlineGraphics.beginPath();
    this.lavaOutlineGraphics.moveTo(frontPoints[0].x, frontPoints[0].y);
    for (let i = 1; i < frontPoints.length; i++) {
      this.lavaOutlineGraphics.lineTo(frontPoints[i].x, frontPoints[i].y);
    }
    this.lavaOutlineGraphics.strokePath();
  }

  private spawnPipePair() {
    if (this.isGameOver) return;

    const gapSize = Phaser.Math.Between(100, 130);
    const playableHeight = this.scale.height - this.groundHeight;
    const gapCenter = Phaser.Math.Between(120, playableHeight - 120);

    const pipeX = this.scale.width + 40;

    // Scale pipes slightly smaller than background for better gameplay feel
    const pipeScale = (this.scale.height / 180) * 0.7; // 70% of background scale

    // Get pipe texture dimensions
    const topTexture = this.textures.get("flappy-pipe-top");
    const topFrame = topTexture.get();
    const bottomTexture = this.textures.get("flappy-pipe-bottom");
    const bottomFrame = bottomTexture.get();

    // Use full sprite bounds for initial overlap detection
    // Pixel-perfect collision check happens in checkPixelCollision callback

    // Top pipe (hanging from ceiling) - flames point DOWN
    const topPipe = this.pipesGroup.create(
      pipeX,
      0,
      "flappy-pipe-top"
    ) as Phaser.Physics.Arcade.Image;
    topPipe.setOrigin(0.5, 0);
    topPipe.setScale(pipeScale);
    topPipe.setDepth(1); // Between back lava (0.5) and front lava (5)
    topPipe.setVelocityX(this.pipeSpeed);
    topPipe.setImmovable(true);
    const topBody = topPipe.body as Phaser.Physics.Arcade.Body;
    topBody.allowGravity = false;
    // Full sprite bounds - pixel check handles actual collision
    topBody.setSize(topFrame.width, topFrame.height);
    topBody.setOffset(0, 0);
    // Position so visual bottom aligns with gap top
    topPipe.y = gapCenter - gapSize / 2 - topPipe.displayHeight;

    // Bottom pipe (rising from ground) - flames point UP
    const bottomPipe = this.pipesGroup.create(
      pipeX,
      gapCenter + gapSize / 2,
      "flappy-pipe-bottom"
    ) as Phaser.Physics.Arcade.Image;
    bottomPipe.setOrigin(0.5, 0);
    bottomPipe.setScale(pipeScale);
    bottomPipe.setDepth(1); // Between back lava (0.5) and front lava (5)
    bottomPipe.setVelocityX(this.pipeSpeed);
    bottomPipe.setImmovable(true);
    const bottomBody = bottomPipe.body as Phaser.Physics.Arcade.Body;
    bottomBody.allowGravity = false;
    // Full sprite bounds - pixel check handles actual collision
    bottomBody.setSize(bottomFrame.width, bottomFrame.height);
    bottomBody.setOffset(0, 0);

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
