import { Scene } from "phaser";
import { GamePhaseManager } from "./GamePhaseManager";

export class UIManager {
  private scene: Scene;
  private centerX: number;
  private gamePhaseManager: GamePhaseManager | null = null;

  // UI Elements
  public titleLogo!: Phaser.GameObjects.Image;
  public timerText!: Phaser.GameObjects.Text;
  public timerBackground!: Phaser.GameObjects.Rectangle;

  private gameState: any = null;
  private lastTimerValue: string = "";
  private timerContainer!: Phaser.GameObjects.Container;
  private digitContainers: Map<number, Phaser.GameObjects.Container> = new Map();

  // Demo-style countdown (large, bottom center)
  private demoCountdownText!: Phaser.GameObjects.Text;
  private demoCountdownContainer!: Phaser.GameObjects.Container;

  // VRF waiting overlay
  private vrfOverlay!: Phaser.GameObjects.Rectangle;
  private vrfText!: Phaser.GameObjects.Text;
  private vrfSubText!: Phaser.GameObjects.Text;
  private vrfContainer!: Phaser.GameObjects.Container;

  // VRF phase tracking (triggered by countdown, not blockchain status)
  private isWaitingForVRF: boolean = false;
  private lastCountdownSeconds: number = -1;

  constructor(scene: Scene, centerX: number) {
    this.scene = scene;
    this.centerX = centerX;
  }

  setGamePhaseManager(gamePhaseManager: GamePhaseManager) {
    this.gamePhaseManager = gamePhaseManager;
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
    if (this.demoCountdownContainer) {
      this.demoCountdownContainer.setX(centerX);
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

    // Timer background with gradient-like effect
    this.timerBackground = this.scene.add.rectangle(this.centerX, 180, 160, 60, 0x2c1810, 0.8);
    this.timerBackground.setStrokeStyle(4, 0xffb347);
    this.timerBackground.setDepth(149);

    // Create timer container for animated digits
    this.timerContainer = this.scene.add.container(this.centerX, 180);
    this.timerContainer.setDepth(151);

    // Initialize with default timer display
    this.lastTimerValue = "";
    this.initializeTimer("0:00");

    // Create demo-style countdown (large, centered at bottom like demo mode)
    const bottomThirdY = this.scene.cameras.main.height * 0.75; // 75% down screen
    this.demoCountdownContainer = this.scene.add.container(this.centerX, bottomThirdY);
    this.demoCountdownContainer.setDepth(1000);
    this.demoCountdownContainer.setScrollFactor(0);
    this.demoCountdownContainer.setVisible(false); // Hidden by default

    // Countdown text positioned at (0, 110) to match demo exactly
    this.demoCountdownText = this.scene.add.text(0, 110, "30", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "96px",
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 8,
    });
    this.demoCountdownText.setOrigin(0.5);
    this.demoCountdownContainer.add(this.demoCountdownText);

    // Create VRF waiting overlay (pop-up style)
    const centerY = this.scene.cameras.main.height / 2;

    // Dark overlay background
    this.vrfOverlay = this.scene.add.rectangle(
      this.centerX,
      centerY,
      this.scene.cameras.main.width,
      this.scene.cameras.main.height,
      0x000000,
      0.85
    );
    this.vrfOverlay.setDepth(2000);
    this.vrfOverlay.setScrollFactor(0);
    this.vrfOverlay.setVisible(false);

    // VRF Container for text elements
    this.vrfContainer = this.scene.add.container(this.centerX, centerY);
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

  private initializeTimer(timeText: string) {
    // Clear existing containers
    this.digitContainers.forEach((container) => container.destroy());
    this.digitContainers.clear();

    // Calculate centering offset based on string length
    const charWidth = 22;
    const totalWidth = timeText.length * charWidth;
    const startOffset = -totalWidth / 2 + charWidth / 2;

    // Create initial digits
    for (let i = 0; i < timeText.length; i++) {
      const char = timeText[i];
      const xOffset = startOffset + i * charWidth;

      const container = this.scene.add.container(xOffset, 0);
      this.timerContainer.add(container);
      this.digitContainers.set(i, container);

      // Create mask for this digit position
      const maskGraphics = this.scene.add.graphics();
      maskGraphics.fillRect(this.centerX + xOffset - 15, 180 - 25, 30, 50);
      const mask = maskGraphics.createGeometryMask();
      container.setMask(mask);

      // Add initial digit
      const digit = this.createDigitText(char, "#FFDB58");
      container.add(digit);
    }
  }

  updateGameState(gameState: any) {
    this.gameState = gameState;
    if (!gameState) {
      // Reset VRF flag when no game
      this.isWaitingForVRF = false;
      this.lastCountdownSeconds = -1;
      return;
    }

    // Reset VRF flag when new game starts (status back to waiting)
    const status = gameState.status;
    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
    if (isWaiting && this.isWaitingForVRF) {
      console.log("[UIManager] 🔄 New game started - resetting VRF flag");
      this.isWaitingForVRF = false;
      this.lastCountdownSeconds = -1;
    }
  }

  private createDigitText(char: string, color: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, char, {
        fontFamily: "Arial Black",
        fontSize: 36,
        color: color,
        stroke: "#6B4423",
        strokeThickness: 5,
        align: "center",
        shadow: { offsetX: 2, offsetY: 2, color: "#000000", blur: 4, fill: true },
      })
      .setOrigin(0.5);
  }

  updateTimer() {
    if (!this.gameState) return;

    // endTimestamp comes from blockchain as Unix timestamp in SECONDS (endDate field)
    // Need to convert to milliseconds to match Date.now()
    const endTimestamp = this.gameState.endTimestamp || this.gameState.endDate;

    if (!endTimestamp || endTimestamp === 0) {
      // No countdown to show yet
      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);
      this.demoCountdownContainer.setVisible(false);
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
      return;
    }

    // Blockchain status: 0 = Waiting (open), 1 = Finished (closed)
    const status = this.gameState.status;

    // Check for winner - winner field from blockchain (PublicKey or string)
    let hasWinner = false;
    if (this.gameState.winner) {
      // Check if winner is actually set (not null PublicKey or empty string)
      const winnerStr =
        typeof this.gameState.winner === "string"
          ? this.gameState.winner
          : this.gameState.winner.toBase58?.();
      hasWinner = !!winnerStr && winnerStr !== "11111111111111111111111111111111"; // Not null address
    }

    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
    const isFinished = status === "Finished" || status === 1 || status === "finished";

    // Reset VRF waiting flag when winner is determined
    if (hasWinner && this.isWaitingForVRF) {
      console.log("[UIManager] 🎉 Winner detected! Hiding VRF overlay");
      this.isWaitingForVRF = false;
    }

    // If waiting for VRF (countdown ended but no winner yet), show overlay
    if (this.isWaitingForVRF && !hasWinner) {
      console.log("=".repeat(60));
      console.log("[UIManager] 🎲 VRF WAITING ACTIVE (triggered by countdown)");
      console.log("[UIManager] isWaitingForVRF:", this.isWaitingForVRF);
      console.log("[UIManager] hasWinner:", hasWinner);
      console.log("=".repeat(60));

      // Hide top timer
      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);

      // Show demo-style countdown at bottom
      this.updateDemoCountdown(endTimestamp);

      // Show VRF overlay
      this.vrfOverlay.setVisible(true);
      this.vrfContainer.setVisible(true);

      console.log("[UIManager] VRF Overlay visible:", this.vrfOverlay.visible);
      console.log("[UIManager] VRF Container visible:", this.vrfContainer.visible);
      return;
    }

    // If we were waiting for VRF but now have winner, hide overlay
    if (this.isWaitingForVRF && hasWinner) {
      console.log("[UIManager] 🎉 Winner found! Hiding VRF overlay, starting celebration");
      this.isWaitingForVRF = false;
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
    }

    // Winner celebration - hide everything
    if (isFinished && hasWinner) {
      console.log("[UIManager] 🎉 Celebration phase - hiding all UI");

      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);
      this.demoCountdownContainer.setVisible(false);
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
      return;
    }

    // Waiting phase: show demo-style countdown
    if (isWaiting) {
      console.log("[UIManager] ⏰ Waiting phase - showing demo countdown");

      // Hide VRF overlay
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);

      // Show demo-style countdown at bottom
      this.updateDemoCountdown(endTimestamp);
      return;
    }

    // Unknown phase - hide everything
    this.timerContainer.setVisible(false);
    this.timerBackground.setVisible(false);
    this.demoCountdownContainer.setVisible(false);
    this.vrfOverlay.setVisible(false);
    this.vrfContainer.setVisible(false);
  }

  // Update demo-style countdown (large text at bottom)
  private updateDemoCountdown(endTimestamp: number) {
    // Convert blockchain timestamp from seconds to milliseconds if needed
    const endTimestampMs = endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;

    // Calculate time remaining
    const currentTime = Date.now();
    const timeRemaining = Math.max(0, endTimestampMs - currentTime);
    const seconds = Math.ceil(timeRemaining / 1000);

    // Trigger VRF overlay when countdown reaches 0 (just like risk.fun!)
    if (seconds === 0 && this.lastCountdownSeconds > 0) {
      console.log("=".repeat(60));
      console.log("[UIManager] ⏰ COUNTDOWN REACHED 0! Triggering VRF overlay");
      console.log("=".repeat(60));
      this.isWaitingForVRF = true;

      // Notify GamePhaseManager to transition to VRF_PENDING phase
      if (this.gamePhaseManager) {
        this.gamePhaseManager.triggerVRFPhase();
      }
    }

    this.lastCountdownSeconds = seconds;

    // Show countdown
    this.demoCountdownContainer.setVisible(true);
    this.demoCountdownText.setText(seconds.toString());

    // Color changes based on urgency (same as demo)
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
}
