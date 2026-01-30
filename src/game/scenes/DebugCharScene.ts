import { Scene } from "phaser";
import { charactersData } from "../main";
import { logger } from "../../lib/logger";

// Type for Phaser frame customData with Aseprite trim info
interface FrameCustomData {
  sourceSize?: { w: number; h: number };
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

interface DebugCharacter {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  crownSprite?: Phaser.GameObjects.Image;
  debugGraphics: Phaser.GameObjects.Graphics;
  characterKey: string;
  scale: number;
  isBoss: boolean;
}

export class DebugCharScene extends Scene {
  private characters: DebugCharacter[] = [];
  private currentScale = 1.0;
  private scaleText!: Phaser.GameObjects.Text;
  private showBossCrowns = true;

  constructor() {
    super("DebugCharScene");
  }

  create() {
    const camera = this.cameras.main;
    camera.setBackgroundColor(0x222222);

    logger.game.info("[DebugCharScene] Creating scene with characters:", charactersData?.length);

    if (!charactersData || charactersData.length === 0) {
      this.add
        .text(camera.centerX, camera.centerY, "No characters loaded", {
          fontFamily: "monospace",
          fontSize: "24px",
          color: "#ff0000",
        })
        .setOrigin(0.5);
      return;
    }

    // Create grid of characters
    const cols = 4;
    const cellWidth = camera.width / cols;
    const cellHeight = 200;
    const startY = 100;

    charactersData.forEach((charData: any, index: number) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = cellWidth / 2 + col * cellWidth;
      const y = startY + row * cellHeight + cellHeight / 2;

      this.createCharacter(charData, x, y);
    });

    // Add scale controls
    this.createControls();

    // Draw debug boxes for all characters
    this.drawAllDebugBoxes();
  }

  private createCharacter(charData: any, x: number, y: number) {
    const characterKey = charData.name?.toLowerCase().replace(/\s+/g, "-") || "warrior";

    // Check if texture exists
    if (!this.textures.exists(characterKey)) {
      logger.game.warn(`[DebugCharScene] Texture not found for ${characterKey}`);
      return;
    }

    const container = this.add.container(x, y);

    // Create sprite with origin at bottom-center (feet)
    const sprite = this.add.sprite(0, 0, characterKey);
    sprite.setOrigin(0.5, 1.0);
    sprite.setScale(this.currentScale);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Calculate feet offset (same as PlayerManager)
    const spriteFrame = sprite.frame;
    const customData = spriteFrame.customData as FrameCustomData | undefined;
    const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
    const trimY = customData?.spriteSourceSize?.y || 0;
    const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
    const feetGapUnscaled = sourceHeight - (trimY + trimHeight);
    const feetGapScaled = feetGapUnscaled * this.currentScale;
    sprite.setY(feetGapScaled);

    // Play idle animation if it exists
    const idleAnimKey = `${characterKey}-idle`;
    if (this.anims.exists(idleAnimKey)) {
      sprite.play(idleAnimKey);
    }

    // Create name text (same style as PlayerManager)
    const nameYOffset = feetGapScaled + 10;
    const nameText = this.add
      .text(0, nameYOffset, charData.name || characterKey, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);

    // All debug characters are "bosses" for testing crown display
    const isBoss = true;

    // Create crown sprite for boss characters (same as PlayerManager)
    let crownSprite: Phaser.GameObjects.Image | undefined;
    if (isBoss && this.textures.exists("crown")) {
      crownSprite = this.add.image(0, 0, "crown");
      crownSprite.setOrigin(0, 0.5);
      crownSprite.setTint(0xffd700);
      crownSprite.setScale(0.1);
      crownSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      crownSprite.setAngle(30);
      crownSprite.setX(nameText.width / 2 - 5);
      crownSprite.setY(nameYOffset - 10);
      crownSprite.setVisible(this.showBossCrowns);
    }

    // Create debug graphics
    const debugGraphics = this.add.graphics();

    // Add in correct order: sprite, nameText, crown (on top), debugGraphics
    container.add(sprite);
    container.add(nameText);
    if (crownSprite) {
      container.add(crownSprite);
    }
    container.add(debugGraphics);

    const debugChar: DebugCharacter = {
      container,
      sprite,
      nameText,
      crownSprite,
      debugGraphics,
      characterKey,
      scale: this.currentScale,
      isBoss,
    };

    this.characters.push(debugChar);
  }

  private createControls() {
    const camera = this.cameras.main;

    // Scale display
    this.scaleText = this.add
      .text(camera.width - 20, 20, `Scale: ${this.currentScale.toFixed(2)}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0);

    // Instructions
    this.add.text(
      20,
      20,
      "Controls:\n[+] Scale up (+1 SOL)\n[-] Scale down\n[R] Reset scale\n[D] Toggle debug\n[B] Toggle boss crowns",
      {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#aaaaaa",
        backgroundColor: "#000000cc",
        padding: { x: 8, y: 4 },
      }
    );

    // Keyboard controls
    this.input.keyboard?.on("keydown-PLUS", () => this.changeScale(0.5));
    this.input.keyboard?.on("keydown-EQUAL", () => this.changeScale(0.5)); // = key (same as +)
    this.input.keyboard?.on("keydown-MINUS", () => this.changeScale(-0.5));
    this.input.keyboard?.on("keydown-R", () => this.resetScale());
    this.input.keyboard?.on("keydown-D", () => this.toggleDebug());
    this.input.keyboard?.on("keydown-B", () => this.toggleBossCrowns());
  }

  private changeScale(delta: number) {
    this.currentScale = Math.max(0.5, Math.min(5.0, this.currentScale + delta));
    this.updateAllScales();
    this.scaleText.setText(`Scale: ${this.currentScale.toFixed(2)}`);
  }

  private resetScale() {
    this.currentScale = 1.0;
    this.updateAllScales();
    this.scaleText.setText(`Scale: ${this.currentScale.toFixed(2)}`);
  }

  private updateAllScales() {
    this.characters.forEach((char) => {
      char.sprite.setScale(this.currentScale);
      char.scale = this.currentScale;

      // Recalculate feet offset
      const spriteFrame = char.sprite.frame;
      const customData = spriteFrame.customData as FrameCustomData | undefined;
      const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
      const trimY = customData?.spriteSourceSize?.y || 0;
      const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
      const feetGapUnscaled = sourceHeight - (trimY + trimHeight);
      const feetGapScaled = feetGapUnscaled * this.currentScale;
      char.sprite.setY(feetGapScaled);

      // Update name position
      char.nameText.setY(feetGapScaled + 15);
    });

    // Redraw debug boxes
    this.drawAllDebugBoxes();
  }

  private toggleDebug() {
    this.characters.forEach((char) => {
      char.debugGraphics.setVisible(!char.debugGraphics.visible);
    });
  }

  private toggleBossCrowns() {
    this.showBossCrowns = !this.showBossCrowns;
    this.characters.forEach((char) => {
      if (char.crownSprite) {
        char.crownSprite.setVisible(this.showBossCrowns);
      }
    });
  }

  private drawAllDebugBoxes() {
    this.characters.forEach((char) => {
      this.drawDebugBox(char);
    });
  }

  private drawDebugBox(char: DebugCharacter) {
    const graphics = char.debugGraphics;
    const sprite = char.sprite;
    const container = char.container;

    graphics.clear();

    // Get frame data
    const frame = sprite.frame;
    const customData = frame.customData as FrameCustomData | undefined;
    const sourceHeight = customData?.sourceSize?.h || frame.height;
    const trimY = customData?.spriteSourceSize?.y || 0;
    const trimH = customData?.spriteSourceSize?.h || frame.height;
    const feetGapUnscaled = sourceHeight - (trimY + trimH);
    const feetGapScaled = feetGapUnscaled * sprite.scaleY;

    // Get sprite bounds
    const spriteBounds = sprite.getBounds();

    // Draw GREEN box around visible sprite (using getBounds in world space, convert to local)
    graphics.lineStyle(2, 0x00ff00, 1);
    const localBoundsX = spriteBounds.x - container.x;
    const localBoundsY = spriteBounds.y - container.y;
    graphics.strokeRect(localBoundsX, localBoundsY, spriteBounds.width, spriteBounds.height);

    // Calculate true feet Y (where visible pixels end)
    const spriteAnchorY = sprite.y; // In local container coords
    const trueFeetY = spriteAnchorY - feetGapScaled;

    // Draw CYAN dot at true feet position
    graphics.fillStyle(0x00ffff, 1);
    graphics.fillCircle(0, trueFeetY, 5);

    // Draw MAGENTA dot at container origin (0, 0)
    graphics.fillStyle(0xff00ff, 1);
    graphics.fillCircle(0, 0, 5);

    // Draw MAGENTA horizontal line at origin
    graphics.lineStyle(2, 0xff00ff, 0.8);
    graphics.lineBetween(-40, 0, 40, 0);

    // Log debug info
    logger.game.debug(`[DebugCharScene] ${char.characterKey}:`, {
      scale: sprite.scaleX,
      feetGapUnscaled,
      feetGapScaled,
      spriteY: sprite.y,
      trueFeetY,
      aligned: Math.abs(trueFeetY) < 5,
    });
  }

  // Public method to scale all characters (called from React)
  public scaleAllCharacters(delta: number) {
    this.changeScale(delta);
  }

  // Public method to get current scale
  public getCurrentScale(): number {
    return this.currentScale;
  }
}
