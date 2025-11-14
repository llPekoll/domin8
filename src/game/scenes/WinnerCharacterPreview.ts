import { Scene } from "phaser";

/**
 * Scene specifically for displaying the last winner's character in their winning pose
 * Used in the LastWinnerCard component
 */
export class WinnerCharacterPreview extends Scene {
  private currentCharacterSprite?: Phaser.GameObjects.Sprite;
  private currentCharacterKey?: string;

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

    this.currentCharacterKey = characterKey;

    // Create the character sprite in the center
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    this.currentCharacterSprite = this.add.sprite(centerX, centerY, characterKey);

    // Scale the character appropriately for the preview
    this.currentCharacterSprite.setScale(4);

    // Keep pixel art crisp when scaling
    this.currentCharacterSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Play win animation (loops by default based on Preloader.ts:268)
    const winAnimKey = `${characterKey}-win`;
    if (this.anims.exists(winAnimKey)) {
      this.currentCharacterSprite.play(winAnimKey);
    } else {
      // Fallback to idle animation if win animation doesn't exist
      const idleAnimKey = `${characterKey}-idle`;
      if (this.anims.exists(idleAnimKey)) {
        this.currentCharacterSprite.play(idleAnimKey);
      }
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
