import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import {
  allMapsData,
  activeGameData,
  GAME_STATUS,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  RESOLUTION_SCALE,
} from "../main";
import { logger } from "../../lib/logger";
import { loadBackgroundConfig } from "../config/backgrounds";

/**
 * MapCarousel Scene - 3D Rotating Carousel
 *
 * Shows all available backgrounds spinning in a 3D circular carousel.
 * Cards rotate around a center point with perspective effects:
 * - Front cards appear larger and brighter
 * - Back cards appear smaller and faded
 * - Smooth rotation animation with depth sorting
 *
 * When the backend creates a new game (with mapId), the carousel
 * slows down and stops with the selected map at the front.
 *
 * Flow:
 * 1. Previous game celebration ends
 * 2. MapCarousel starts spinning in 3D circle
 * 3. Backend creates game with mapId
 * 4. Carousel stops on selected map (front position)
 * 5. Transition to Game scene with "insert-coin" mode
 */

interface CarouselCard {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  mapId: number;
  mapName: string;
  angle: number; // Angle in radians for 3D positioning
}

export class MapCarousel extends Scene {
  private cards: CarouselCard[] = [];
  private rotationAngle: number = 0; // Current rotation in radians
  private isSpinning: boolean = false;
  private targetMapId: number | null = null;
  private spinSpeed: number = 0;
  // Card dimensions match stage aspect ratio (396:180 = 2.2:1)
  private cardWidth: number = 220 * RESOLUTION_SCALE;
  private cardHeight: number = 100 * RESOLUTION_SCALE;

  // 3D Carousel parameters
  private radiusX: number = 150 * RESOLUTION_SCALE; // Horizontal radius (ellipse width)
  private radiusY: number = 15 * RESOLUTION_SCALE; // Reduced: less vertical movement (keeps centered)
  private perspectiveScale: number = 0.45; // How much cards shrink in back
  private baseScale: number = 0.85; // Base scale for front card (smaller overall)

  // UI Elements
  private subtitleText!: Phaser.GameObjects.Text;
  private mapNameText!: Phaser.GameObjects.Text;
  private centerHighlight!: Phaser.GameObjects.Rectangle;
  private centerGlow!: Phaser.GameObjects.Rectangle;

  // Timers
  private spinCheckTimer?: Phaser.Time.TimerEvent;
  private autoSpinTimer?: Phaser.Time.TimerEvent;

  // Stopping animation state
  private isDecelerating: boolean = false;
  private decelerationStartTime: number = 0;
  private decelerationDuration: number = 2000; // 2 seconds to stop (smoother for 3D)
  private startAngle: number = 0;
  private targetAngle: number = 0;

  constructor() {
    super("MapCarousel");
  }

  create() {
    logger.game.info("[MapCarousel] Creating 3D carousel scene");

    const centerX = STAGE_WIDTH / 2;
    const centerY = STAGE_HEIGHT / 2;

    // Dark background with gradient effect
    this.add.rectangle(centerX, centerY, STAGE_WIDTH, STAGE_HEIGHT, 0x0a0a0a, 0.95);

    // Add subtle radial gradient overlay for depth
    const gradientOverlay = this.add.graphics();
    gradientOverlay.fillStyle(0x1a1a2e, 0.3);
    gradientOverlay.fillCircle(centerX, centerY + 20 * RESOLUTION_SCALE, 350 * RESOLUTION_SCALE);
    gradientOverlay.setDepth(-1);

    // Subtitle (changes based on state)
    this.subtitleText = this.add
      .text(centerX, 68 * RESOLUTION_SCALE, "Selecting battlefield...", {
        fontFamily: "Jersey15",
        fontSize: `${14 * RESOLUTION_SCALE}px`,
        color: "#ffcc00",
      })
      .setOrigin(0.5);

    // Floor shadow ellipse (gives 3D ground plane effect)
    this.centerGlow = this.add.ellipse(
      centerX,
      centerY + 80 * RESOLUTION_SCALE, // Fixed position below carousel
      this.radiusX * 2,
      40 * RESOLUTION_SCALE,
      0x000000,
      0.3
    ) as unknown as Phaser.GameObjects.Rectangle;
    this.centerGlow.setDepth(-2);

    // Center highlight (will follow front card)
    this.centerHighlight = this.add.rectangle(
      centerX,
      centerY,
      this.cardWidth * this.baseScale + 16 * RESOLUTION_SCALE,
      this.cardHeight * this.baseScale + 16 * RESOLUTION_SCALE
    );
    this.centerHighlight.setStrokeStyle(3 * RESOLUTION_SCALE, 0xffcc00);
    this.centerHighlight.setFillStyle(0xffcc00, 0.1);
    this.centerHighlight.setDepth(200); // Always in front
    this.centerHighlight.setAlpha(0); // Hidden until stopped

    // Create carousel cards from available maps
    this.createCarouselCards(centerX, centerY);

    // Map name display (below carousel)
    this.mapNameText = this.add
      .text(centerX, STAGE_HEIGHT - 25 * RESOLUTION_SCALE, "", {
        fontFamily: "Jersey15",
        fontSize: `${20 * RESOLUTION_SCALE}px`,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2 * RESOLUTION_SCALE,
      })
      .setOrigin(0.5);

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

    logger.game.debug("[MapCarousel] Creating 3D cards for", maps.length, "maps");

    // Calculate angle step between cards (evenly distributed around circle)
    const angleStep = (Math.PI * 2) / maps.length;

    maps.forEach((map: any, index: number) => {
      const angle = index * angleStep;
      const card = this.createCard(map, centerX, centerY, angle);
      this.cards.push(card);
    });

    // Position cards in 3D space
    this.positionCards();
  }

  private createCard(map: any, centerX: number, centerY: number, angle: number): CarouselCard {
    const container = this.add.container(centerX, centerY);

    // Card background (border) with rounded corners effect
    const cardBg = this.add.rectangle(0, 0, this.cardWidth + 8, this.cardHeight + 8, 0x222222);
    cardBg.setStrokeStyle(3 * RESOLUTION_SCALE, 0x444444);
    container.add(cardBg);

    // Inner card frame
    const innerFrame = this.add.rectangle(0, 0, this.cardWidth, this.cardHeight, 0x111111);
    container.add(innerFrame);

    // Load background config
    const bgConfig = loadBackgroundConfig(map.id);
    let bgImage: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

    if (bgConfig && this.textures.exists(bgConfig.textureKey)) {
      if (bgConfig.type === "animated") {
        bgImage = this.add.sprite(0, 0, bgConfig.textureKey);
      } else {
        bgImage = this.add.image(0, 0, bgConfig.textureKey);
      }

      // Scale to fit inside card (contain, not cover)
      const scaleX = (this.cardWidth - 8) / bgImage.width;
      const scaleY = (this.cardHeight - 8) / bgImage.height;
      const scale = Math.min(scaleX, scaleY);
      bgImage.setScale(scale);
    } else {
      // Fallback colored rectangle
      bgImage = this.add.image(0, 0, "__DEFAULT");
      const fallbackRect = this.add.rectangle(0, 0, this.cardWidth, this.cardHeight, 0x1a1a2e);
      container.add(fallbackRect);
    }

    container.add(bgImage);

    // Reflection/shine effect at top of card
    const shine = this.add.rectangle(
      0,
      -this.cardHeight / 2 + 10 * RESOLUTION_SCALE,
      this.cardWidth - 16,
      12 * RESOLUTION_SCALE,
      0xffffff,
      0.08
    );
    container.add(shine);

    // Map name label on card (bottom)
    const labelBg = this.add.rectangle(
      0,
      this.cardHeight / 2 - 12 * RESOLUTION_SCALE,
      this.cardWidth,
      22 * RESOLUTION_SCALE,
      0x000000,
      0.7
    );
    container.add(labelBg);

    const nameLabel = this.add
      .text(0, this.cardHeight / 2 - 12 * RESOLUTION_SCALE, map.name || `Map ${map.id}`, {
        fontFamily: "Jersey15",
        fontSize: `${11 * RESOLUTION_SCALE}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5);
    container.add(nameLabel);

    return {
      container,
      background: bgImage,
      mapId: map.id,
      mapName: map.name || `Map ${map.id}`,
      angle: angle,
    };
  }

  private positionCards() {
    const centerX = STAGE_WIDTH / 2;
    const centerY = STAGE_HEIGHT / 2;

    // Sort cards by depth for proper rendering order
    const cardPositions: {
      card: CarouselCard;
      depth: number;
      x: number;
      y: number;
      scale: number;
      alpha: number;
    }[] = [];

    this.cards.forEach((card) => {
      // Calculate card's current angle (base angle + rotation)
      const currentAngle = card.angle + this.rotationAngle;

      // 3D position calculation
      // sin gives X position (-1 to 1, left to right)
      // cos gives depth (-1 = back, 1 = front)
      const x = centerX + Math.sin(currentAngle) * this.radiusX;
      const depth = Math.cos(currentAngle); // -1 (back) to 1 (front)

      // Y position: slightly lower for cards in back (perspective)
      const y = centerY + (1 - depth) * this.radiusY;

      // Scale: larger in front, smaller in back
      // depth goes from -1 (back) to 1 (front)
      // Scale from (1 - perspectiveScale) to 1, then apply baseScale
      const normalizedDepth = (depth + 1) / 2; // 0 (back) to 1 (front)
      const depthScale = 1 - this.perspectiveScale + normalizedDepth * this.perspectiveScale;
      const scale = depthScale * this.baseScale; // Apply base scale to make everything smaller

      // Alpha: more transparent in back
      const alpha = 0.4 + normalizedDepth * 0.6;

      cardPositions.push({ card, depth, x, y, scale, alpha });
    });

    // Sort by depth (back cards first, so front cards render on top)
    cardPositions.sort((a, b) => a.depth - b.depth);

    // Apply positions and depth ordering
    cardPositions.forEach((pos, index) => {
      pos.card.container.setX(pos.x);
      pos.card.container.setY(pos.y);
      pos.card.container.setScale(pos.scale);
      pos.card.container.setAlpha(pos.alpha);
      pos.card.container.setDepth(index + 1); // Depth order based on sort
    });

    // Update map name text with front card's name
    const frontCard = cardPositions[cardPositions.length - 1];
    if (frontCard && this.isSpinning) {
      this.mapNameText.setText(frontCard.card.mapName);
    }
  }

  private startSpinning() {
    this.isSpinning = true;
    this.spinSpeed = 0.015; // Radians per frame (smooth rotation)

    // Spin animation - use requestAnimationFrame-like timing for smoothness
    this.autoSpinTimer = this.time.addEvent({
      delay: 16, // ~60fps for smooth rotation
      callback: this.updateSpin,
      callbackScope: this,
      loop: true,
    });

    logger.game.debug("[MapCarousel] Started 3D spinning");
  }

  // Quint.easeOut function: 1 - (1 - t)^5
  private quintEaseOut(t: number): number {
    return 1 - Math.pow(1 - t, 5);
  }

  private updateSpin() {
    if (!this.isSpinning) return;

    // Handle deceleration with easing
    if (this.isDecelerating) {
      const elapsed = Date.now() - this.decelerationStartTime;
      const progress = Math.min(elapsed / this.decelerationDuration, 1);
      const easedProgress = this.quintEaseOut(progress);

      // Interpolate from startAngle to targetAngle using eased progress
      this.rotationAngle = this.startAngle + (this.targetAngle - this.startAngle) * easedProgress;

      this.positionCards();

      // Check if deceleration is complete
      if (progress >= 1) {
        this.stopOnMap(this.targetMapId!);
      }
      return;
    }

    // Normal spinning (rotate in one direction)
    this.rotationAngle += this.spinSpeed;

    // Keep angle within 0 to 2*PI range
    if (this.rotationAngle >= Math.PI * 2) {
      this.rotationAngle -= Math.PI * 2;
    }

    // If we have a target, start deceleration
    if (this.targetMapId !== null && !this.isDecelerating) {
      this.startDeceleration();
      return;
    }

    this.positionCards();
  }

  private startDeceleration() {
    this.isDecelerating = true;
    this.decelerationStartTime = Date.now();
    this.startAngle = this.rotationAngle;

    // Find the target angle to bring the selected map to the front (angle = 0)
    const targetCard = this.cards.find((c) => c.mapId === this.targetMapId);
    if (!targetCard) {
      logger.game.warn("[MapCarousel] Target map not found:", this.targetMapId);
      this.targetAngle = this.startAngle;
      return;
    }

    // Calculate angle needed to bring target card to front (cos = 1, so card.angle + rotation = 0)
    // We want: targetCard.angle + targetAngle ≡ 0 (mod 2π)
    // So: targetAngle = -targetCard.angle
    let rawTargetAngle = -targetCard.angle;

    // Normalize to 0 to 2π
    while (rawTargetAngle < 0) rawTargetAngle += Math.PI * 2;
    while (rawTargetAngle >= Math.PI * 2) rawTargetAngle -= Math.PI * 2;

    // Ensure we spin forward at least one full rotation for dramatic effect
    const minRotation = Math.PI * 2; // At least one full spin
    let angleDiff = rawTargetAngle - this.startAngle;

    // Always spin forward (positive direction)
    if (angleDiff <= 0) {
      angleDiff += Math.PI * 2;
    }

    // Add minimum rotation
    this.targetAngle = this.startAngle + angleDiff + minRotation;

    logger.game.info("[MapCarousel] Starting 3D deceleration", {
      fromAngle: this.startAngle.toFixed(2),
      toAngle: this.targetAngle.toFixed(2),
      targetMapId: this.targetMapId,
      duration: this.decelerationDuration,
    });
  }

  private findCardByMapId(mapId: number): CarouselCard | undefined {
    return this.cards.find((c) => c.mapId === mapId);
  }

  private stopOnMap(mapId: number) {
    this.isSpinning = false;
    this.isDecelerating = false;
    this.spinSpeed = 0;

    if (this.autoSpinTimer) {
      this.autoSpinTimer.destroy();
    }

    // Snap rotation to exact target angle
    this.rotationAngle = this.targetAngle;
    this.positionCards();

    // Find the selected card
    const selectedCard = this.findCardByMapId(mapId);
    if (selectedCard) {
      this.mapNameText.setText(selectedCard.mapName);
      this.subtitleText.setText("Arena selected!");
      this.subtitleText.setColor("#00ff00");

      // Position highlight on the front card
      const centerX = STAGE_WIDTH / 2;
      const centerY = STAGE_HEIGHT / 2;
      this.centerHighlight.setPosition(centerX, centerY);
      this.centerHighlight.setStrokeStyle(4 * RESOLUTION_SCALE, 0x00ff00);
      this.centerHighlight.setFillStyle(0x00ff00, 0.15);

      // Fade in and scale the highlight
      this.tweens.add({
        targets: this.centerHighlight,
        alpha: 1,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 400,
        ease: "Quint.easeOut",
      });

      // Pulse animation on the selected card
      this.tweens.add({
        targets: selectedCard.container,
        scaleX: selectedCard.container.scaleX * 1.1,
        scaleY: selectedCard.container.scaleY * 1.1,
        duration: 300,
        ease: "Quint.easeOut",
        yoyo: true,
        repeat: 1,
      });

      // Add glow effect to floor shadow
      this.tweens.add({
        targets: this.centerGlow,
        alpha: 0.6,
        duration: 400,
        ease: "Quint.easeOut",
      });

      // Fade out back cards for focus effect
      this.cards.forEach((card) => {
        if (card.mapId !== mapId) {
          this.tweens.add({
            targets: card.container,
            alpha: 0.2,
            duration: 400,
            ease: "Quint.easeOut",
          });
        }
      });
    }

    logger.game.info("[MapCarousel] Stopped on map:", mapId);

    // Transition to Game scene after delay (2s extra to appreciate the selection)
    this.time.delayedCall(3500, () => {
      this.transitionToGame();
    });
  }

  private setupEventListeners() {
    // Listen for blockchain state updates (new game created)
    EventBus.on("blockchain-state-update", this.onBlockchainUpdate, this);

    // Also check periodically as backup
    this.spinCheckTimer = this.time.addEvent({
      delay: 500,
      callback: this.checkForExistingGame,
      callbackScope: this,
      loop: true,
    });
  }

  private onBlockchainUpdate(gameData: any) {
    if (this.targetMapId !== null) return; // Already targeting a map
    if (!this.isSpinning) return; // Not spinning anymore

    logger.game.debug("[MapCarousel] Blockchain update received:", gameData?.status);

    if (gameData && gameData.status !== undefined) {
      // WAITING (0) or OPEN (1) means a game exists
      if (gameData.status === GAME_STATUS.WAITING || gameData.status === GAME_STATUS.OPEN) {
        // Game created! Trigger the dramatic spin & land
        const mapId = typeof gameData.map === "object" ? gameData.map?.id : gameData.map || 1;
        this.targetMapId = mapId;
        logger.game.info("[MapCarousel] 🎰 New game detected! Spinning to map:", mapId);
      }
    }
  }

  private checkForExistingGame() {
    if (this.targetMapId !== null) return; // Already targeting
    if (!this.isSpinning) return; // Not spinning

    if (activeGameData && activeGameData.status !== undefined) {
      if (
        activeGameData.status === GAME_STATUS.WAITING ||
        activeGameData.status === GAME_STATUS.OPEN
      ) {
        const mapId =
          typeof activeGameData.map === "object" ? activeGameData.map?.id : activeGameData.map || 1;
        this.targetMapId = mapId;
        logger.game.info("[MapCarousel] 🎰 Found existing game, spinning to map:", mapId);
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
    EventBus.off("blockchain-state-update", this.onBlockchainUpdate, this);

    if (this.spinCheckTimer) {
      this.spinCheckTimer.destroy();
    }
    if (this.autoSpinTimer) {
      this.autoSpinTimer.destroy();
    }

    this.cards = [];
    this.targetMapId = null;
    this.isDecelerating = false;
    this.rotationAngle = 0;
  }
}
