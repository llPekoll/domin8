import { Scene } from "phaser";
import { SoundManager } from "./SoundManager";
import { logger } from "../../lib/logger";
import { STAGE_WIDTH, STAGE_HEIGHT, RESOLUTION_SCALE } from "../main";

export class AnimationManager {
  private scene: Scene;
  private centerX: number;
  private centerY: number;

  // Physics configuration for explosion - TWEAK THESE VALUES
  // Base values are for RESOLUTION_SCALE = 1, automatically scaled
  private readonly EXPLOSION_CONFIG = {
    forceMin: 150 * RESOLUTION_SCALE, // Minimum outward force
    forceMax: 250 * RESOLUTION_SCALE, // Maximum outward force
    upwardKickMin: 150 * RESOLUTION_SCALE, // Minimum upward boost
    upwardKickMax: 300 * RESOLUTION_SCALE, // Maximum upward boost
    upwardKickChance: 0.8, // Chance to apply upward kick (no scaling needed)
    gravity: 200 * RESOLUTION_SCALE, // Gravity force (increased from 150 to match higher forces)
    rotationSpeed: 10, // Max rotation speed (no scaling needed)
    fadeStartTime: 1.5, // When to start fading (no scaling needed)
    fadeRate: 0.3, // How fast to fade (no scaling needed)
    maxLifetime: 5, // Maximum lifetime (no scaling needed)
    showDebugTrails: true, // Set to true to see red trail lines
  };

  constructor(scene: Scene, centerX: number, centerY: number) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  // Store celebration objects for cleanup
  private celebrationObjects: Phaser.GameObjects.GameObject[] = [];

  /**
   * Fade out celebration visuals (throne, overlay, confetti) before destroying
   */
  fadeOutCelebration(duration: number = 1000) {
    logger.game.debug(
      "[AnimationManager] Fading out celebration objects:",
      this.celebrationObjects.length
    );

    this.celebrationObjects.forEach((obj) => {
      if (obj && obj.active) {
        // Fade out with tween
        this.scene.tweens.add({
          targets: obj,
          alpha: 0,
          duration: duration,
          ease: "Power2",
          onComplete: () => {
            if (obj && obj.active) {
              obj.destroy();
            }
          },
        });
      }
    });

    // Clear array after initiating fades
    this.celebrationObjects = [];
  }

  /**
   * Clear celebration immediately (legacy method, use fadeOutCelebration for smooth transitions)
   */
  clearCelebration() {
    logger.game.debug(
      "[AnimationManager] Clearing celebration objects:",
      this.celebrationObjects.length
    );
    this.celebrationObjects.forEach((obj) => {
      if (obj && obj.active) {
        obj.destroy();
      }
    });
    this.celebrationObjects = [];
  }

  addWinnerCelebration() {
    // Play victory sound when winner celebration starts
    SoundManager.playVictory(this.scene, 0.6);

    // Create dark background overlay for focus
    const backgroundOverlay = this.scene.add.rectangle(
      this.centerX,
      this.centerY,
      this.scene.scale.width,
      this.scene.scale.height,
      0x000000
    );
    backgroundOverlay.setDepth(85); // Behind throne (throne is at 90)
    backgroundOverlay.setAlpha(0);

    // Fade in the overlay
    this.scene.tweens.add({
      targets: backgroundOverlay,
      alpha: 0.7,
      duration: 800,
      ease: "Power2",
    });

    const throne = this.scene.add.image(this.centerX, this.centerY + 50, "throne");
    throne.setDepth(90); // Behind winner (winner is at ~100+)
    throne.setScale(RESOLUTION_SCALE);
    throne.setAlpha(0);
    // Keep pixel art crisp when scaling
    throne.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.scene.tweens.add({
      targets: throne,
      alpha: 1,
      duration: 800,
      ease: "Power2",
    });

    // Track celebration objects for cleanup (throne and overlay)
    this.celebrationObjects.push(backgroundOverlay, throne);

    // Bounce animation is now handled in PlayerManager.showResults()

    // Add confetti particles
    this.createConfetti();
  }

  createConfetti() {
    // Create confetti particle effect
    const colors = [0xffd700, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0xffff00];

    // Use scale manager for actual scene dimensions (respects RESIZE mode)
    const sceneWidth = this.scene.scale.width;
    const sceneHeight = this.scene.scale.height;

    // Increase particle count for more dramatic full-screen effect
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * sceneWidth;
      const startY = -50;
      const color = colors[Math.floor(Math.random() * colors.length)];

      const confetti = this.scene.add.rectangle(x, startY, 8, 12, color);
      confetti.setDepth(250);

      // Track confetti for cleanup
      this.celebrationObjects.push(confetti);

      // Animate confetti falling
      this.scene.tweens.add({
        targets: confetti,
        y: sceneHeight + 50,
        x: x + (Math.random() - 0.5) * 300, // More horizontal drift
        angle: Math.random() * 720,
        duration: 2000 + Math.random() * 2000,
        ease: "Linear",
        delay: Math.random() * 1000,
        onComplete: () => {
          confetti.destroy();
        },
      });
    }
  }

  createCenterExplosion() {
    // Add directional blood effects from center
    this.createDirectionalBloodEffects();

    // Screen shake for impact
    this.scene.cameras.main.shake(300, 0.02);
  }

  createDirectionalBloodEffects() {
    // Blood shooting from left
    this.scene.time.delayedCall(100, () => {
      const bloodLeft = this.scene.add.sprite(this.centerX - 50, this.centerY, "blood");
      bloodLeft.setScale(2);
      bloodLeft.setDepth(140);
      bloodLeft.setFlipX(false);
      bloodLeft.setAlpha(1);
      // Keep pixel art crisp when scaling
      bloodLeft.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      logger.game.debug(
        "Looking for blood-from-left6-big:",
        this.scene.anims.exists("blood-from-left6-big")
      );
      if (this.scene.anims.exists("blood-from-left6-big")) {
        bloodLeft.play("blood-from-left6-big");
        logger.game.debug("Playing blood-from-left6-big animation");
      } else {
        logger.game.debug("Animation not found, showing static sprite");
        bloodLeft.setFrame("blood_spritesheet 70.ase"); // Show a static frame
      }
      bloodLeft.once("animationcomplete", () => {
        this.scene.tweens.add({
          targets: bloodLeft,
          alpha: 0,
          duration: 1500,
          onComplete: () => bloodLeft.destroy(),
        });
      });
    });

    // Blood shooting from right (mirrored)
    this.scene.time.delayedCall(150, () => {
      const bloodRight = this.scene.add.sprite(this.centerX + 50, this.centerY, "blood");
      bloodRight.setScale(2);
      bloodRight.setDepth(140);
      bloodRight.setFlipX(true); // Mirror horizontally
      bloodRight.setAlpha(1);
      // Keep pixel art crisp when scaling
      bloodRight.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (this.scene.anims.exists("blood-from-left6-big")) {
        bloodRight.play("blood-from-left6-big");
      }
      bloodRight.once("animationcomplete", () => {
        this.scene.tweens.add({
          targets: bloodRight,
          alpha: 0,
          duration: 1500,
          onComplete: () => bloodRight.destroy(),
        });
      });
    });

    // Ground blood in center
    this.scene.time.delayedCall(200, () => {
      const bloodGround = this.scene.add.sprite(this.centerX, this.centerY + 30, "blood");
      bloodGround.setScale(2.5);
      bloodGround.setDepth(110);
      bloodGround.setAlpha(1);
      // Keep pixel art crisp when scaling
      bloodGround.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (this.scene.anims.exists("blood-ground-middle")) {
        bloodGround.play("blood-ground-middle");
      }
      bloodGround.once("animationcomplete", () => {
        this.scene.tweens.add({
          targets: bloodGround,
          alpha: 0,
          duration: 2000,
          onComplete: () => bloodGround.destroy(),
        });
      });
    });
  }

  explodeParticipantsOutward(
    participants: Map<string, any>,
    explosionCenterX?: number,
    explosionCenterY?: number,
    staggered: boolean = false
  ) {
    const config = this.EXPLOSION_CONFIG;

    // Use provided explosion center or fall back to screen center
    const centerX = explosionCenterX ?? this.centerX;
    const centerY = explosionCenterY ?? this.centerY;

    // Log elimination status for debugging
    const allParticipants = Array.from(participants.values());
    logger.game.debug("[AnimationManager] 💥 explodeParticipantsOutward called", {
      totalParticipants: allParticipants.length,
      eliminatedCount: allParticipants.filter((p) => p.eliminated).length,
      winnerCount: allParticipants.filter((p) => !p.eliminated).length,
      participants: allParticipants.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        eliminated: p.eliminated,
      })),
    });

    // Create explosion at center first
    this.createCenterExplosion();

    // Add full-screen blood effect when characters are eliminated
    const eliminatedParticipants = Array.from(participants.values()).filter((p) => p.eliminated);
    const eliminatedCount = eliminatedParticipants.length;
    if (eliminatedCount > 0) {
      this.createBloodSplatter(centerX, centerY, true);

      // Play death screams for each eliminated character (with slight delays for variety)
      let screamDelay = 0;
      eliminatedParticipants.forEach((_p) => {
        const delay = staggered ? Math.random() * 1000 : screamDelay;
        this.scene.time.delayedCall(delay, () => {
          SoundManager.playRandomDeathScream(this.scene, 0.5);
        });
        screamDelay += 100; // Stagger screams by 100ms (used when not staggered)
      });
    }

    // Apply physics to eliminated participants (with optional staggered timing)
    participants.forEach((participant) => {
      if (!participant.container || !participant.container.active) return;

      if (participant.nameText) {
        participant.nameText.setVisible(false);
      }
      // Only explode eliminated participants, leave the winner alone
      if (!participant.eliminated) return;

      // Calculate stagger delay: random delay between 0-1000ms for gradual kick-out
      const staggerDelay = staggered ? Math.random() * 1000 : 0;

      // Wrap physics setup in delayed call for staggered effect
      const applyKickOutPhysics = () => {
        // Guard against destroyed containers during delay
        if (!participant.container || !participant.container.active) return;

        // Kill any active tweens on the container that might interfere with kick-out physics
        // (e.g., moveToCenter tweens from battle phase start)
        this.scene.tweens.killTweensOf(participant.container);

        // Change sprite anchor to center for better rotation physics
        // Store the current Y position before changing origin
        const currentY = participant.sprite.y;
        participant.sprite.setOrigin(0.5, 0.5); // Center origin for rotation
        // Adjust Y position to compensate for origin change (half sprite height)
        const spriteHeight = 32 * participant.sprite.scaleY;
        participant.sprite.setY(currentY - spriteHeight / 2);

        // Fountain effect: shoot upward first, then arc down
        // Strong upward velocity with random horizontal spread for the curl
        const upwardForce =
          config.upwardKickMin + Math.random() * (config.upwardKickMax - config.upwardKickMin);
        const horizontalSpread = (Math.random() - 0.5) * config.forceMax * 0.8; // Random left/right spread

        // Initial velocity: strong upward, random horizontal
        const velocityX = horizontalSpread;
        const velocityY = -upwardForce; // Negative = upward in screen coords

        // No additional upward kick needed since we're already going up
        const upwardKick = 0;

        // Random rotation speed
        const rotationSpeed = (Math.random() - 0.5) * config.rotationSpeed * 2;

        // Store initial values for physics simulation
        const currentVelocityX = velocityX;
        let currentVelocityY = velocityY + upwardKick;
        let elapsedTime = 0;

        // Add debug trail only if enabled
        let debugTrail: Phaser.GameObjects.Graphics | null = null;
        if (config.showDebugTrails) {
          debugTrail = this.scene.add.graphics();
          debugTrail.lineStyle(2, 0xff0000, 0.5);
          debugTrail.moveTo(participant.container.x, participant.container.y);
          debugTrail.setDepth(50);
        }

        // Create physics update loop
        const physicsUpdate = this.scene.time.addEvent({
          delay: 16, // ~60fps
          repeat: -1,
          callback: () => {
            if (!participant.container || !participant.container.active) {
              physicsUpdate.remove();
              if (debugTrail) debugTrail.destroy();
              return;
            }

            const deltaTime = 0.016; // 16ms in seconds
            elapsedTime += deltaTime;

            // Apply gravity to Y velocity
            currentVelocityY += config.gravity * deltaTime;

            // Update position
            participant.container.x += currentVelocityX * deltaTime;
            participant.container.y += currentVelocityY * deltaTime;

            // Draw debug trail if enabled
            if (debugTrail) {
              debugTrail.lineTo(participant.container.x, participant.container.y);
            }

            // Apply rotation to sprite only, not the container
            if (participant.sprite) {
              participant.sprite.angle += rotationSpeed;
            }

            // Keep full opacity - no fading
            // participant.container.alpha stays at 1

            // Remove when off screen or after max lifetime
            const gameWidth = this.scene.scale.width;
            const gameHeight = this.scene.scale.height;

            const isOffScreen =
              participant.container.x < -100 ||
              participant.container.x > gameWidth + 100 ||
              participant.container.y > gameHeight + 100 ||
              elapsedTime > config.maxLifetime;

            if (isOffScreen) {
              physicsUpdate.remove();
              participant.container.setVisible(false);
              participant.container.setActive(false);

              // Fade out debug trail if it exists
              if (debugTrail) {
                this.scene.tweens.add({
                  targets: debugTrail,
                  alpha: 0,
                  duration: 1000,
                  onComplete: () => debugTrail.destroy(),
                });
              }
            }
          },
        });

        // Add some visual effects during explosion
        this.scene.tweens.add({
          targets: participant.sprite,
          scaleX: participant.sprite.scaleX * 1.2,
          scaleY: participant.sprite.scaleY * 1.2,
          duration: 200,
          ease: "Power2",
        });

        // Check if participant hits screen edge and create full-screen blood
        this.checkScreenEdgeCollision(participant);
      }; // End of applyKickOutPhysics function

      // Apply the kick-out physics with stagger delay
      if (staggerDelay > 0) {
        this.scene.time.delayedCall(staggerDelay, applyKickOutPhysics);
      } else {
        applyKickOutPhysics();
      }
    });
  }

  checkScreenEdgeCollision(participant: any) {
    // Get screen dimensions
    const screenWidth = this.scene.scale.width;
    const screenHeight = this.scene.scale.height;

    // Monitor participant position over time
    const checkCollision = () => {
      if (!participant.container || !participant.container.active) return;

      const x = participant.container.x;
      const y = participant.container.y;
      const margin = 50; // Distance from edge to trigger effect

      // Check if participant is near or past screen edges
      if (x <= margin || x >= screenWidth - margin || y <= margin || y >= screenHeight - margin) {
        // Create full-screen blood effect
        this.createFullScreenBloodSplash(x, y);

        // Stop monitoring this participant
        return;
      }

      // Continue checking
      this.scene.time.delayedCall(100, checkCollision);
    };

    // Start monitoring with a delay
    this.scene.time.delayedCall(500, checkCollision);
  }

  createFullScreenBloodSplash(impactX: number, impactY: number) {
    // Play a death scream when character hits screen edge
    SoundManager.playRandomDeathScream(this.scene, 0.6);

    // Create multiple blood animations across the screen
    const bloodTypes = [
      "blood-from-left6-big",
      "blood-from-left7",
      "blood-from-left5",
      "blood-ground-middle2",
    ];

    // Create blood splatters from impact point
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 50, () => {
        const bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];

        // Position blood near impact area
        const offsetX = (Math.random() - 0.5) * 200;
        const offsetY = (Math.random() - 0.5) * 200;

        const bloodSprite = this.scene.add.sprite(impactX + offsetX, impactY + offsetY, "blood");

        bloodSprite.setScale(1 + Math.random() * 2);
        bloodSprite.setDepth(350); // Above everything
        bloodSprite.setAlpha(0.9);
        bloodSprite.setRotation(Math.random() * Math.PI * 2);
        // Keep pixel art crisp when scaling
        bloodSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        // Random flip for variety
        if (Math.random() > 0.5) {
          bloodSprite.setFlipX(true);
        }

        if (this.scene.anims.exists(bloodType)) {
          bloodSprite.play(bloodType);
        }

        bloodSprite.once("animationcomplete", () => {
          // Fade out slowly
          this.scene.tweens.add({
            targets: bloodSprite,
            alpha: 0,
            duration: 2500,
            onComplete: () => bloodSprite.destroy(),
          });
        });
      });
    }

    // Add screen flash effect
    const flash = this.scene.add.rectangle(
      this.centerX,
      this.centerY,
      this.scene.scale.width,
      this.scene.scale.height,
      0x8b0000 // Dark red
    );
    flash.setDepth(340);
    flash.setAlpha(0);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      onComplete: () => flash.destroy(),
    });

    // Enhanced screen shake for impact
    this.scene.cameras.main.shake(600, 0.025);
  }

  createBloodSplatter(x: number, y: number, fullScreen: boolean = false) {
    // Available blood animations
    const bloodTypes = [
      "blood-ground-middle",
      "blood-from-left",
      "blood-from-left2",
      "blood-from-left3",
      "blood-from-left4",
      "blood-from-left5",
      "blood-from-left6-big",
      "blood-ground-middle2",
      "blood-from-left7",
    ];

    if (fullScreen) {
      // Create multiple blood effects across the screen
      const bloodCount = 3 + Math.floor(Math.random() * 3);

      for (let i = 0; i < bloodCount; i++) {
        this.scene.time.delayedCall(i * 100, () => {
          const bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];
          const bloodSprite = this.scene.add.sprite(
            this.centerX + (Math.random() - 0.5) * 400,
            this.centerY + (Math.random() - 0.5) * 300,
            "blood"
          );

          bloodSprite.setScale(1 + Math.random() * 2);
          bloodSprite.setDepth(1500); // In front of all characters
          bloodSprite.setAlpha(0.8);
          bloodSprite.setRotation(Math.random() * Math.PI * 2);
          // Keep pixel art crisp when scaling
          bloodSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

          if (this.scene.anims.exists(bloodType)) {
            bloodSprite.play(bloodType);
          }

          bloodSprite.once("animationcomplete", () => {
            // Fade out slowly
            this.scene.tweens.add({
              targets: bloodSprite,
              alpha: 0,
              duration: 2000,
              onComplete: () => bloodSprite.destroy(),
            });
          });
        });
      }
    } else {
      // Local blood splatter during fights
      const bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];
      const bloodSprite = this.scene.add.sprite(
        x + (Math.random() - 0.5) * 100,
        y + (Math.random() - 0.5) * 100,
        "blood"
      );

      bloodSprite.setScale(0.8 + Math.random() * 1.2);
      bloodSprite.setDepth(1500); // In front of all characters
      bloodSprite.setAlpha(0.9);
      bloodSprite.setRotation(Math.random() * Math.PI * 2);
      // Keep pixel art crisp when scaling
      bloodSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

      if (this.scene.anims.exists(bloodType)) {
        bloodSprite.play(bloodType);
      }

      bloodSprite.once("animationcomplete", () => {
        // Fade out
        this.scene.tweens.add({
          targets: bloodSprite,
          alpha: 0,
          duration: 1500,
          onComplete: () => bloodSprite.destroy(),
        });
      });
    }
  }

  /**
   * Move all participants towards the center with running animation
   * @param participants - Map of participants from PlayerManager
   * @param mapConfig - Optional map spawn configuration for center position
   */
  moveParticipantsToCenter(participants: Map<string, any>, mapConfig?: any) {
    // Use map-specific spawn center, or fall back to screen center
    const targetCenterX = mapConfig ? mapConfig.centerX * RESOLUTION_SCALE : this.centerX;
    const targetCenterY = mapConfig ? mapConfig.centerY * RESOLUTION_SCALE : this.centerY;

    participants.forEach((participant) => {
      // Show names when moving to center
      participant.nameText.setVisible(true);

      // Animate container moving towards map center (sprite and text move together)
      this.scene.tweens.add({
        targets: participant.container,
        x: targetCenterX + (Math.random() - 0.5) * 5,
        y: targetCenterY + 30 + (Math.random() - 0.5) * 100,
        duration: 400 + Math.random() * 200,
        ease: "Cubic.easeIn",
      });

      // Change to running animation
      const runAnimKey = `${participant.characterKey}-run`;
      if (this.scene.anims.exists(runAnimKey)) {
        participant.sprite.play(runAnimKey);
      }
    });
  }

  /**
   * Shared battle phase animation sequence
   * Moves participants to center, starts explosions after delay
   * @param playerManager - PlayerManager instance to move participants
   * @param onComplete - Callback when sequence completes
   */
  startBattlePhaseSequence(playerManager: any, onComplete?: () => void) {
    logger.game.debug("[AnimationManager] ⚔️ Starting battle phase sequence");

    // Guard against destroyed scene
    if (!this.scene || !this.scene.add) {
      logger.game.warn("[AnimationManager] Scene destroyed, skipping battle phase sequence");
      return;
    }

    // Play fullscreen explosion animation at the start
    // Use native resolution center (game now renders at 396x180 and scales via Phaser.Scale.FIT)
    const fullscreenExplosion = this.scene.add.sprite(
      STAGE_WIDTH / 2,
      STAGE_HEIGHT / 2,
      "explosion-fullscreen"
    );

    // No manual scaling needed - Phaser.Scale.FIT handles it automatically
    fullscreenExplosion.setScale(RESOLUTION_SCALE);
    fullscreenExplosion.setDepth(1550); // Between characters and continuous explosions
    // Keep pixel art crisp when scaling
    fullscreenExplosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    if (this.scene.anims.exists("explosion-fullscreen")) {
      this.scene.time.delayedCall(200, () => {
        fullscreenExplosion.play("explosion-fullscreen");
        SoundManager.playExplosion(this.scene, 0.8);
      });
    }

    fullscreenExplosion.once("animationcomplete", () => {
      fullscreenExplosion.destroy();
    });

    // Screen shake for dramatic impact
    this.scene.cameras.main.shake(400, 0.015);

    // Move participants to center
    const participants = playerManager.getParticipants();
    const mapConfig = playerManager.getMapData()?.spawnConfiguration;
    this.moveParticipantsToCenter(participants, mapConfig);

    // Call onComplete callback if provided
    if (onComplete) {
      onComplete();
    }
  }

  /**
   * Shared results phase animation sequence
   * Marks eliminated participants, explodes losers, shows winner celebration
   * @param playerManager - PlayerManager instance
   * @param winner - Winner participant data
   * @param onComplete - Callback when sequence completes (after celebration delay)
   */
  startResultsPhaseSequence(playerManager: any, winner: any, onComplete?: () => void) {
    logger.game.debug("[AnimationManager] 🏆 Starting results phase sequence for winner:", winner);

    // Note: Kick-out now happens 1 second into battle phase (in Game.ts)
    // This function now only handles the winner celebration

    // After 2 seconds: Show winner celebration (kick-out already started 1s earlier)
    this.scene.time.delayedCall(2000, () => {
      logger.game.debug("[AnimationManager] 🎉 Starting winner celebration");

      const participants = playerManager.getParticipants();
      const gameState = {
        status: "results",
        winnerId: winner._id || winner.id,
        participants: Array.from(participants.values()),
        isDemo: true,
      };

      // Show winner with PlayerManager (scales up, golden tint, etc.)
      const winnerParticipant = playerManager.showResults(gameState);

      // Add celebration animations (confetti, text, bounce)
      if (winnerParticipant) {
        this.addWinnerCelebration();
      }
      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    });
  }
}
