import Phaser from "phaser";
import {
  getChopEventBus,
  getChopBranchPattern,
  getChopHighScore,
  CHOP_WIDTH,
  CHOP_HEIGHT,
} from "./index";

type GameState = "waiting" | "countdown" | "playing" | "gameover";

interface TreeSegment {
  trunk: Phaser.GameObjects.Image;
  branch: Phaser.GameObjects.Image | null;
  branchSide: "l" | "r" | "";
}

export class ChopGame extends Phaser.Scene {
  private eventBus!: Phaser.Events.EventEmitter;

  // Game state
  private gameState: GameState = "waiting";
  private inputEnabled = false; // Must be enabled by chop:start event
  private score = 0;
  public playerSide: "l" | "r" = "l";
  private isAlive = true;
  private gameStartTime = 0;

  // Tree segments
  private treeSegments: TreeSegment[] = [];

  // Layout for 324x534 (scaled from original 1080x1775)
  // Scale factor: 0.30 applied uniformly to all images
  // Images are used at full size (with transparent areas) and scaled together
  // - trunk1/trunk2: 1004x243 - trunk centered with transparent sides
  // - branch1: 1004x243 - branch LEFT + trunk center (use for left branches)
  // - branch2: 1004x243 - trunk center + branch RIGHT (use for right branches)
  private readonly SCALE = 0.3;

  // Full image dimensions scaled
  private readonly IMG_WIDTH = Math.round(1004 * this.SCALE); // ~301
  private readonly IMG_HEIGHT = Math.round(243 * this.SCALE); // ~73
  private readonly STUMP_WIDTH = Math.round(385 * this.SCALE); // ~116
  private readonly STUMP_HEIGHT = Math.round(81 * this.SCALE); // ~24
  private readonly RIP_WIDTH = Math.round(90 * this.SCALE * 3); // ~49
  private readonly RIP_HEIGHT = Math.round(100 * this.SCALE * 3); // ~54

  // Visible trunk width (center third of 1004px image contains the trunk)
  private readonly TRUNK_WIDTH = Math.round(335 * this.SCALE); // ~100

  private readonly VISIBLE_SEGMENTS = 7;
  private readonly GROUND_Y = Math.round(1394 * this.SCALE); // ~418
  private readonly TRUNK_X = CHOP_WIDTH / 2;

  // Branch pattern
  private branchPattern: string[] = [];
  private currentPatternIndex = 0;

  // Player (sprite for animation)
  private player!: Phaser.GameObjects.Sprite;
  private playerLeftX = 0;
  private playerRightX = 0;

  // Time bar
  private timeBarBg!: Phaser.GameObjects.Image;
  private timeBarFill!: Phaser.GameObjects.Image;
  private timeBarContainer!: Phaser.GameObjects.Image;
  private timeRemaining = 100;
  private readonly TIME_REFILL_AMOUNT = 8;

  // Brutal difficulty curve - quick deaths, 1000 is legendary
  // Target: casual dies ~40-60, good players ~150-200, 1000 is inhuman
  private readonly DIFFICULTY_TIERS = [
    { maxScore: 29, decay: 12 }, // Warm-up
    { maxScore: 59, decay: 18 }, // Getting tough
    { maxScore: 99, decay: 25 }, // Serious
    { maxScore: 149, decay: 35 }, // Hard
    { maxScore: 249, decay: 50 }, // Very hard
    { maxScore: 499, decay: 70 }, // Expert only
    { maxScore: 749, decay: 100 }, // Near impossible
    { maxScore: 999, decay: 150 }, // Inhuman
    { maxScore: Infinity, decay: 250 }, // Unplayable (1000+)
  ];

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private ripImage!: Phaser.GameObjects.Image;
  private stump!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;

  // High score tracking
  private highScore = 0;
  private hasBeatHighScore = false;

  // Confetti particles
  private confettiEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  // Sounds
  private chopSound!: Phaser.Sound.BaseSound;
  private deathSound!: Phaser.Sound.BaseSound;

  constructor() {
    super("ChopGame");
  }

  init() {
    this.eventBus = getChopEventBus();
    const globalPattern = getChopBranchPattern();

    this.gameState = "waiting";
    this.inputEnabled = false; // Disabled until chop:start event
    this.score = 0;
    this.playerSide = "l";
    this.isAlive = true;
    this.timeRemaining = 100;
    this.currentPatternIndex = 0;
    this.treeSegments = [];

    this.branchPattern = globalPattern || this.generateDefaultPattern();

    // Get high score from global state
    this.highScore = getChopHighScore();
    this.hasBeatHighScore = false;
  }

  private generateDefaultPattern(): string[] {
    const pattern: string[] = [];
    let lastBranch = "";

    // First 2 segments safe
    pattern.push("");
    pattern.push("");

    for (let i = 2; i < 200; i++) {
      if (Math.random() < 0.6) {
        if (lastBranch === "l") {
          pattern.push(Math.random() < 0.7 ? "r" : "l");
        } else if (lastBranch === "r") {
          pattern.push(Math.random() < 0.7 ? "l" : "r");
        } else {
          pattern.push(Math.random() < 0.5 ? "l" : "r");
        }
        lastBranch = pattern[pattern.length - 1];
      } else {
        pattern.push("");
        lastBranch = "";
      }
    }

    return pattern;
  }

  create() {
    const centerX = this.TRUNK_X;

    // Background
    const bg = this.add.image(CHOP_WIDTH / 2, CHOP_HEIGHT / 2, "chop-background");
    bg.setDisplaySize(CHOP_WIDTH, CHOP_HEIGHT);

    // Stump (offset 1px right to align with trunk)
    this.stump = this.add.image(centerX + 2, this.GROUND_Y, "chop-stump");
    this.stump.setDisplaySize(this.STUMP_WIDTH, this.STUMP_HEIGHT);
    this.stump.setOrigin(0.5, 0);

    // Player positions - beside the trunk
    this.playerLeftX = centerX - this.TRUNK_WIDTH / 2 - 20;
    this.playerRightX = centerX + this.TRUNK_WIDTH / 2 + 20;

    // Player Y position (lower than ground for feet placement)
    const playerY = this.GROUND_Y + 15;

    // Create animations manually from Aseprite atlas frames
    // chop: frames 0-1, idle: frames 2-3 (looped)
    if (!this.anims.exists("man-idle")) {
      this.anims.create({
        key: "man-idle",
        frames: [
          { key: "chop-man", frame: "man 2.aseprite" },
          { key: "chop-man", frame: "man 3.aseprite" },
        ],
        frameRate: 4,
        repeat: -1,
      });
    }
    if (!this.anims.exists("man-chop")) {
      this.anims.create({
        key: "man-chop",
        frames: [
          { key: "chop-man", frame: "man 0.aseprite" },
          { key: "chop-man", frame: "man 1.aseprite" },
        ],
        frameRate: 15,
        repeat: 0,
      });
    }

    // Player sprite
    this.player = this.add.sprite(this.playerLeftX, playerY, "chop-man", "man 2.aseprite");
    this.player.setScale(1.2);
    this.player.setOrigin(0.5, 1);
    this.player.setDepth(50);
    this.player.play("man-idle");

    // Tree (visible from start)
    this.createInitialTree();

    // Time bar
    this.createTimeBar();

    // Score
    this.scoreText = this.add.text(centerX, 35, "0", {
      fontSize: "42px",
      fontFamily: "Arial Black",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.scoreText.setOrigin(0.5);
    this.scoreText.setDepth(100);

    // High score target (shown on right side)
    const highScoreLabel = this.highScore > 0 ? `#1: ${this.highScore}` : "";
    this.highScoreText = this.add.text(CHOP_WIDTH - 10, 25, highScoreLabel, {
      fontSize: "14px",
      fontFamily: "Arial",
      color: "#fbbf24",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.highScoreText.setOrigin(1, 0);
    this.highScoreText.setDepth(100);
    this.highScoreText.setAlpha(0.8);

    // Instructions (hidden by default, shown during gameplay)
    this.instructionText = this.add.text(centerX, CHOP_HEIGHT / 2 + 50, "", {
      fontSize: "18px",
      fontFamily: "Arial",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
      align: "center",
    });
    this.instructionText.setOrigin(0.5);
    this.instructionText.setDepth(100);
    this.instructionText.setVisible(false);

    // Countdown
    this.countdownText = this.add.text(centerX, CHOP_HEIGHT / 2, "3", {
      fontSize: "80px",
      fontFamily: "Arial Black",
      color: "#f59e0b",
      stroke: "#000000",
      strokeThickness: 6,
    });
    this.countdownText.setOrigin(0.5);
    this.countdownText.setVisible(false);
    this.countdownText.setDepth(100);

    // Game over
    this.gameOverText = this.add.text(centerX, CHOP_HEIGHT / 2 - 60, "GAME OVER", {
      fontSize: "36px",
      fontFamily: "Arial Black",
      color: "#ef4444",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setVisible(false);
    this.gameOverText.setDepth(100);

    this.ripImage = this.add.image(centerX, CHOP_HEIGHT / 2 + 20, "chop-rip");
    this.ripImage.setDisplaySize(this.RIP_WIDTH, this.RIP_HEIGHT);
    this.ripImage.setVisible(false);
    this.ripImage.setDepth(100);

    // Input
    this.setupInput();

    // Create confetti particle system (hidden initially)
    this.createConfettiEmitter();

    // Events
    this.eventBus.on("chop:start", this.startCountdown, this);
    this.eventBus.on("chop:restart", this.restartGame, this);
    this.eventBus.on("chop:continue", this.continueGame, this);
    this.eventBus.on("chop:highscore", this.updateHighScore, this);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventBus.off("chop:start", this.startCountdown, this);
      this.eventBus.off("chop:restart", this.restartGame, this);
      this.eventBus.off("chop:continue", this.continueGame, this);
      this.eventBus.off("chop:highscore", this.updateHighScore, this);
    });

    // Initialize sounds
    this.chopSound = this.sound.add("chop-sound", { volume: 0.5 });
    this.deathSound = this.sound.add("chop-death", { volume: 0.7 });

    this.eventBus.emit("chop:ready");
  }

  private createTimeBar() {
    const barY = 18;
    const centerX = this.cameras.main.width / 2;

    // Layer 1 (bottom): Dark background - centered
    this.timeBarBg = this.add.image(centerX, barY, "chop-bar-black");
    this.timeBarBg.setDepth(90);

    // Layer 2 (middle): Fill bar - tinted green to red
    // Align with the black background (add padding for frame)
    this.timeBarFill = this.add.image(centerX, barY, "chop-bar");
    this.timeBarFill.setOrigin(0, 0.5); // Origin at left so it shrinks from right
    this.timeBarFill.setX(centerX - this.timeBarBg.width / 2 - 4); // Align left edge
    this.timeBarFill.setDepth(91);
    this.timeBarFill.setTint(0x22c55e); // Start green

    // Layer 3 (top): Yellow frame/container - centered
    this.timeBarContainer = this.add.image(centerX, barY, "chop-bar-container");
    this.timeBarContainer.setDepth(92);
  }

  private createInitialTree() {
    const centerX = this.TRUNK_X;
    this.treeSegments = [];

    for (let i = 0; i < this.VISIBLE_SEGMENTS; i++) {
      this.addTreeSegment(centerX, i);
    }
  }

  private addTreeSegment(centerX: number, index: number) {
    // y = top of trunk segment
    const y = this.GROUND_Y - (index + 1) * this.IMG_HEIGHT;

    const patternIdx = (this.currentPatternIndex + index) % this.branchPattern.length;
    const branchSide = this.branchPattern[patternIdx] as "l" | "r" | "";

    // Choose image based on branch side:
    // - No branch: use trunk1 or trunk2
    // - Left branch: use branch1 (has branch on left + trunk)
    // - Right branch: use branch2 (has trunk + branch on right)
    let imageKey: string;
    if (branchSide === "l") {
      imageKey = "chop-branch1";
    } else if (branchSide === "r") {
      imageKey = "chop-branch2";
    } else {
      imageKey = index % 2 === 0 ? "chop-trunk1" : "chop-trunk2";
    }

    const trunk = this.add.image(centerX, y, imageKey);
    trunk.setDisplaySize(this.IMG_WIDTH, this.IMG_HEIGHT);
    trunk.setOrigin(0.5, 0);
    trunk.setDepth(10 + index);

    // No separate branch object needed - it's part of the image
    this.treeSegments.push({ trunk, branch: null, branchSide });
  }

  private setupInput() {
    this.input.keyboard?.on("keydown-LEFT", () => this.handleChop("l"));
    this.input.keyboard?.on("keydown-A", () => this.handleChop("l"));
    this.input.keyboard?.on("keydown-RIGHT", () => this.handleChop("r"));
    this.input.keyboard?.on("keydown-D", () => this.handleChop("r"));

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const side = pointer.x < CHOP_WIDTH / 2 ? "l" : "r";
      this.handleChop(side);
    });
  }

  private handleChop(side: "l" | "r") {
    // Input must be enabled by chop:start event from React UI
    if (!this.inputEnabled) {
      return;
    }

    if (this.gameState !== "playing" || !this.isAlive) {
      return;
    }

    // Move player
    this.playerSide = side;
    this.player.x = side === "l" ? this.playerLeftX : this.playerRightX;
    this.player.setFlipX(side === "r");

    // Play chop animation, then return to idle
    this.player.play("man-chop");
    this.player.once("animationcomplete", () => {
      if (this.isAlive) {
        this.player.play("man-idle");
      }
    });

    // Check collision - player is at segment[1] level (one above the stump)
    const playerSegment = this.treeSegments[1];
    if (playerSegment && playerSegment.branchSide === side) {
      this.handleDeath();
      return;
    }

    // Success
    this.score++;
    this.scoreText.setText(this.score.toString());
    this.timeRemaining = Math.min(100, this.timeRemaining + this.TIME_REFILL_AMOUNT);

    // Check if beat high score
    if (this.highScore > 0 && this.score > this.highScore && !this.hasBeatHighScore) {
      this.triggerNewHighScoreCelebration();
    }

    // Play chop sound
    this.chopSound.play();

    this.shiftTree(side);

    this.eventBus.emit("chop:input", {
      timestamp: Date.now() - this.gameStartTime,
      side,
      score: this.score,
    });
  }

  private shiftTree(chopSide: "l" | "r") {
    const centerX = this.TRUNK_X;

    // Remove bottom segment and animate it flying off (includes branch if any)
    const removed = this.treeSegments.shift();
    if (removed) {
      const trunk = removed.trunk;

      // Kick direction is opposite to chop side
      const kickDirection = chopSide === "l" ? 1 : -1;
      const targetX = trunk.x + kickDirection * 300;
      const targetAngle = kickDirection * 90;

      // Animate the chopped segment flying off with parabola motion
      const startY = trunk.y;

      // Horizontal + rotation
      this.tweens.add({
        targets: trunk,
        x: targetX,
        angle: targetAngle,
        duration: 600,
        ease: "Power1",
      });

      // Vertical parabola: up then down
      this.tweens.add({
        targets: trunk,
        y: startY - 80,
        duration: 200,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: trunk,
            y: startY + 300,
            duration: 400,
            ease: "Sine.easeIn",
            onComplete: () => {
              trunk.destroy();
            },
          });
        },
      });
    }

    // Shift remaining segments down with a slight delay
    this.time.delayedCall(120, () => {
      this.treeSegments.forEach((segment, i) => {
        const y = this.GROUND_Y - (i + 1) * this.IMG_HEIGHT;
        segment.trunk.y = y;
        segment.trunk.setDepth(10 + i);
      });
    });

    // Add new segment at top
    this.currentPatternIndex++;
    this.addTreeSegment(centerX, this.treeSegments.length);
  }

  private handleDeath() {
    this.isAlive = false;
    this.gameState = "gameover";

    // Play death sound
    this.deathSound.play();

    this.player.setVisible(false);
    const ripOffsetX = this.playerSide === "l" ? -15 : 15;
    this.ripImage.setPosition(this.player.x + ripOffsetX, this.player.y - 10);
    this.ripImage.setVisible(true);
    this.gameOverText.setVisible(true);

    this.cameras.main.shake(200, 0.015);
    this.cameras.main.flash(200, 255, 0, 0, true);

    this.eventBus.emit("chop:death", {
      score: this.score,
      timestamp: Date.now() - this.gameStartTime,
    });

    this.time.delayedCall(1500, () => {
      this.eventBus.emit("chop:gameover", { score: this.score });
    });
  }

  private startCountdown() {
    console.log("startCountdown called - gameState:", this.gameState);
    if (this.gameState !== "waiting") return;

    this.gameState = "countdown";
    this.inputEnabled = true; // Enable input when countdown starts
    this.instructionText.setVisible(false);
    this.countdownText.setVisible(true);

    let count = 3;
    this.countdownText.setText(count.toString());

    const countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          this.countdownText.setText(count.toString());
        } else {
          this.countdownText.setText("CHOP!");
          this.time.delayedCall(400, () => {
            this.countdownText.setVisible(false);
            this.startPlaying();
          });
          countdownTimer.remove();
        }
      },
      repeat: 2,
    });
  }

  private startPlaying() {
    this.gameState = "playing";
    this.gameStartTime = Date.now();
    this.eventBus.emit("chop:playing");
  }

  private restartGame() {
    this.scene.restart();
  }

  private continueGame(data: { score: number }) {
    // Resume from current score without resetting
    this.isAlive = true;
    this.gameState = "playing";
    this.inputEnabled = true;
    this.timeRemaining = 100;
    this.gameStartTime = Date.now();

    // Reset time bar visual
    this.timeBarFill.setScale(1, 1);
    this.timeBarFill.setTint(0x22c55e);

    // Keep the score from data (in case it differs)
    if (data?.score !== undefined) {
      this.score = data.score;
      this.scoreText.setText(this.score.toString());
    }

    // Hide game over UI
    this.gameOverText.setVisible(false);
    this.ripImage.setVisible(false);

    // Restore player
    this.player.setVisible(true);
    this.player.play("man-idle");

    // Regenerate tree with safe starting segments
    this.rebuildTreeForContinue();

    this.eventBus.emit("chop:playing");
  }

  private rebuildTreeForContinue() {
    // Clear existing tree segments
    this.treeSegments.forEach((segment) => {
      segment.trunk.destroy();
    });
    this.treeSegments = [];

    // Regenerate pattern from current index with safe start
    // Ensure first 2 segments have no branches for safety
    const patternLength = this.branchPattern.length;
    this.branchPattern[this.currentPatternIndex % patternLength] = "";
    this.branchPattern[(this.currentPatternIndex + 1) % patternLength] = "";

    // Rebuild visible tree
    const centerX = this.TRUNK_X;
    for (let i = 0; i < this.VISIBLE_SEGMENTS; i++) {
      this.addTreeSegment(centerX, i);
    }
  }

  private createConfettiEmitter() {
    // Create a simple colored rectangle texture for confetti
    const graphics = this.make.graphics({ x: 0, y: 0 });

    // Create multiple colored confetti textures
    const colors = [0xfbbf24, 0xef4444, 0x22c55e, 0x3b82f6, 0xa855f7, 0xf97316];
    colors.forEach((color, i) => {
      graphics.fillStyle(color);
      graphics.fillRect(i * 8, 0, 6, 8);
    });
    graphics.generateTexture("confetti", 48, 8);
    graphics.destroy();

    // Create particle emitter
    this.confettiEmitter = this.add.particles(0, 0, "confetti", {
      frame: { frames: [0, 1, 2, 3, 4, 5], cycle: true },
      x: { min: 0, max: CHOP_WIDTH },
      y: -20,
      lifespan: 3000,
      speedY: { min: 100, max: 200 },
      speedX: { min: -50, max: 50 },
      scale: { start: 1, end: 0.5 },
      rotate: { min: 0, max: 360 },
      gravityY: 100,
      quantity: 3,
      frequency: 50,
      emitting: false,
    });
    this.confettiEmitter.setDepth(150);
  }

  private triggerNewHighScoreCelebration() {
    if (this.hasBeatHighScore) return;
    this.hasBeatHighScore = true;

    // Update high score display
    this.highScoreText.setText("NEW #1!");
    this.highScoreText.setColor("#22c55e");
    this.highScoreText.setFontSize(16);

    // Scale bump on score text
    this.tweens.add({
      targets: this.scoreText,
      scale: 1.5,
      duration: 150,
      yoyo: true,
      ease: "Back.easeOut",
      onComplete: () => {
        // Flash the score gold
        this.scoreText.setColor("#fbbf24");
        this.time.delayedCall(300, () => {
          if (this.isAlive) {
            this.scoreText.setColor("#ffffff");
          }
        });
      },
    });

    // Start confetti
    if (this.confettiEmitter) {
      this.confettiEmitter.start();
      // Stop after 2 seconds
      this.time.delayedCall(2000, () => {
        this.confettiEmitter?.stop();
      });
    }

    // Camera flash (gold)
    this.cameras.main.flash(
      300,
      251,
      191,
      36,
      true,
      (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
        if (progress === 1) {
          // Flash complete
        }
      }
    );

    // Emit event for React UI
    this.eventBus.emit("chop:newhighscore", { score: this.score });
  }

  private updateHighScore(score: number) {
    this.highScore = score;
    if (score > 0 && !this.hasBeatHighScore) {
      this.highScoreText.setText(`#1: ${score}`);
    }
  }

  update(_time: number, delta: number) {
    if (this.gameState !== "playing" || !this.isAlive) {
      return;
    }

    // Brutal difficulty curve - find current tier based on score
    const tier = this.DIFFICULTY_TIERS.find((t) => this.score <= t.maxScore)!;
    const currentDecayRate = tier.decay;

    this.timeRemaining -= (currentDecayRate * delta) / 1000;

    // Scale the bar width based on time remaining
    const fillPercent = Math.max(0, this.timeRemaining / 100);
    this.timeBarFill.setScale(fillPercent, 1);

    // Gradual color transition: green (100%) -> yellow (50%) -> red (0%)
    const tintColor = this.getGradientColor(fillPercent);
    this.timeBarFill.setTint(tintColor);

    if (this.timeRemaining <= 0) {
      this.handleDeath();
    }
  }

  /**
   * Get gradient color from green (1.0) -> yellow (0.7) -> red (0.3)
   * Turns red faster for more urgency
   */
  private getGradientColor(percent: number): number {
    let r: number, g: number, b: number;

    if (percent > 0.7) {
      // Green to Yellow (100% -> 70%)
      const t = (percent - 0.7) / 0.3; // 1.0 at 100%, 0.0 at 70%
      r = Math.round(255 * (1 - t) + 34 * t); // 255 -> 34 (0x22)
      g = Math.round(245 * (1 - t) + 197 * t); // 245 -> 197 (0xc5)
      b = Math.round(0 * (1 - t) + 94 * t); // 0 -> 94 (0x5e)
    } else if (percent > 0.3) {
      // Yellow to Orange (70% -> 30%)
      const t = (percent - 0.3) / 0.4; // 1.0 at 70%, 0.0 at 30%
      r = Math.round(239 * (1 - t) + 255 * t); // Keep red high
      g = Math.round(120 * (1 - t) + 245 * t); // 245 -> 120
      b = Math.round(50 * (1 - t) + 0 * t); // Stay low
    } else {
      // Orange to Red (30% -> 0%)
      const t = percent / 0.3; // 1.0 at 30%, 0.0 at 0%
      r = 239; // Stay red
      g = Math.round(68 * (1 - t) + 120 * t); // 120 -> 68
      b = Math.round(68 * (1 - t) + 50 * t); // 50 -> 68
    }

    return (r << 16) | (g << 8) | b;
  }
}
