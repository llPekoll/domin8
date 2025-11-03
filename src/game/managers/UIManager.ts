import { Scene } from "phaser";

export class UIManager {
  private scene: Scene;
  private centerX: number;

  // UI Elements
  public titleLogo!: Phaser.GameObjects.Image;
  public phaseText!: Phaser.GameObjects.Text;
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

  constructor(scene: Scene, centerX: number) {
    this.scene = scene;
    this.centerX = centerX;
  }

  updateCenter(centerX: number) {
    this.centerX = centerX;
    // Update positions of UI elements that use centerX
    if (this.titleLogo) {
      this.titleLogo.setX(centerX);
    }
    if (this.phaseText) {
      this.phaseText.setX(centerX);
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

    // Phase indicator (always visible after title)
    this.phaseText = this.scene.add
      .text(this.centerX, 120, "", {
        fontFamily: "Arial Black",
        fontSize: 28,
        color: "#FFA500",
        stroke: "#4B2F20",
        strokeThickness: 4,
        align: "center",
        shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 3, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(150);

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
    if (!gameState) return;

    this.updatePhaseDisplay(gameState);
  }

  private updatePhaseDisplay(gameState: any) {
    // Detect phase based on blockchain status and winner existence
    const status = gameState.status;
    const hasWinner = !!gameState.winnerId || !!gameState.winner;
    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
    const isFinished = status === "Finished" || status === 1 || status === "finished";

    let phaseName = "GAME PHASE";
    let displayPhase = 1;
    const maxPhases = 3;

    if (isWaiting) {
      phaseName = "PLACE YOUR BETS";
      displayPhase = 1;
    } else if (isFinished && !hasWinner) {
      phaseName = "DRAWING WINNER";
      displayPhase = 2;
    } else if (isFinished && hasWinner) {
      phaseName = "WINNER DECLARED";
      displayPhase = 3;
    }

    // Display phase counter
    let displayText = `${phaseName} (${displayPhase}/${maxPhases})`;

    // Add player count for waiting phase (if available)
    if (isWaiting && gameState.playersCount !== undefined) {
      displayText = `${phaseName} (${gameState.playersCount}/5)`;
    } else if (isWaiting && gameState.bets) {
      displayText = `${phaseName} (${gameState.bets.length}/5)`;
    }

    this.phaseText.setText(displayText);
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

  private animateDigitChange(
    position: number,
    newChar: string,
    color: string,
    totalLength: number
  ) {
    // Calculate centering offset based on total string length
    const charWidth = 22;
    const totalWidth = totalLength * charWidth;
    const startOffset = -totalWidth / 2 + charWidth / 2;
    const xOffset = startOffset + position * charWidth;

    // Get or create container for this position
    let container = this.digitContainers.get(position);
    if (!container) {
      container = this.scene.add.container(xOffset, 0);
      this.timerContainer.add(container);
      this.digitContainers.set(position, container);

      // Create mask for this digit position
      const maskGraphics = this.scene.add.graphics();
      maskGraphics.fillRect(this.centerX + xOffset - 15, 180 - 25, 30, 50);
      const mask = maskGraphics.createGeometryMask();
      container.setMask(mask);
    } else {
      // Update position if length changed
      container.setX(xOffset);
    }

    // Clear old digits that are off-screen
    const toRemove: Phaser.GameObjects.Text[] = [];
    container.each((child: any) => {
      if (child.y > 40 || child.y < -40) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((child) => container.remove(child, true));

    // Create new digit coming from top
    const newDigit = this.createDigitText(newChar, color);
    newDigit.setY(-40); // Start above visible area
    container.add(newDigit);

    // Animate existing digits down and new digit into place
    container.each((child: any) => {
      if (child === newDigit) {
        // New digit slides in from top
        this.scene.tweens.add({
          targets: child,
          y: 0,
          duration: 200,
          ease: "Power2",
        });
      } else {
        // Old digits slide down and fade out
        this.scene.tweens.add({
          targets: child,
          y: child.y + 40,
          alpha: 0,
          duration: 200,
          ease: "Power2",
          onComplete: () => {
            container.remove(child, true);
          },
        });
      }
    });
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
    // We need to detect VRF phase vs winner celebration within "Finished" status
    const status = this.gameState.status;
    const hasWinner = !!this.gameState.winnerId || !!this.gameState.winner;

    // Calculate if we're past endDate
    const endTimestampMs = endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;
    const now = Date.now();
    const isPastEndDate = now >= endTimestampMs;

    // Phase detection:
    // - Waiting: status = "Waiting" OR status = 0
    // - VRF Phase: status = "Finished" but NO winner yet (VRF in progress)
    // - Celebration: status = "Finished" AND winner exists

    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
    const isFinished = status === "Finished" || status === 1 || status === "finished";
    const isVRFPhase = isFinished && !hasWinner && isPastEndDate;
    const isCelebration = isFinished && hasWinner;

    console.log("[UIManager] Phase detection:", {
      status,
      hasWinner,
      isPastEndDate,
      isWaiting,
      isVRFPhase,
      isCelebration,
      endTimestamp,
      now: now / 1000,
    });

    if (isVRFPhase) {
      // VRF Phase: Game finished but no winner yet (blockchain randomness in progress)
      console.log("[UIManager] 🎲 VRF Phase - showing countdown + overlay");

      // Hide top timer during VRF phase
      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);

      // Show demo-style countdown at bottom
      this.updateDemoCountdown(endTimestamp);

      // Show VRF overlay
      this.vrfOverlay.setVisible(true);
      this.vrfContainer.setVisible(true);
      return;
    } else if (isCelebration) {
      // Winner announced - hide all timers during celebration
      console.log("[UIManager] 🎉 Celebration phase - hiding all UI");

      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);
      this.demoCountdownContainer.setVisible(false);
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
      return;
    } else if (!isWaiting) {
      // Unknown phase - hide everything
      console.log("[UIManager] ❓ Unknown phase - hiding all UI");

      this.timerContainer.setVisible(false);
      this.timerBackground.setVisible(false);
      this.demoCountdownContainer.setVisible(false);
      this.vrfOverlay.setVisible(false);
      this.vrfContainer.setVisible(false);
      return;
    }

    // Waiting phase: show demo-style countdown (large, bottom, metal-slug font)
    console.log("[UIManager] ⏰ Waiting phase - showing demo countdown");

    // Hide top timer and VRF overlay
    this.timerContainer.setVisible(false);
    this.timerBackground.setVisible(false);
    this.vrfOverlay.setVisible(false);
    this.vrfContainer.setVisible(false);

    // Show demo-style countdown at bottom
    this.updateDemoCountdown(endTimestamp);
  }

  // Update demo-style countdown (large text at bottom)
  private updateDemoCountdown(endTimestamp: number) {
    // Convert blockchain timestamp from seconds to milliseconds if needed
    const endTimestampMs =
      endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;

    // Calculate time remaining
    const currentTime = Date.now();
    const timeRemaining = Math.max(0, endTimestampMs - currentTime);
    const seconds = Math.ceil(timeRemaining / 1000);

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
