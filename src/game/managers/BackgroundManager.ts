import { Scene } from "phaser";
import { logger } from "../../lib/logger";

/**
 * BackgroundManager - Simple background image display
 *
 * Purpose: Load and display background images, handle resize
 */
export class BackgroundManager {
  private scene: Scene;
  private background: Phaser.GameObjects.Image | null = null;
  private centerX: number;
  private centerY: number;

  constructor(scene: Scene, centerX: number, centerY: number) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  /**
   * Update center coordinates (called on resize)
   */
  updateCenter(centerX: number, centerY: number) {
    this.centerX = centerX;
    this.centerY = centerY;

    if (this.background) {
      this.background.setPosition(this.centerX, this.centerY);
      this.scaleToFit();
    }
  }

  /**
   * Set background from texture key (texture must already be loaded in Preloader)
   */
  setTexture(textureKey: string) {
    if (!this.scene.textures.exists(textureKey)) {
      logger.game.warn("[BackgroundManager] Texture not found:", textureKey);
      return;
    }

    // Destroy old background if exists
    if (this.background) {
      this.background.destroy();
    }

    // Create new background
    this.background = this.scene.add.image(this.centerX, this.centerY, textureKey);
    this.background.setOrigin(0.5, 0.5);
    this.background.setDepth(0);
    // Keep pixel art crisp when scaling
    this.background.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scaleToFit();
  }

  /**
   * Scale background to cover entire screen
   */
  private scaleToFit() {
    if (!this.background) return;

    const scaleX = this.scene.cameras.main.width / this.background.width;
    const scaleY = this.scene.cameras.main.height / this.background.height;
    const scale = Math.max(scaleX, scaleY);
    this.background.setScale(scale);
  }

  /**
   * Destroy background
   */
  destroy() {
    if (this.background) {
      this.background.destroy();
      this.background = null;
    }
  }
}
