import { Scene } from "phaser";

export class CharacterPreview extends Scene {
  private currentCharacterSprite?: Phaser.GameObjects.Sprite;
  private currentCharacterKey?: string;

  constructor() {
    super("CharacterPreview");
  }

  create() {
    // Initialize with no character
    this.currentCharacterSprite = undefined;
  }

  // Method to load and display a character
  public displayCharacter(characterKey: string) {
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

    // Play idle animation
    const idleAnimKey = `${characterKey}-idle`;
    if (this.anims.exists(idleAnimKey)) {
      this.currentCharacterSprite.play(idleAnimKey);
    }
  }

  // Method to clear the character display
  public clearCharacter() {
    if (this.currentCharacterSprite) {
      this.currentCharacterSprite.destroy();
      this.currentCharacterSprite = undefined;
    }
    this.currentCharacterKey = undefined;
  }

  // Get the current scene's canvas element for embedding
  public getCanvas(): HTMLCanvasElement | null {
    return this.game.canvas;
  }

  // Resize method for responsive design
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
