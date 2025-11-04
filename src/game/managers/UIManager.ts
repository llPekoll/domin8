import { Scene } from "phaser";
import { GamePhase } from "./GamePhaseManager";
import { EventBus } from "../EventBus";

export class UIManager {
  private scene: Scene;
  private centerX: number;

  // UI Elements
  public titleLogo!: Phaser.GameObjects.Image;
  public timerText!: Phaser.GameObjects.Text;
  public timerBackground!: Phaser.GameObjects.Rectangle;

  private gameState: any = null;
  private timerContainer!: Phaser.GameObjects.Container;

  // Demo-style countdown (large, bottom center)
  private demoCountdownText!: Phaser.GameObjects.Text;

  // VRF waiting overlay
  private vrfOverlay!: Phaser.GameObjects.Rectangle;
  private vrfText!: Phaser.GameObjects.Text;
  private vrfSubText!: Phaser.GameObjects.Text;
  private vrfContainer!: Phaser.GameObjects.Container;

  constructor(scene: Scene, centerX: number) {
    this.scene = scene;
    this.centerX = centerX;

    // Listen for phase changes from GamePhaseManager
    EventBus.on("game-phase-changed", this.onPhaseChanged.bind(this));
  }

  /**
   * Handle phase changes from GamePhaseManager
   * Updates UI visibility based on current phase
   */
  private onPhaseChanged(newPhase: GamePhase) {
    // Guard: Don't try to update UI before it's created
    if (!this.isUIReady()) {
      console.log(`[UIManager] Phase changed to ${newPhase} but UI not created yet`);
      return;
    }

    console.log(`[UIManager] 🎭 Phase changed to: ${newPhase}`);

    switch (newPhase) {
      case GamePhase.IDLE:
        // Demo mode - hide all UI
        this.hideAllUI();
        break;

      case GamePhase.WAITING:
        // Waiting for bets - show countdown
        this.vrfOverlay.setVisible(false);
        this.vrfContainer.setVisible(false);
        // Countdown visibility handled by updateTimer
        break;

      case GamePhase.VRF_PENDING:
        // Waiting for winner determination - show VRF overlay
        console.log("[UIManager] 🎲 Showing VRF overlay");
        this.vrfOverlay.setVisible(true);
        this.vrfContainer.setVisible(true);
        this.timerContainer.setVisible(false);
        this.timerBackground.setVisible(false);
        break;

      case GamePhase.FIGHTING:
        // Battle animations - hide VRF overlay, show countdown at 0
        console.log("[UIManager] ⚔️ Hiding VRF overlay for battle");
        this.vrfOverlay.setVisible(false);
        this.vrfContainer.setVisible(false);
        break;

      case GamePhase.CELEBRATING:
        // Winner celebration - hide all UI
        console.log("[UIManager] 🎉 Hiding all UI for celebration");
        this.hideAllUI();
        break;

      case GamePhase.CLEANUP:
        // Cleanup phase - hide all UI
        this.hideAllUI();
        break;
    }
  }

  private isUIReady(): boolean {
    return !!(
      this.vrfOverlay &&
      this.vrfContainer &&
      this.timerContainer &&
      this.timerBackground &&
      this.demoCountdownText
    );
  }

  private hideAllUI() {
    // Guard: Don't try to hide UI before it's created
    if (!this.isUIReady()) return;

    this.timerContainer.setVisible(false);
    this.timerBackground.setVisible(false);
    this.demoCountdownText.setVisible(false);
    this.vrfOverlay.setVisible(false);
    this.vrfContainer.setVisible(false);
  }

  updateCenter(centerX: number) {
    this.centerX = centerX;
    // Update positions of UI elements that use centerX
    if (this.titleLogo) {
      this.titleLogo.setX(centerX);
    }
    if (this.timerContainer) {
      this.timerContainer.setX(centerX);
    }
    if (this.timerBackground) {
      this.timerBackground.setX(centerX);
    }
    if (this.demoCountdownText) {
      this.demoCountdownText.setX(centerX);
    }
    if (this.vrfContainer) {
      this.vrfContainer.setX(centerX);
    }
    if (this.vrfOverlay) {
      this.vrfOverlay.setX(centerX);
    }
  }

  create() {
    // Show logo for 2 seconds then disappear
    this.titleLogo = this.scene.add.image(this.centerX, 350, "logo");
    this.titleLogo.setOrigin(0.5).setDepth(200);

    // Scale the logo appropriately (adjust this value as needed)
    this.titleLogo.setScale(0.3);

    // Animate logo appearance and disappearance
    this.titleLogo.setScale(0);
    this.scene.tweens.add({
      targets: this.titleLogo,
      scale: { from: 0, to: 0.3 },
      duration: 500,
      ease: "Back.easeOut",
      yoyo: true,
      hold: 1500,
      onComplete: () => {
        this.titleLogo.setVisible(false);
      },
    });

    // Create demo-style countdown (large, centered at bottom like demo mode)
    const bottomThirdY = this.scene.cameras.main.height * 0.75 + 110; // 75% down screen + 110 offset
    this.demoCountdownText = this.scene.add.text(this.centerX, bottomThirdY, "60", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "96px",
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 8,
    });
    this.demoCountdownText.setOrigin(0.5);
    this.demoCountdownText.setDepth(1000);
    this.demoCountdownText.setScrollFactor(0);
    this.demoCountdownText.setVisible(false); // Hidden by default

    // Create VRF waiting overlay (pop-up style)
    const centerY = this.scene.cameras.main.height / 2;
    const topThirdY = this.scene.cameras.main.height * 0.25; // 25% down from top

    // Dark overlay background (semi-transparent so explosions show through)
    this.vrfOverlay = this.scene.add.rectangle(
      this.centerX,
      centerY,
      this.scene.cameras.main.width,
      this.scene.cameras.main.height,
      0x000000,
      0.4 // Reduced from 0.85 to 0.4 so animations are visible
    );
    this.vrfOverlay.setDepth(2000);
    this.vrfOverlay.setScrollFactor(0);
    this.vrfOverlay.setVisible(false);

    // VRF Container for text elements (positioned higher up)
    this.vrfContainer = this.scene.add.container(this.centerX, topThirdY);
    this.vrfContainer.setDepth(2001);
    this.vrfContainer.setScrollFactor(0);
    this.vrfContainer.setVisible(false);

    // Main text: "DETERMINING WINNER..."
    this.vrfText = this.scene.add.text(0, -30, "DETERMINING WINNER...", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "48px",
      color: "#FFA500", // Domin8 orange
      stroke: "#000000",
      strokeThickness: 6,
    });
    this.vrfText.setOrigin(0.5);

    // Sub text: "Requesting blockchain randomness"
    this.vrfSubText = this.scene.add.text(0, 40, "Requesting blockchain randomness", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "24px",
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 4,
    });
    this.vrfSubText.setOrigin(0.5);

    this.vrfContainer.add([this.vrfText, this.vrfSubText]);

    // Pulsing animation for VRF text
    this.scene.tweens.add({
      targets: this.vrfText,
      scale: { from: 1, to: 1.1 },
      duration: 800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  updateGameState(gameState: any) {
    this.gameState = gameState;
  }

  updateTimer() {
    if (!this.gameState) {
      this.hideAllUI();
      return;
    }

    const endTimestamp = this.gameState.endTimestamp || this.gameState.endDate;

    this.updateDemoCountdown(endTimestamp);
  }

  // Update demo-style countdown (large text at bottom)
  // Pure display logic - no game state decisions
  private updateDemoCountdown(endTimestamp: number) {
    // Convert blockchain timestamp from seconds to milliseconds if needed
    const endTimestampMs = endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;

    // Calculate time remaining (allow negative values)
    const currentTime = Date.now();
    const timeRemaining = endTimestampMs - currentTime;
    const seconds = Math.ceil(timeRemaining / 1000);

    // Show countdown (including 0)
    this.demoCountdownText.setVisible(true);
    this.demoCountdownText.setText(Math.max(0, seconds).toString()); // Display 0 instead of negative

    // Hide countdown only after it goes negative (below 0)
    if (seconds < 0) {
      this.demoCountdownText.setVisible(false);
      return;
    }

    // Color changes based on urgency
    if (seconds <= 5) {
      this.demoCountdownText.setColor("#FF4444"); // Red
      // Pulse effect for last 5 seconds - scale text (not container) so it scales from center
      const scale = 1 + Math.sin(currentTime * 0.01) * 0.15;
      this.demoCountdownText.setScale(scale);
    } else if (seconds <= 10) {
      this.demoCountdownText.setColor("#FFA500"); // Orange
      this.demoCountdownText.setScale(1);
    } else {
      this.demoCountdownText.setColor("#FF4444"); // Default red
      this.demoCountdownText.setScale(1);
    }
  }

  // Cleanup event listeners
  destroy() {
    EventBus.off("game-phase-changed", this.onPhaseChanged.bind(this));
  }
}
