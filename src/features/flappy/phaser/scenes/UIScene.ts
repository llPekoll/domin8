import Phaser from "phaser";

type GameState = "playing" | "gameover";

export class UIScene extends Phaser.Scene {
  private eventsBus: Phaser.Events.EventEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private unregister?: () => void;

  constructor(eventsBus: Phaser.Events.EventEmitter) {
    super("UIScene");
    this.eventsBus = eventsBus;
  }

  create() {
    this.createText();
    this.registerEvents();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unregister?.();
    });
  }

  private createText() {
    this.scoreText = this.add
      .text(this.scale.width / 2, 26, "0", {
        fontSize: "32px",
        fontFamily: "monospace",
        color: "#22d3ee",
        stroke: "#0ea5e9",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(this.scale.width / 2, 64, "Click or Space to flap", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#a5b4fc",
      })
      .setOrigin(0.5, 0);
  }

  private registerEvents() {
    const handleScore = (value: number) => {
      this.scoreText.setText(String(value));
    };

    const handleState = (payload: { state: GameState; score: number }) => {
      if (payload.state === "playing") {
        this.statusText?.destroy();
        this.statusText = undefined;
        this.scoreText.setText(String(payload.score));
      }
    };

    const handleGameOver = (payload: { score: number }) => {
      this.statusText?.destroy();
      this.statusText = this.add
        .text(this.scale.width / 2, this.scale.height / 2, `Game Over\nScore: ${payload.score}\nTap or R to restart`, {
          fontSize: "18px",
          fontFamily: "monospace",
          color: "#f472b6",
          align: "center",
          stroke: "#22d3ee",
          strokeThickness: 2,
          backgroundColor: "rgba(8, 7, 20, 0.7)",
          padding: { left: 12, right: 12, top: 10, bottom: 10 },
        })
        .setOrigin(0.5);
    };

    this.eventsBus.on("flappy:score", handleScore);
    this.eventsBus.on("flappy:state", handleState);
    this.eventsBus.on("flappy:gameover", handleGameOver);

    this.unregister = () => {
      this.eventsBus.off("flappy:score", handleScore);
      this.eventsBus.off("flappy:state", handleState);
      this.eventsBus.off("flappy:gameover", handleGameOver);
    };
  }
}
