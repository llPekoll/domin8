import { Scene } from "phaser";
import { SoundManager } from "./SoundManager";
import { logger } from "../../lib/logger";
import { STAGE_WIDTH, STAGE_HEIGHT } from "../main";

export class AnimationManager {
  private scene: Scene;
  private centerX: number;
  private centerY: number;

  // Physics configuration for explosion - TWEAK THESE VALUES
  private readonly EXPLOSION_CONFIG = {
    forceMin: 150, // Minimum outward force (increased for more sideways)
    forceMax: 250, // Maximum outward force (increased for more sideways)
    upwardKickMin: 200, // Minimum upward boost (increased for more height)
    upwardKickMax: 400, // Maximum upward boost (increased for more height)
    upwardKickChance: 0.8, // Chance to apply upward kick (increased to 80%)
    gravity: 150, // Gravity force (higher = falls faster)
    rotationSpeed: 10, // Max rotation speed
    fadeStartTime: 1.5, // When to start fading (seconds)
    fadeRate: 0.3, // How fast to fade (0-1 per second)
    maxLifetime: 5, // Maximum lifetime (seconds)
    showDebugTrails: true, // Set to true to see red trail lines
  };

  constructor(scene: Scene, centerX: number, centerY: number) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  updateCenter(centerX: number, centerY: number) {
    this.centerX = centerX;
    this.centerY = centerY;
  }

  // Store celebration objects for cleanup
  private celebrationObjects: Phaser.GameObjects.GameObject[] = [];

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

  createExplosionsSequence() {
    const createExplosion = (delay: number = 0) => {
      this.scene.time.delayedCall(delay, () => {
        // Random position around center
        const offsetX = (Math.random() - 0.5) * 150;
        const offsetY = (Math.random() - 0.5) * 150;

        const explosion = this.scene.add.sprite(
          this.centerX + offsetX,
          this.centerY + offsetY,
          "explosion"
        );

        // Scale up the explosion for dramatic effect
        explosion.setScale(2 + Math.random());
        explosion.setDepth(500); // On top of everything
        // Keep pixel art crisp when scaling
        explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        // Play explosion animation
        if (this.scene.anims.exists("explosion")) {
          explosion.play("explosion");
        }

        // Remove sprite after animation completes
        explosion.once("animationcomplete", () => {
          explosion.destroy();
        });

        // Screen shake for impact
        if (delay === 0) {
          this.scene.cameras.main.shake(200, 0.01);
        }
      });
    };

    // Create multiple explosions over time
    createExplosion(0);
    createExplosion(300);
    createExplosion(600);
    createExplosion(900);
    createExplosion(1200);
  }

  addWinnerCelebration(winner: any) {
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

    const throne = this.scene.add.image(this.centerX, this.centerY, "throne");
    throne.setDepth(90); // Behind winner (winner is at ~100+)
    throne.setScale(2);
    throne.setAlpha(0);
    // Keep pixel art crisp when scaling
    throne.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.scene.tweens.add({
      targets: throne,
      alpha: 1,
      duration: 800,
      ease: "Power2",
    });

    // Apply pixelated rendering - render at lower resolution for crisp pixel art look

    // Get screen height for positioning at bottom
    const screenHeight = this.scene.scale.height;

    // Winner name at bottom of screen
    const nameText = this.scene.add
      .text(this.centerX, screenHeight - 80, winner.displayName, {
        fontFamily: "Arial Black",
        fontSize: 32,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(200);

    // Track all celebration objects for cleanup
    this.celebrationObjects.push(backgroundOverlay, throne, nameText);

    // Animate name and bet text
    nameText.setAlpha(0);

    this.scene.tweens.add({
      targets: nameText,
      alpha: 1,
      duration: 500,
      delay: 300,
    });

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
    // Create a single large explosion at center
    const explosion = this.scene.add.sprite(this.centerX, this.centerY, "explosion");

    explosion.setScale(15); // 5x bigger (was 3, now 15)
    explosion.setDepth(500); // On top of everything
    // Keep pixel art crisp when scaling
    explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    if (this.scene.anims.exists("explosion")) {
      explosion.play("explosion");
    }

    explosion.once("animationcomplete", () => {
      explosion.destroy();
    });

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

  explodeParticipantsOutward(participants: Map<string, any>) {
    const config = this.EXPLOSION_CONFIG;

    // Create explosion at center first
    this.createCenterExplosion();

    // Add full-screen blood effect when characters are eliminated
    const eliminatedCount = Array.from(participants.values()).filter((p) => p.eliminated).length;
    if (eliminatedCount > 0) {
      this.createBloodSplatter(this.centerX, this.centerY, true);

      // Play death screams for each eliminated character (with slight delays for variety)
      let screamDelay = 0;
      Array.from(participants.values()).forEach((p) => {
        if (p.eliminated) {
          this.scene.time.delayedCall(screamDelay, () => {
            SoundManager.playRandomDeathScream(this.scene, 0.5);
          });
          screamDelay += 100; // Stagger screams by 100ms
        }
      });
    }

    // Apply physics only to eliminated participants
    participants.forEach((participant) => {
      if (!participant.container || !participant.container.active) return;

      if (participant.nameText) {
        participant.nameText.setVisible(false);
      }
      // Only explode eliminated participants, leave the winner alone
      if (!participant.eliminated) return;

      // Change sprite anchor to center for better rotation physics
      // Store the current Y position before changing origin
      const currentY = participant.sprite.y;
      participant.sprite.setOrigin(0.5, 0.5); // Center origin for rotation
      // Adjust Y position to compensate for origin change (half sprite height)
      const spriteHeight = 32 * participant.sprite.scaleY;
      participant.sprite.setY(currentY - spriteHeight / 2);

      // Calculate angle from center to participant
      const dx = participant.container.x - this.centerX;
      const dy = participant.container.y - this.centerY;
      const angle = Math.atan2(dy, dx);

      // Random force using config values
      const forceMultiplier = config.forceMin + Math.random() * (config.forceMax - config.forceMin);

      // Initial velocity components
      const velocityX = Math.cos(angle) * forceMultiplier;
      const velocityY = Math.sin(angle) * forceMultiplier;

      // Add random upward kick for some particles (like they got punched up)
      const upwardKick =
        Math.random() > config.upwardKickChance
          ? 0
          : -(config.upwardKickMin + Math.random() * (config.upwardKickMax - config.upwardKickMin));

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
    });

    // Add extra particle effects
    this.createExplosionParticles();
  }

  private createExplosionParticles() {
    // Create debris particles that fly out
    const particleCount = 20;
    const colors = [0xff0000, 0xffff00, 0xff8800, 0xffffff];

    for (let i = 0; i < particleCount; i++) {
      const particle = this.scene.add.rectangle(
        this.centerX,
        this.centerY,
        4 + Math.random() * 8,
        4 + Math.random() * 8,
        colors[Math.floor(Math.random() * colors.length)]
      );
      particle.setDepth(140);

      const angle = ((Math.PI * 2) / particleCount) * i + Math.random() * 0.5;
      const speed = 200 + Math.random() * 400;
      const lifetime = 1000 + Math.random() * 1000;

      this.scene.tweens.add({
        targets: particle,
        x: this.centerX + Math.cos(angle) * speed,
        y: this.centerY + Math.sin(angle) * speed + Math.random() * 200,
        alpha: 0,
        angle: Math.random() * 720,
        duration: lifetime,
        ease: "Power2",
        onComplete: () => {
          particle.destroy();
        },
      });
    }
  }

  showBettingPrompt() {
    // Show betting phase indicator
    const bettingText = this.scene.add
      .text(this.centerX, 50, "BETTING PHASE", {
        fontFamily: "Arial Black",
        fontSize: 32,
        color: "#00ff00",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(200);

    // Pulse animation
    this.scene.tweens.add({
      targets: bettingText,
      scale: { from: 1, to: 1.2 },
      duration: 800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // Remove after 3 seconds
    this.scene.time.delayedCall(3000, () => {
      bettingText.destroy();
    });
  }

  createBattleEffects() {
    // Create multiple small explosions during battle
    const createBattleExplosion = (delay: number) => {
      this.scene.time.delayedCall(delay, () => {
        const x = this.centerX + (Math.random() - 0.5) * 200;
        const y = this.centerY + (Math.random() - 0.5) * 200;

        const explosion = this.scene.add.sprite(x, y, "explosion");
        explosion.setScale(1.5);
        explosion.setDepth(1500); // In front of all characters (characters are ~100-900)
        // Keep pixel art crisp when scaling
        explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        if (this.scene.anims.exists("explosion")) {
          explosion.play("explosion");
        }

        explosion.once("animationcomplete", () => {
          explosion.destroy();
        });

        // Add blood splatter at fight location
        this.createBloodSplatter(x, y, false);
      });
    };

    // Create battle explosions over time
    for (let i = 0; i < 8; i++) {
      createBattleExplosion(i * 500);
    }

    // Screen shake throughout battle
    this.scene.cameras.main.shake(3000, 0.005);
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

        bloodSprite.setScale(2 + Math.random() * 2);
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

          bloodSprite.setScale(2 + Math.random() * 2);
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

  createFinalExplosion() {
    // Create the biggest explosion for battle finale
    const explosion = this.scene.add.sprite(this.centerX, this.centerY, "explosion");

    explosion.setScale(4);
    explosion.setDepth(500); // On top of everything
    // Keep pixel art crisp when scaling
    explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    if (this.scene.anims.exists("explosion")) {
      explosion.play("explosion");
    }

    explosion.once("animationcomplete", () => {
      explosion.destroy();
    });

    // Biggest screen shake
    this.scene.cameras.main.shake(500, 0.03);
  }

  createContinuousExplosions() {
    // Create multiple explosions continuously on top of everything
    const explosionCount = 5; // Total number of explosions
    const delayBetweenExplosions = 200; // Time between each explosion in ms

    for (let i = 0; i < explosionCount; i++) {
      this.scene.time.delayedCall(i * delayBetweenExplosions, () => {
        // Play explosion sound with the first explosion
        if (i === 0) {
          SoundManager.playExplosion(this.scene, 0.7);
        }

        // Random position across the entire screen
        const gameWidth = this.scene.scale.width;
        const gameHeight = this.scene.scale.height;

        const explosion = this.scene.add.sprite(gameWidth / 2, gameHeight / 2 - 100, "explosion");

        // Random scale for variety (1.5x to 4x)
        explosion.setScale(7 + Math.random() * 2.5);
        explosion.setDepth(1600); // On top of everything else
        // Keep pixel art crisp when scaling
        explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        if (this.scene.anims.exists("explosion")) {
          explosion.play("explosion");
        }

        explosion.once("animationcomplete", () => {
          explosion.destroy();
        });

        // Occasional screen shake for some explosions
        if (i % 3 === 0) {
          this.scene.cameras.main.shake(150, 0.008);
        }
      });
    }

    logger.game.debug(
      "[AnimationManager] 💥 Started continuous explosion sequence with",
      explosionCount,
      "explosions"
    );
  }

  /**
   * Shared battle phase animation sequence
   * Moves participants to center, starts explosions after delay
   * @param playerManager - PlayerManager instance to move participants
   * @param onComplete - Callback when sequence completes
   */
  startBattlePhaseSequence(playerManager: any, onComplete?: () => void) {
    logger.game.debug("[AnimationManager] ⚔️ Starting battle phase sequence");

    // Play fullscreen explosion animation at the start
    const gameWidth = this.scene.scale.width;
    const gameHeight = this.scene.scale.height;

    const fullscreenExplosion = this.scene.add.sprite(
      gameWidth / 2,
      gameHeight / 2,
      "explosion-fullscreen"
    );

    // TODO: this can be remove later on when the whole app it going to be at the correct size
    const scaleX = gameWidth / STAGE_WIDTH;
    const scaleY = gameHeight / STAGE_HEIGHT;
    const scale = Math.max(scaleX, scaleY);

    fullscreenExplosion.setScale(scale);
    fullscreenExplosion.setDepth(1550); // Between characters and continuous explosions
    // Keep pixel art crisp when scaling
    fullscreenExplosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    if (this.scene.anims.exists("explosion-fullscreen")) {
      this.scene.time.delayedCall(200, () => {
        fullscreenExplosion.play("explosion-fullscreen");
      });
    }

    fullscreenExplosion.once("animationcomplete", () => {
      fullscreenExplosion.destroy();
    });

    // Screen shake for dramatic impact
    this.scene.cameras.main.shake(400, 0.015);

    // Move participants to center
    playerManager.moveParticipantsToCenter();

    // After 500ms of running, start continuous explosions
    this.scene.time.delayedCall(200, () => {
      this.createContinuousExplosions();
    });

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

    // Mark all non-winners as eliminated
    const participants = playerManager.getParticipants();
    participants.forEach((participant: any) => {
      if (participant.id !== winner._id && participant.id !== winner.id) {
        participant.eliminated = true;
      } else {
        participant.eliminated = false; // Winner stays
      }
    });

    // Explode losers outward with physics (includes explosions, blood, shake)
    this.explodeParticipantsOutward(participants);

    // After 3 seconds: Show winner celebration
    this.scene.time.delayedCall(3000, () => {
      logger.game.debug("[AnimationManager] 🎉 Starting winner celebration");

      const gameState = {
        status: "results",
        winnerId: winner._id || winner.id,
        participants: Array.from(participants.values()),
        isDemo: true,
      };

      // Show winner with PlayerManager (scales up, golden tint, etc.)
      const winnerParticipant = playerManager.showResults(gameState);

      logger.game.debug(
        "[AnimationManager] Winner participant from showResults:",
        winnerParticipant
      );

      // Add celebration animations (confetti, text, bounce)
      if (winnerParticipant) {
        logger.game.debug("[AnimationManager] 🏆 Calling addWinnerCelebration");
        this.addWinnerCelebration(winnerParticipant);
      } else {
        logger.game.error("[AnimationManager] ❌ No winner participant returned!");
      }

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    });
  }
}
