import Phaser, { Scene } from "phaser";
import { GamePhase } from "./GlobalGameStateManager";
import { EventBus } from "../EventBus";
import { currentUserWallet } from "../main";
import { SoundManager } from "./SoundManager";

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
  private cachedBetAmounts: number[] = []; // Cache bet amounts before game ends

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
  private multiplierText!: Phaser.GameObjects.Text;

  // Insert Coin UI (waiting for first bet)
  private insertCoinText!: Phaser.GameObjects.Text;
  private insertCoinTween!: Phaser.Tweens.Tween;

  // Track if countdown sound has been played for current game
  private countdownSoundPlayed: boolean = false;

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

      case GamePhase.INSERT_COIN:
        // Game created, waiting for first bet - show INSERT COIN
        console.log("[UIManager] 🪙 Showing INSERT COIN");
        this.hideAllUI();
        this.showInsertCoin();
        break;

      case GamePhase.WAITING:
        // Waiting for bets - show countdown
        this.vrfOverlay.setVisible(false);
        this.vrfContainer.setVisible(false);
        this.hideInsertCoin();
        // Countdown visibility handled by updateTimer
        break;

      case GamePhase.VRF_PENDING:
        // Waiting for winner determination - show VRF overlay
        console.log("[UIManager] 🎲 Showing VRF overlay");
        this.vrfOverlay.setVisible(true);
        this.vrfContainer.setVisible(true);
        this.timerContainer.setVisible(false);
        this.timerBackground.setVisible(false);
        this.hideInsertCoin();
        break;

      case GamePhase.FIGHTING:
        // Battle animations - hide VRF overlay, show countdown at 0
        console.log("[UIManager] ⚔️ Hiding VRF overlay for battle");
        this.vrfOverlay.setVisible(false);
        this.vrfContainer.setVisible(false);
        this.hideInsertCoin();
        break;

      case GamePhase.CELEBRATING:
        // Winner celebration - show winner UI
        console.log("[UIManager] 🎉 Showing winner UI for celebration");
        this.hideInsertCoin();
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
      this.winnerContainer &&
      this.multiplierText &&
      this.insertCoinText
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
    this.hideInsertCoin();

    // Clear cached data for next game
    this.cachedBetAmounts = [];

    // Reset countdown sound flag for next game
    this.countdownSoundPlayed = false;
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
    const winnerPrizeNum = this.gameState?.winnerPrize
      ? Number(this.gameState.winnerPrize) / 1e9
      : 0;
    const winnerPrize = winnerPrizeNum.toFixed(3);

    // Calculate multiplier from winner's bet (use cached amounts since live data gets cleared)
    let multiplier = 0;
    const winningBetIndex = this.gameState?.winningBetIndex;
    console.log(
      `[UIManager] Multiplier calc: winningBetIndex=${winningBetIndex}, cached bets=${this.cachedBetAmounts.length}, prize=${winnerPrizeNum}`
    );

    if (
      winningBetIndex !== null &&
      winningBetIndex !== undefined &&
      this.cachedBetAmounts.length > 0
    ) {
      // winningBetIndex might be a BN object
      const betIdx =
        typeof winningBetIndex === "object" && winningBetIndex.toNumber
          ? winningBetIndex.toNumber()
          : Number(winningBetIndex);

      console.log(
        `[UIManager] Bet index: ${betIdx}, cachedBetAmount:`,
        this.cachedBetAmounts[betIdx]
      );

      if (this.cachedBetAmounts[betIdx]) {
        const winnerBetAmount = this.cachedBetAmounts[betIdx] / 1e9;
        console.log(`[UIManager] Winner bet amount: ${winnerBetAmount} SOL`);
        if (winnerBetAmount > 0) {
          multiplier = winnerPrizeNum / winnerBetAmount;
          console.log(`[UIManager] Calculated multiplier: x${multiplier.toFixed(1)}`);
        }
      }
    }

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

      // Show multiplier with punchy animation
      this.showMultiplier(multiplier);

      // Emit event for React to show Twitter share button
      EventBus.emit("show-winner-share", {
        isCurrentUser: isCurrentUserWinner,
        prize: winnerPrize,
      });
    } else if (winnerWallet) {
      // Show winner name for non-winners
      const mappedName = this.playerNamesMap.get(winnerWallet);
      console.log(
        `[UIManager] Looking up winner: ${winnerWallet}, found: ${mappedName}, map size: ${this.playerNamesMap.size}`
      );

      const winnerDisplayName =
        mappedName || `${winnerWallet.slice(0, 4)}...${winnerWallet.slice(-4)}`;

      this.winnerContainer.setVisible(true);
      this.winnerContainer.setAlpha(1);
      this.phaseText.setVisible(true);
      this.phaseText.setText(`🏆 ${winnerDisplayName} WON!`);
      this.subText.setVisible(true);
      this.subText.setText(`Prize: ${winnerPrize} SOL`);

      // Show multiplier with punchy animation
      this.showMultiplier(multiplier);
    }
  }

  /**
   * Show multiplier with TOP SECRET stamp animation + counter
   */
  private showMultiplier(multiplier: number) {
    if (multiplier <= 1) {
      this.multiplierText.setVisible(false);
      return;
    }

    // Start with x1 - hidden until delay
    this.multiplierText.setText("x1");
    this.multiplierText.setVisible(false);
    this.multiplierText.setScale(0);
    this.multiplierText.setAlpha(1);
    this.multiplierText.setRotation(Phaser.Math.DegToRad(60)); // Start heavily tilted

    // STAMP animation: MASSIVE scale + heavy rotation slam (with delay)
    this.scene.tweens.add({
      targets: this.multiplierText,
      delay: 1800, // Wait for celebration to build up
      scale: { from: 100, to: 3.3 }, // Start HUGE, slam down to 3x
      rotation: { from: Phaser.Math.DegToRad(60), to: Phaser.Math.DegToRad(8) }, // Overshoot twist
      duration: 400,
      onStart: () => {
        this.multiplierText.setVisible(true); // Show when animation starts
      },
      ease: "Back.easeOut",
      onComplete: () => {
        // Settle rotation and scale - keep tilted like a stamp
        this.scene.tweens.add({
          targets: this.multiplierText,
          scale: 3,
          rotation: Phaser.Math.DegToRad(12), // Stay tilted!
          duration: 150,
          ease: "Sine.easeOut",
        });

        // Counter animation: x1 -> actual value
        const endValue = multiplier;
        const duration = Math.min(1200, 400 + multiplier * 100); // Longer for bigger multipliers

        this.scene.tweens.addCounter({
          from: 1,
          to: endValue,
          duration: duration,
          ease: "Cubic.easeOut", // Slows down at end for drama
          onUpdate: (tween) => {
            const value = tween.getValue();
            const displayValue = value >= 10 ? `x${Math.round(value)}` : `x${value.toFixed(1)}`;
            this.multiplierText.setText(displayValue);

            // Color changes based on multiplier value - more intense = hotter colors
            const color = this.getMultiplierColor(value);
            this.multiplierText.setColor(color);
          },
          onComplete: () => {
            // Final PUNCH when counter reaches the end
            this.scene.tweens.add({
              targets: this.multiplierText,
              scale: { from: 3, to: 4 },
              duration: 80,
              yoyo: true,
              ease: "Sine.easeInOut",
              onComplete: () => {
                // Shake for extra impact
                this.scene.tweens.add({
                  targets: this.multiplierText,
                  x: this.multiplierText.x + 5,
                  duration: 50,
                  yoyo: true,
                  repeat: 3,
                  ease: "Sine.easeInOut",
                });
              },
            });
          },
        });
      },
    });
  }

  /**
   * Get color for multiplier value - gradient from green to red
   * x1-x1.5: Green
   * x1.5-x2.5: Yellow
   * x2.5-x3.5: Orange (Domin8)
   * x3.5-x5: Red-Orange
   * x5+: Hot Red
   */
  private getMultiplierColor(value: number): string {
    if (value < 1.5) {
      return "#00FF00"; // Green
    } else if (value < 2.5) {
      // Green to Yellow
      const t = (value - 1.5) / 1;
      return this.lerpColor("#00FF00", "#FFFF00", t);
    } else if (value < 3.5) {
      // Yellow to Orange (Domin8)
      const t = (value - 2.5) / 1;
      return this.lerpColor("#FFFF00", "#FFA500", t);
    } else if (value < 5) {
      // Orange to Red-Orange
      const t = (value - 3.5) / 1.5;
      return this.lerpColor("#FFA500", "#FF4500", t);
    } else {
      // Hot Red for x5+
      return "#FF2222";
    }
  }

  /**
   * Linearly interpolate between two hex colors
   */
  private lerpColor(color1: string, color2: string, t: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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

  /**
   * Show INSERT COIN text with blinking animation
   */
  private showInsertCoin() {
    if (!this.insertCoinText) {
      console.log("[UIManager] ⚠️ showInsertCoin called but insertCoinText not created yet");
      return;
    }

    console.log("[UIManager] 🪙 showInsertCoin() - Making INSERT COIN visible");

    // Hide conflicting UI elements (VRF overlay, winner UI, countdown)
    // This fixes race condition where updateGameState() calls showInsertCoin()
    // before phase change event properly hides other elements
    if (this.vrfOverlay) this.vrfOverlay.setVisible(false);
    if (this.vrfContainer) this.vrfContainer.setVisible(false);
    if (this.winnerContainer) this.winnerContainer.setVisible(false);
    if (this.demoCountdownText) this.demoCountdownText.setVisible(false);

    this.insertCoinText.setVisible(true);
    this.insertCoinText.setAlpha(1);

    // Stop existing tween if any
    if (this.insertCoinTween) {
      this.insertCoinTween.destroy();
    }

    // Create blinking animation (classic arcade style)
    this.insertCoinTween = this.scene.tweens.add({
      targets: this.insertCoinText,
      alpha: { from: 1, to: 0.2 },
      duration: 500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Hide INSERT COIN text and stop animation
   */
  private hideInsertCoin() {
    if (!this.insertCoinText) return;

    this.insertCoinText.setVisible(false);

    // Stop blinking animation
    if (this.insertCoinTween) {
      this.insertCoinTween.destroy();
      this.insertCoinTween = undefined!;
    }
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
    if (this.insertCoinText) {
      this.insertCoinText.setX(centerX);
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

    // Multiplier text (e.g., "x10") - punchy style, positioned right and higher
    this.multiplierText = this.scene.add.text(100, -190, "", {
      fontFamily: "metal-slug",
      fontSize: "20px",
      color: "#00FF00", // Bright green
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 4,
    });
    this.multiplierText.setOrigin(0.5);
    this.multiplierText.setVisible(false);

    // Add to container
    this.winnerContainer.add([this.phaseText, this.subText, this.multiplierText]);

    // Create INSERT COIN text (blinking, Metal Slug style)
    // Position similar to demo countdown (75% down + 35 offset)
    const insertCoinY = this.scene.cameras.main.height / 2 + 35;
    this.insertCoinText = this.scene.add.text(this.centerX, insertCoinY, "INSERT COIN!", {
      fontFamily: "metal-slug",
      fontSize: "30px", // Same size as demo countdown
      color: "#FFD700", // Gold color
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 4,
    });
    this.insertCoinText.setOrigin(0.5);
    this.insertCoinText.setDepth(1000);
    this.insertCoinText.setScrollFactor(0);
    this.insertCoinText.setVisible(false);
  }

  updateGameState(gameState: any) {
    this.gameState = gameState;

    // Cache bet amounts while they're available (before game ends and clears them)
    if (gameState?.betAmounts && gameState.betAmounts.length > 0) {
      this.cachedBetAmounts = gameState.betAmounts.map((amt: any) =>
        typeof amt === "object" && amt.toNumber ? amt.toNumber() : Number(amt)
      );
      console.log(`[UIManager] Cached ${this.cachedBetAmounts.length} bet amounts`);
    }

    // Check if we should show INSERT COIN based on game status
    // Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
    const status = gameState?.status;
    const isInsertCoin = status === 2 || status === "waiting" || status === "Waiting";

    if (isInsertCoin && this.isUIReady()) {
      console.log("[UIManager] 🪙 Status is WAITING (2) - showing INSERT COIN");
      this.showInsertCoin();
    } else if (!isInsertCoin && this.isUIReady()) {
      this.hideInsertCoin();
    }
  }

  setPlayerNames(playerNames: Array<{ walletAddress: string; displayName: string | null }>) {
    this.playerNamesMap.clear();
    playerNames.forEach(({ walletAddress, displayName }) => {
      if (displayName) {
        this.playerNamesMap.set(walletAddress, displayName);
      }
    });
    console.log(
      `[UIManager] Player names updated: ${this.playerNamesMap.size} with names, ${playerNames.length} total`
    );
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

      // Play countdown sound when hitting 5 seconds (only once per game)
      if (!this.countdownSoundPlayed) {
        this.countdownSoundPlayed = true;
        SoundManager.playCountdown5Sec(this.scene);
      }
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

    // Cleanup insert coin tween
    if (this.insertCoinTween) {
      this.insertCoinTween.destroy();
    }
  }
}
