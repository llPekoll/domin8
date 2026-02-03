import Phaser from "phaser";

/**
 * Boot scene for CHOP game
 * Loads all game assets before starting
 */
export class ChopBoot extends Phaser.Scene {
  constructor() {
    super("ChopBoot");
  }

  preload() {
    // Show loading progress
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Progress bar background
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    // Progress bar fill
    const progressBar = this.add.graphics();

    // Loading text
    const loadingText = this.add.text(width / 2, height / 2 - 50, "Loading...", {
      fontSize: "20px",
      color: "#ffffff",
    });
    loadingText.setOrigin(0.5, 0.5);

    // Percent text
    const percentText = this.add.text(width / 2, height / 2, "0%", {
      fontSize: "18px",
      color: "#ffffff",
    });
    percentText.setOrigin(0.5, 0.5);

    // Update progress bar
    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xf59e0b, 1); // Amber color
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
      percentText.setText(`${Math.floor(value * 100)}%`);
    });

    // Clean up on complete
    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // Load all CHOP assets
    this.load.image("chop-background", "/assets/chop/background.png");
    // man.png is an Aseprite atlas with chop (0-1) and idle (2-3) animations
    this.load.aseprite("chop-man", "/assets/chop/man.png", "/assets/chop/man.json");
    this.load.image("chop-trunk1", "/assets/chop/trunk1.png");
    this.load.image("chop-trunk2", "/assets/chop/trunk2.png");
    this.load.image("chop-branch1", "/assets/chop/branch1.png");
    this.load.image("chop-branch2", "/assets/chop/branch2.png");
    this.load.image("chop-stump", "/assets/chop/stump.png");
    this.load.image("chop-rip", "/assets/chop/rip.png");
    this.load.image("chop-bar", "/assets/chop/bar.png");
    this.load.image("chop-bar-black", "/assets/chop/bar_black.png");
    this.load.image("chop-bar-container", "/assets/chop/bar_container.png");
  }

  create() {
    // Start the main game scene
    this.scene.start("ChopGame");
  }
}
