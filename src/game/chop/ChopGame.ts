import Phaser from "phaser";
import { getChopEventBus, getChopBranchPattern, CHOP_WIDTH, CHOP_HEIGHT } from "./index";

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
  private readonly PLAYER_WIDTH = Math.round(422 * this.SCALE); // ~127
  private readonly PLAYER_HEIGHT = Math.round(413 * this.SCALE); // ~124
  private readonly RIP_WIDTH = Math.round(90 * this.SCALE); // ~27
  private readonly RIP_HEIGHT = Math.round(100 * this.SCALE); // ~30

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
  private timeBarFill!: Phaser.GameObjects.Rectangle;
  private timeBarBg!: Phaser.GameObjects.Rectangle;
  private timeRemaining = 100;
  private readonly TIME_DECAY_RATE = 12;
  private readonly TIME_REFILL_AMOUNT = 10;

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private ripImage!: Phaser.GameObjects.Image;
  private stump!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;

  constructor() {
    super("ChopGame");
  }

  init() {
    this.eventBus = getChopEventBus();
    const globalPattern = getChopBranchPattern();

    this.gameState = "waiting";
    this.score = 0;
    this.playerSide = "l";
    this.isAlive = true;
    this.timeRemaining = 100;
    this.currentPatternIndex = 0;
    this.treeSegments = [];

    this.branchPattern = globalPattern || this.generateDefaultPattern();
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

    // Instructions
    this.instructionText = this.add.text(
      centerX,
      CHOP_HEIGHT / 2 + 50,
      "Tap LEFT or RIGHT\nto start!",
      {
        fontSize: "18px",
        fontFamily: "Arial",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
      }
    );
    this.instructionText.setOrigin(0.5);
    this.instructionText.setDepth(100);

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

    // Events
    this.eventBus.on("chop:start", this.startCountdown, this);
    this.eventBus.on("chop:restart", this.restartGame, this);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventBus.off("chop:start", this.startCountdown, this);
      this.eventBus.off("chop:restart", this.restartGame, this);
    });

    this.eventBus.emit("chop:ready");
  }

  private createTimeBar() {
    const barX = 22;
    const barY = 70;
    const barWidth = 16;
    const barHeight = this.GROUND_Y - barY - 30;

    this.timeBarBg = this.add.rectangle(barX, barY + barHeight / 2, barWidth, barHeight, 0x333333);
    this.timeBarBg.setStrokeStyle(2, 0x555555);
    this.timeBarBg.setDepth(90);

    this.timeBarFill = this.add.rectangle(
      barX,
      barY + barHeight,
      barWidth - 4,
      barHeight - 4,
      0x22c55e
    );
    this.timeBarFill.setOrigin(0.5, 1);
    this.timeBarFill.setDepth(91);
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
    if (this.gameState === "waiting") {
      this.startCountdown();
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

    this.player.setVisible(false);
    this.ripImage.setPosition(this.player.x, this.player.y - 40);
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
    if (this.gameState !== "waiting") return;

    this.gameState = "countdown";
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

  update(_time: number, delta: number) {
    if (this.gameState !== "playing" || !this.isAlive) {
      return;
    }

    this.timeRemaining -= (this.TIME_DECAY_RATE * delta) / 1000;

    const barY = 70;
    const maxHeight = this.GROUND_Y - barY - 34;
    const fillHeight = Math.max(0, (this.timeRemaining / 100) * maxHeight);
    this.timeBarFill.setSize(12, fillHeight);

    if (this.timeRemaining < 25) {
      this.timeBarFill.setFillStyle(0xef4444);
    } else if (this.timeRemaining < 50) {
      this.timeBarFill.setFillStyle(0xf59e0b);
    } else {
      this.timeBarFill.setFillStyle(0x22c55e);
    }

    if (this.timeRemaining <= 0) {
      this.handleDeath();
    }
  }
}
