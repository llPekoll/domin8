import { Scene } from "phaser";

/**
 * Scene specifically for displaying the last winner's character in their winning pose
 * Used in the LastWinnerCard component
 */
export class WinnerCharacterPreview extends Scene {
  private currentCharacterSprite?: Phaser.GameObjects.Sprite;
  private currentCharacterKey?: string;
  private winAnimationTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("WinnerCharacterPreview");
  }

  create() {
    // Initialize with no character
    this.currentCharacterSprite = undefined;
  }

  /**
   * Load and display a character in their winning pose animation
   * @param characterKey - The character key (e.g., "orc", "pepe", etc.)
   */
  public displayWinningCharacter(characterKey: string) {
    if (this.currentCharacterKey === characterKey) {
      return; // Already displaying this character
    }

    // Remove existing character if any
    if (this.currentCharacterSprite) {
      this.currentCharacterSprite.destroy();
    }

    // Clear existing timer if any
    if (this.winAnimationTimer) {
      this.winAnimationTimer.destroy();
      this.winAnimationTimer = undefined;
    }

    this.currentCharacterKey = characterKey;

    // Create the character sprite in the center
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    this.currentCharacterSprite = this.add.sprite(centerX, centerY, characterKey);

    // Scale the character appropriately for the preview
    this.currentCharacterSprite.setScale(4);

    // Keep pixel art crisp when scaling
    this.currentCharacterSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Play idle animation by default
    const idleAnimKey = `${characterKey}-idle`;
    if (this.anims.exists(idleAnimKey)) {
      this.currentCharacterSprite.play(idleAnimKey);
    }

    // Set up periodic win animation every 45 seconds
    this.winAnimationTimer = this.time.addEvent({
      delay: 45000, // 45 seconds
      callback: () => this.playWinAnimation(),
      loop: true,
    });
  }

  /**
   * Play the win animation 3 times, then return to idle
   */
  private playWinAnimation() {
    if (!this.currentCharacterSprite || !this.currentCharacterKey) {
      return;
    }

    const winAnimKey = `${this.currentCharacterKey}-win`;
    if (this.anims.exists(winAnimKey)) {
      // Stop current animation to ensure clean state
      this.currentCharacterSprite.stop();

      // Play win animation with repeat (will play 3 times total: 1 initial + 2 repeats)
      this.currentCharacterSprite.play({
        key: winAnimKey,
        repeat: 2, // Play 3 times total (initial play + 2 repeats)
      });

      // Return to idle after all repeats complete
      this.currentCharacterSprite.once("animationcomplete", () => {
        if (this.currentCharacterSprite && this.currentCharacterKey) {
          const idleAnimKey = `${this.currentCharacterKey}-idle`;
          if (this.anims.exists(idleAnimKey)) {
            this.currentCharacterSprite.play(idleAnimKey);
          }
        }
      });
    }
  }

  /**
   * Clear the character display
   */
  public clearCharacter() {
    if (this.currentCharacterSprite) {
      this.currentCharacterSprite.destroy();
      this.currentCharacterSprite = undefined;
    }
    if (this.winAnimationTimer) {
      this.winAnimationTimer.destroy();
      this.winAnimationTimer = undefined;
    }
    this.currentCharacterKey = undefined;
  }

  /**
   * Resize method for responsive design
   */
  public resizeScene(width: number, height: number) {
    this.cameras.main.setSize(width, height);

    // Reposition character sprite if it exists
    if (this.currentCharacterSprite) {
      const centerX = width / 2;
      const centerY = height / 2;
      this.currentCharacterSprite.setPosition(centerX, centerY);
    }
  }
}
