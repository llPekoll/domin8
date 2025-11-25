import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { allMapsData, activeGameData, GAME_STATUS, STAGE_WIDTH, STAGE_HEIGHT, RESOLUTION_SCALE } from "../main";
import { logger } from "../../lib/logger";
import { loadBackgroundConfig } from "../config/backgrounds";

/**
 * MapCarousel Scene - Slot machine style map selection
 *
 * Shows all available backgrounds spinning like a carousel/slot machine.
 * When the backend creates a new game (with mapId), the carousel
 * slows down and stops on the selected map.
 *
 * Flow:
 * 1. Previous game celebration ends
 * 2. MapCarousel starts spinning through backgrounds
 * 3. Backend creates game with mapId
 * 4. Carousel stops on selected map
 * 5. Transition to Game scene with "insert-coin" mode
 */

interface CarouselCard {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  mapId: number;
  mapName: string;
}

export class MapCarousel extends Scene {
  private cards: CarouselCard[] = [];
  private currentIndex: number = 0;
  private isSpinning: boolean = false;
  private targetMapId: number | null = null;
  private spinSpeed: number = 0;
  private cardWidth: number = 300 * RESOLUTION_SCALE;
  private cardHeight: number = 150 * RESOLUTION_SCALE;
  private cardSpacing: number = 20 * RESOLUTION_SCALE;

  // UI Elements
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private mapNameText!: Phaser.GameObjects.Text;

  // Timers
  private spinCheckTimer?: Phaser.Time.TimerEvent;
  private autoSpinTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("MapCarousel");
  }

  create() {
    logger.game.info("[MapCarousel] Creating carousel scene");

    const centerX = STAGE_WIDTH / 2;
    const centerY = STAGE_HEIGHT / 2;

    // Dark background
    this.add.rectangle(centerX, centerY, STAGE_WIDTH, STAGE_HEIGHT, 0x0a0a0a, 0.95);

    // Title
    this.titleText = this.add.text(centerX, 40 * RESOLUTION_SCALE, "NEXT ARENA", {
      fontFamily: "Jersey15",
      fontSize: `${24 * RESOLUTION_SCALE}px`,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2 * RESOLUTION_SCALE,
    }).setOrigin(0.5);

    // Subtitle (changes based on state)
    this.subtitleText = this.add.text(centerX, 70 * RESOLUTION_SCALE, "Selecting battlefield...", {
      fontFamily: "Jersey15",
      fontSize: `${14 * RESOLUTION_SCALE}px`,
      color: "#ffcc00",
    }).setOrigin(0.5);

    // Create carousel cards from available maps
    this.createCarouselCards(centerX, centerY);

    // Map name display (below carousel)
    this.mapNameText = this.add.text(centerX, STAGE_HEIGHT - 30 * RESOLUTION_SCALE, "", {
      fontFamily: "Jersey15",
      fontSize: `${18 * RESOLUTION_SCALE}px`,
      color: "#ffffff",
    }).setOrigin(0.5);

    // Start spinning
    this.startSpinning();

    // Listen for game creation events
    this.setupEventListeners();

    // Check if a game already exists
    this.checkForExistingGame();
  }

  private createCarouselCards(centerX: number, centerY: number) {
    const maps = allMapsData || [];

    if (maps.length === 0) {
      logger.game.warn("[MapCarousel] No maps available!");
      return;
    }

    logger.game.debug("[MapCarousel] Creating cards for", maps.length, "maps");

    // Create cards for each map (duplicate for smooth looping)
    const allMapIds = maps.map((m: any) => m.id);
    // Duplicate array for seamless looping
    const extendedMaps = [...maps, ...maps, ...maps];

    extendedMaps.forEach((map: any, index: number) => {
      const card = this.createCard(map, index, centerX, centerY);
      this.cards.push(card);
    });

    // Position cards initially
    this.positionCards();
  }

  private createCard(map: any, index: number, centerX: number, centerY: number): CarouselCard {
    const container = this.add.container(0, centerY);

    // Card background (border)
    const cardBg = this.add.rectangle(0, 0, this.cardWidth + 8, this.cardHeight + 8, 0x333333);
    cardBg.setStrokeStyle(2 * RESOLUTION_SCALE, 0x666666);
    container.add(cardBg);

    // Load background config
    const bgConfig = loadBackgroundConfig(map.id);
    let bgImage: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

    if (bgConfig && this.textures.exists(bgConfig.textureKey)) {
      if (bgConfig.type === "animated") {
        bgImage = this.add.sprite(0, 0, bgConfig.textureKey);
      } else {
        bgImage = this.add.image(0, 0, bgConfig.textureKey);
      }

      // Scale to fit card
      const scaleX = this.cardWidth / bgImage.width;
      const scaleY = this.cardHeight / bgImage.height;
      const scale = Math.max(scaleX, scaleY);
      bgImage.setScale(scale);
    } else {
      // Fallback colored rectangle
      bgImage = this.add.image(0, 0, "__DEFAULT");
      const fallbackRect = this.add.rectangle(0, 0, this.cardWidth, this.cardHeight, 0x1a1a2e);
      container.add(fallbackRect);
    }

    container.add(bgImage);

    // Map name label on card
    const nameLabel = this.add.text(0, this.cardHeight / 2 - 15 * RESOLUTION_SCALE, map.name || `Map ${map.id}`, {
      fontFamily: "Jersey15",
      fontSize: `${12 * RESOLUTION_SCALE}px`,
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5);
    container.add(nameLabel);

    return {
      container,
      background: bgImage,
      mapId: map.id,
      mapName: map.name || `Map ${map.id}`,
    };
  }

  private positionCards() {
    const centerX = STAGE_WIDTH / 2;
    const totalWidth = this.cardWidth + this.cardSpacing;

    this.cards.forEach((card, index) => {
      // Calculate position relative to current index
      const offset = index - this.currentIndex;
      const x = centerX + offset * totalWidth;

      card.container.setX(x);

      // Scale and alpha based on distance from center
      const distance = Math.abs(offset);
      const scale = Math.max(0.6, 1 - distance * 0.15);
      const alpha = Math.max(0.3, 1 - distance * 0.25);

      card.container.setScale(scale);
      card.container.setAlpha(alpha);

      // Depth based on distance (center cards on top)
      card.container.setDepth(10 - distance);
    });
  }

  private startSpinning() {
    this.isSpinning = true;
    this.spinSpeed = 0.03; // Cards per frame (slower, more visible)

    // Spin animation
    this.autoSpinTimer = this.time.addEvent({
      delay: 60, // Slower update rate
      callback: this.updateSpin,
      callbackScope: this,
      loop: true,
    });

    logger.game.debug("[MapCarousel] Started spinning");
  }

  private updateSpin() {
    if (!this.isSpinning) return;

    // Move current index
    this.currentIndex += this.spinSpeed;

    // Loop around
    const totalCards = this.cards.length;
    if (this.currentIndex >= totalCards) {
      this.currentIndex -= totalCards / 3; // Reset to middle third
    }

    // If we have a target, slow down as we approach
    if (this.targetMapId !== null) {
      const targetIndex = this.findCardIndexForMap(this.targetMapId);
      const distance = Math.abs(targetIndex - this.currentIndex);

      if (distance < 3) {
        this.spinSpeed *= 0.92; // Slow down
      }

      // Stop when we're close enough and slow enough
      if (distance < 0.1 && this.spinSpeed < 0.02) {
        this.stopOnMap(this.targetMapId);
        return;
      }
    }

    this.positionCards();
  }

  private findCardIndexForMap(mapId: number): number {
    // Find the card in the middle section (for smooth stopping)
    const mapsCount = (allMapsData || []).length;
    for (let i = mapsCount; i < mapsCount * 2; i++) {
      if (this.cards[i]?.mapId === mapId) {
        return i;
      }
    }
    return this.currentIndex;
  }

  private stopOnMap(mapId: number) {
    this.isSpinning = false;
    this.spinSpeed = 0;

    if (this.autoSpinTimer) {
      this.autoSpinTimer.destroy();
    }

    // Snap to exact position
    const targetIndex = this.findCardIndexForMap(mapId);
    this.currentIndex = targetIndex;
    this.positionCards();

    // Update UI
    const selectedCard = this.cards[targetIndex];
    if (selectedCard) {
      this.mapNameText.setText(selectedCard.mapName);
      this.subtitleText.setText("Arena selected!");
      this.subtitleText.setColor("#00ff00");

      // Highlight selected card
      this.tweens.add({
        targets: selectedCard.container,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 300,
        ease: "Back.easeOut",
      });
    }

    logger.game.info("[MapCarousel] Stopped on map:", mapId);

    // Transition to Game scene after delay
    this.time.delayedCall(1500, () => {
      this.transitionToGame();
    });
  }

  private setupEventListeners() {
    // Listen for active game updates
    EventBus.on("active-game-updated", this.onActiveGameUpdated, this);

    // Check periodically for game creation
    this.spinCheckTimer = this.time.addEvent({
      delay: 500,
      callback: this.checkForExistingGame,
      callbackScope: this,
      loop: true,
    });
  }

  private onActiveGameUpdated(gameData: any) {
    logger.game.debug("[MapCarousel] Active game updated:", gameData);

    if (gameData && gameData.status !== undefined) {
      if (gameData.status === GAME_STATUS.WAITING || gameData.status === GAME_STATUS.OPEN) {
        // Game created! Stop on this map
        const mapId = gameData.map?.id || gameData.map || 1;
        this.targetMapId = mapId;
        logger.game.info("[MapCarousel] Game created, targeting map:", mapId);
      }
    }
  }

  private checkForExistingGame() {
    if (this.targetMapId !== null) return; // Already targeting

    if (activeGameData && activeGameData.status !== undefined) {
      if (activeGameData.status === GAME_STATUS.WAITING || activeGameData.status === GAME_STATUS.OPEN) {
        const mapId = typeof activeGameData.map === 'object'
          ? activeGameData.map?.id
          : activeGameData.map || 1;
        this.targetMapId = mapId;
        logger.game.info("[MapCarousel] Found existing game, targeting map:", mapId);
      }
    }
  }

  private transitionToGame() {
    logger.game.info("[MapCarousel] Transitioning to Game scene");

    // Fade out
    this.cameras.main.fadeOut(500, 0, 0, 0);

    this.time.delayedCall(500, () => {
      // Determine mode based on game status
      const mode = activeGameData?.status === GAME_STATUS.OPEN ? "betting" : "insert-coin";
      this.scene.start("Game", { mode });
    });
  }

  shutdown() {
    // Cleanup
    EventBus.off("active-game-updated", this.onActiveGameUpdated, this);

    if (this.spinCheckTimer) {
      this.spinCheckTimer.destroy();
    }
    if (this.autoSpinTimer) {
      this.autoSpinTimer.destroy();
    }

    this.cards = [];
    this.targetMapId = null;
  }
}
