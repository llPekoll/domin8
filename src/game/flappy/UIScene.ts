import Phaser from "phaser";

type GameState = "playing" | "gameover";

export class UIScene extends Phaser.Scene {
  private eventsBus: Phaser.Events.EventEmitter;
  private unregister?: () => void;

  // UI Elements
  private scoreText!: Phaser.GameObjects.Text;
  private scoreLabelText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private gameOverContainer?: Phaser.GameObjects.Container;
  private lastRunText?: Phaser.GameObjects.Text;

  constructor(eventsBus: Phaser.Events.EventEmitter) {
    super("UIScene");
    this.eventsBus = eventsBus;
  }

  create() {
    this.createHUD();
    this.registerEvents();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unregister?.();
    });
  }

  private createHUD() {
    // Score panel background (top left) - amber theme
    const scoreBg = this.add.graphics();
    scoreBg.fillStyle(0x1c1917, 0.9);
    scoreBg.fillRoundedRect(8, 8, 70, 36, 4);
    scoreBg.lineStyle(1, 0xf59e0b, 0.5);
    scoreBg.strokeRoundedRect(8, 8, 70, 36, 4);

    // Score label
    this.scoreLabelText = this.add.text(16, 12, "SCORE", {
      fontSize: "8px",
      fontFamily: "monospace",
      color: "#a8a29e",
    });

    // Score value - amber
    this.scoreText = this.add.text(16, 24, "0", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#f59e0b",
      fontStyle: "bold",
    });

    // Instruction badge (top right) - amber theme
    const instrBg = this.add.graphics();
    instrBg.fillStyle(0xf59e0b, 0.15);
    instrBg.fillRoundedRect(this.scale.width - 105, 8, 97, 20, 4);

    this.instructionText = this.add.text(
      this.scale.width - 56,
      18,
      "SPACE / TAP",
      {
        fontSize: "8px",
        fontFamily: "monospace",
        color: "#fcd34d",
        fontStyle: "bold",
      }
    ).setOrigin(0.5);
  }

  private showGameOver(score: number, lastRun?: { score: number; durationMs: number }) {
    if (this.gameOverContainer) {
      this.gameOverContainer.destroy();
    }

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.gameOverContainer = this.add.container(centerX, centerY);

    // Background panel - dark with amber border
    const bg = this.add.graphics();
    bg.fillStyle(0x1c1917, 0.95);
    bg.fillRoundedRect(-75, -50, 150, 105, 6);
    bg.lineStyle(1, 0xf59e0b, 0.5);
    bg.strokeRoundedRect(-75, -50, 150, 105, 6);

    // Game Over title - amber
    const title = this.add.text(0, -38, "GAME OVER", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#fcd34d",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Score - white
    const scoreValue = this.add.text(0, -10, String(score), {
      fontSize: "28px",
      fontFamily: "monospace",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Last run stats
    let lastRunDisplay: Phaser.GameObjects.Text | undefined;
    if (lastRun) {
      lastRunDisplay = this.add.text(
        0,
        15,
        `${(lastRun.durationMs / 1000).toFixed(1)}s`,
        {
          fontSize: "10px",
          fontFamily: "monospace",
          color: "#a8a29e",
        }
      ).setOrigin(0.5);
    }

    // Restart button - solid amber like domin8
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0xf59e0b, 1);
    btnBg.fillRoundedRect(-40, 30, 80, 24, 4);

    const btnText = this.add.text(0, 42, "RESTART", {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Make button interactive
    const hitArea = this.add.rectangle(0, 42, 80, 24, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => {
      this.eventsBus.emit("flappy:restart");
    });
    hitArea.on("pointerover", () => {
      btnBg.clear();
      btnBg.fillStyle(0xfbbf24, 1);
      btnBg.fillRoundedRect(-40, 30, 80, 24, 4);
    });
    hitArea.on("pointerout", () => {
      btnBg.clear();
      btnBg.fillStyle(0xf59e0b, 1);
      btnBg.fillRoundedRect(-40, 30, 80, 24, 4);
    });

    // Add all to container
    const elements: Phaser.GameObjects.GameObject[] = [bg, title, scoreValue, btnBg, btnText, hitArea];
    if (lastRunDisplay) elements.push(lastRunDisplay);
    this.gameOverContainer.add(elements);
  }

  private hideGameOver() {
    if (this.gameOverContainer) {
      this.gameOverContainer.destroy();
      this.gameOverContainer = undefined;
    }
  }

  private registerEvents() {
    const handleScore = (value: number) => {
      this.scoreText.setText(String(value));
    };

    const handleState = (payload: { state: GameState; score: number }) => {
      if (payload.state === "playing") {
        this.hideGameOver();
        this.scoreText.setText(String(payload.score));
      }
    };

    const handleGameOver = (payload: { score: number }) => {
      // Get last run data if available
      this.showGameOver(payload.score);
    };

    const handleRunCompleted = (payload: { score: number; durationMs: number }) => {
      // Update game over screen with last run info
      if (this.gameOverContainer) {
        this.gameOverContainer.destroy();
      }
      this.showGameOver(payload.score, payload);
    };

    this.eventsBus.on("flappy:score", handleScore);
    this.eventsBus.on("flappy:state", handleState);
    this.eventsBus.on("flappy:gameover", handleGameOver);
    this.eventsBus.on("run:completed", handleRunCompleted);

    this.unregister = () => {
      this.eventsBus.off("flappy:score", handleScore);
      this.eventsBus.off("flappy:state", handleState);
      this.eventsBus.off("flappy:gameover", handleGameOver);
      this.eventsBus.off("run:completed", handleRunCompleted);
    };
  }
}
