import { Scene } from "phaser";
import { GamePhase } from "./GlobalGameStateManager";
import { EventBus } from "../EventBus";
import { currentUserWallet } from "../main";

export class UIManager {
  private scene: Scene;
  private centerX: number;

  // UI Elements
  public titleLogo!: Phaser.GameObjects.Image;
  public timerText!: Phaser.GameObjects.Text;
  public timerBackground!: Phaser.GameObjects.Rectangle;

  private gameState: any = null;
  private timerContainer!: Phaser.GameObjects.Container;
  private playerNamesMap: Map<string, string> = new Map();

  // Demo-style countdown (large, bottom center)
  private demoCountdownText!: Phaser.GameObjects.Text;

  // VRF waiting overlay
  private vrfOverlay!: Phaser.GameObjects.Rectangle;
  private vrfText!: Phaser.GameObjects.Text;
  private vrfSubText!: Phaser.GameObjects.Text;
  private vrfContainer!: Phaser.GameObjects.Container;

  // Winner phase UI (large, centered)
  private phaseText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private winnerContainer!: Phaser.GameObjects.Container;

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
        // Winner celebration - show winner UI
        console.log("[UIManager] 🎉 Showing winner UI for celebration");
        this.showWinnerUI();
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
      this.demoCountdownText &&
      this.winnerContainer
    );
  }

  hideAllUI() {
    // Guard: Don't try to hide UI before it's created
    if (!this.isUIReady()) return;

    this.timerContainer.setVisible(false);
    this.timerBackground.setVisible(false);
    this.demoCountdownText.setVisible(false);
    this.vrfOverlay.setVisible(false);
    this.vrfContainer.setVisible(false);
    this.winnerContainer.setVisible(false);
  }

  private showWinnerUI() {
    // Guard: Don't try to show UI before it's created
    if (!this.isUIReady()) return;

    // Hide other UI elements
    this.timerContainer.setVisible(false);
    this.timerBackground.setVisible(false);
    this.demoCountdownText.setVisible(false);
    this.vrfOverlay.setVisible(false);
    this.vrfContainer.setVisible(false);

    // Get winner info from game state
    const winnerWallet = this.gameState?.winner?.toBase58?.() || this.gameState?.winner;
    const winnerPrize = this.gameState?.winnerPrize
      ? (Number(this.gameState.winnerPrize) / 1e9).toFixed(3)
      : "0";

    // Check if current user is the winner
    const isCurrentUserWinner = currentUserWallet && winnerWallet === currentUserWallet;

    if (isCurrentUserWinner) {
      // Show winner UI with personalized message
      this.winnerContainer.setVisible(true);
      this.winnerContainer.setAlpha(1); // Reset alpha in case it was faded
      this.phaseText.setVisible(true);
      this.phaseText.setText(`🏆 YOU WON ${winnerPrize} SOL!`);
      this.subText.setVisible(true);
      this.subText.setText("Restarting in 4s...");

      // Emit event for React to show Twitter share button
      EventBus.emit("show-winner-share", {
        isCurrentUser: isCurrentUserWinner,
        prize: winnerPrize,
      });
    } else if (winnerWallet) {
      // Show winner name for non-winners
      const mappedName = this.playerNamesMap.get(winnerWallet);
      console.log(`[UIManager] Looking up winner: ${winnerWallet}, found: ${mappedName}, map size: ${this.playerNamesMap.size}`);

      const winnerDisplayName = mappedName ||
        `${winnerWallet.slice(0, 4)}...${winnerWallet.slice(-4)}`;

      this.winnerContainer.setVisible(true);
      this.winnerContainer.setAlpha(1);
      this.phaseText.setVisible(true);
      this.phaseText.setText(`🏆 ${winnerDisplayName} WON!`);
      this.subText.setVisible(true);
      this.subText.setText(`Prize: ${winnerPrize} SOL`);
    }
  }

  /**
   * Fade out winner UI smoothly before hiding
   */
  fadeOutWinnerUI(duration: number = 1000) {
    if (!this.isUIReady()) return;

    // Fade out winner container
    this.scene.tweens.add({
      targets: this.winnerContainer,
      alpha: 0,
      duration: duration,
      ease: "Power2",
      onComplete: () => {
        this.winnerContainer.setVisible(false);
        this.winnerContainer.setAlpha(1); // Reset for next time
      },
    });
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
    if (this.winnerContainer) {
      this.winnerContainer.setX(centerX);
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

    // Create timer container and background (placeholder for future use)
    this.timerContainer = this.scene.add.container(this.centerX, 50);
    this.timerContainer.setDepth(1000);
    this.timerContainer.setScrollFactor(0);
    this.timerContainer.setVisible(false);

    this.timerBackground = this.scene.add.rectangle(this.centerX, 50, 200, 50, 0x000000, 0.5);
    this.timerBackground.setDepth(999);
    this.timerBackground.setScrollFactor(0);
    this.timerBackground.setVisible(false);

    // Create demo-style countdown (large, centered at bottom like demo mode)
    const demoCountdownY = this.scene.cameras.main.height * 0.75 + 35; // 75% down screen + 35 offset (scaled from 110)
    this.demoCountdownText = this.scene.add.text(this.centerX, demoCountdownY, "60", {
      fontFamily: "metal-slug ",
      fontSize: "30px", // Scaled down from 96px
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 3, // Scaled down from 8
      resolution: 4, // High resolution for crisp text when scaled
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
    this.vrfText = this.scene.add.text(0, -10, "DETERMINING WINNER...", {
      fontFamily: "metal-slug",
      fontSize: "16px", // Scaled down from 48px
      color: "#FFA500", // Domin8 orange
      stroke: "#000000",
      strokeThickness: 2, // Scaled down from 6
      resolution: 4, // High resolution for crisp text when scaled
    });
    this.vrfText.setOrigin(0.5);

    // Sub text: "Requesting blockchain randomness"
    this.vrfSubText = this.scene.add.text(0, 13, "Requesting blockchain randomness", {
      fontFamily: "metal-slug",
      fontSize: "8px", // Scaled down from 24px
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 1, // Scaled down from 4
      resolution: 4, // High resolution for crisp text when scaled
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

    // Create winner UI container (bottom 1/3 of screen, like demo mode)
    const bottomThirdY = this.scene.cameras.main.height * 0.75; // 75% down the screen
    this.winnerContainer = this.scene.add.container(this.centerX, bottomThirdY);
    this.winnerContainer.setDepth(1000);
    this.winnerContainer.setScrollFactor(0);
    this.winnerContainer.setVisible(false);

    // Phase text (Winner Crowned) - scaled for native resolution
    this.phaseText = this.scene.add.text(0, 0, "", {
      fontFamily: "metal-slug",
      fontSize: "16px", // Scaled down from 48px
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 2, // Scaled down from 5
      resolution: 4, // High resolution for crisp text when scaled
    });
    this.phaseText.setOrigin(0.5);

    // Sub text (restarting info) - scaled for native resolution
    this.subText = this.scene.add.text(0, 22, "", {
      fontFamily: "metal-slug",
      fontSize: "10px", // Scaled down from 28px
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 1, // Scaled down from 3
      resolution: 4, // High resolution for crisp text when scaled
    });
    this.subText.setOrigin(0.5);

    // Add to container
    this.winnerContainer.add([this.phaseText, this.subText]);
  }

  updateGameState(gameState: any) {
    this.gameState = gameState;
  }

  setPlayerNames(playerNames: Array<{ walletAddress: string; displayName: string | null }>) {
    this.playerNamesMap.clear();
    playerNames.forEach(({ walletAddress, displayName }) => {
      if (displayName) {
        this.playerNamesMap.set(walletAddress, displayName);
      }
    });
    console.log(`[UIManager] Player names updated: ${this.playerNamesMap.size} with names, ${playerNames.length} total`);
    console.log(`[UIManager] Names map:`, Object.fromEntries(this.playerNamesMap));
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
