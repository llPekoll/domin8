import { Scene } from "phaser";
import { type MapSpawnConfig } from "../../config/spawnConfig";
import { SoundManager } from "./SoundManager";
import { logger } from "../../lib/logger";
import { RESOLUTION_SCALE } from "../main";

// Type for Phaser frame customData with Aseprite trim info
interface FrameCustomData {
  sourceSize?: { w: number; h: number };
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
}

export interface GameParticipant {
  id: string;
  playerId?: string;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  dustBackSprite?: Phaser.GameObjects.Sprite;
  dustFrontSprite?: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  characterKey: string;
  betAmount: number;
  size: number;
  eliminated: boolean;
  targetX: number;
  targetY: number;
  spawnIndex: number;
  isBoss: boolean;
  betCount: number;
  currentScaleTweens?: Phaser.Tweens.Tween[];
}

export class PlayerManager {
  private scene: Scene;
  private participants: Map<string, GameParticipant> = new Map();
  private centerX: number;
  private centerY: number;
  private currentMap: any = null;
  private readonly BASE_SCALE_MULTIPLIER = 1.0; // Scale multiplier (0.01 SOL = 3x, 10 SOL = 13x)

  constructor(scene: Scene, centerX: number, centerY: number) {
    this.scene = scene;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  setMapData(mapData: any) {
    this.currentMap = mapData;
  }

  getMapData(): any {
    return this.currentMap;
  }

  getParticipants(): Map<string, GameParticipant> {
    return this.participants;
  }

  getParticipant(id: string): GameParticipant | undefined {
    return this.participants.get(id);
  }

  addParticipant(participant: any) {
    const participantId = participant._id || participant.id;

    logger.game.debug("[PlayerManager] addParticipant called", {
      id: participantId,
      existingCount: this.participants.size,
      alreadyExists: this.participants.has(participantId),
    });

    // Double-check participant doesn't already exist
    if (this.participants.has(participantId)) {
      logger.game.error("[PlayerManager] Participant already exists!", participantId);
      return;
    }

    const { targetX, targetY } = this.calculateSpawnPosition(participant.spawnIndex);
    const spawnX = targetX;
    const spawnY = -50;

    let characterKey = "warrior";
    if (participant.character) {
      if (participant.character.key) {
        characterKey = participant.character.key;
      } else if (participant.character.name) {
        characterKey = participant.character.name.toLowerCase().replace(/\s+/g, "-");
      }
    }

    const container = this.scene.add.container(spawnX, spawnY);

    // Set depth based on Y position - higher Y = further back = lower depth
    // This creates proper visual layering
    const baseDepth = 100;
    const depthFromY = Math.floor(targetY); // Use target Y position for depth
    container.setDepth(baseDepth + depthFromY);
    let textureKey = characterKey;
    if (!this.scene.textures.exists(characterKey)) {
      textureKey = "warrior";
    }

    // Create dust back sprite (plays behind character)
    const dustBackSprite = this.scene.add.sprite(0, 0, "dust");
    dustBackSprite.setOrigin(0.5, 1.0); // Bottom-center anchor (same as character)
    dustBackSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // Keep pixel art crisp
    if (this.scene.anims.exists("dust-back")) {
      dustBackSprite.play("dust-back");
    }

    // Create main character sprite
    const sprite = this.scene.add.sprite(0, 0, textureKey);

    // Set sprite origin to bottom-center for consistent positioning
    sprite.setOrigin(0.5, 1.0);

    if (targetX > this.centerX) {
      sprite.setFlipX(true);
    }

    // Start with falling animation
    const fallingAnimKey = `${textureKey}-falling`;
    if (this.scene.anims.exists(fallingAnimKey)) {
      sprite.play(fallingAnimKey);
    }

    // Apply base multiplier + bet scaling + character-specific scale + boss multiplier
    const betScale = participant.size || this.calculateParticipantScale(participant.betAmount);
    const characterBaseScale = participant.character?.baseScale ?? 1.0;
    const bossMultiplier = participant.isBoss ? 1.2 : 1.0; // Boss gets 1.2x size
    const scale = betScale * this.BASE_SCALE_MULTIPLIER * characterBaseScale * bossMultiplier;
    sprite.setScale(scale);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Make sprite interactive for poke animation, but allow clicks to pass through
    sprite.setInteractive({
      cursor: "pointer",
      pixelPerfect: true, // Only trigger on non-transparent pixels
    });
    sprite.on("pointerdown", () => {
      // Randomly choose between poke and poke1 animations
      const pokeVariant = Math.random() < 0.5 ? "poke" : "poke1";
      const pokeAnimKey = `${textureKey}-${pokeVariant}`;

      // Check if the chosen poke animation exists, otherwise try the other one
      let selectedPokeKey = pokeAnimKey;
      if (!this.scene.anims.exists(pokeAnimKey)) {
        const fallbackVariant = pokeVariant === "poke" ? "poke1" : "poke";
        const fallbackKey = `${textureKey}-${fallbackVariant}`;
        if (this.scene.anims.exists(fallbackKey)) {
          selectedPokeKey = fallbackKey;
        } else {
          // Neither poke animation exists, don't play anything
          return;
        }
      }

      // Remove any existing animationcomplete listener to avoid stacking
      sprite.off("animationcomplete");

      // Play animation from the start (restart if already playing)
      sprite.play(selectedPokeKey, true);

      // After poke animation completes, return to idle
      sprite.once("animationcomplete", () => {
        const idleAnimKey = `${textureKey}-idle`;
        if (this.scene.anims.exists(idleAnimKey)) {
          sprite.play(idleAnimKey);
        }
      });
    });

    // Create dust front sprite (plays in front of character)
    const dustFrontSprite = this.scene.add.sprite(0, 0, "dust");
    dustFrontSprite.setOrigin(0.5, 1.0); // Bottom-center anchor (same as character)
    dustFrontSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // Keep pixel art crisp
    if (this.scene.anims.exists("dust-front")) {
      dustFrontSprite.play("dust-front");
    }

    // Scale dust sprites relative to character size (same as old dust-impact)
    const dustScale = scale * 0.2; // Scale dust relative to character size
    dustBackSprite.setScale(dustScale);
    dustFrontSprite.setScale(dustScale);

    // Offset dust down from character's feet (same as old dust-impact)
    const dustOffsetY = 15; // Offset down from character's feet
    dustBackSprite.setY(dustOffsetY);
    dustFrontSprite.setY(dustOffsetY);

    // Auto-calculate Y offset to align visible feet with container origin
    // The sprite's origin (0.5, 1.0) is at the bottom of sourceSize canvas
    const spriteFrame = sprite.frame;
    const customData = spriteFrame.customData as FrameCustomData | undefined;
    const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
    const trimY = customData?.spriteSourceSize?.y || 0;
    const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
    // Gap from visible feet to canvas bottom (in unscaled pixels)
    const feetGapUnscaled = sourceHeight - (trimY + trimHeight);
    // Scale the gap because sprite.setY is in container space but the visual gap scales with sprite
    const feetGapScaled = feetGapUnscaled * scale;
    sprite.setY(feetGapScaled);

    // With bottom-origin sprite, name goes below with consistent gap
    const nameYOffset = 10; // Fixed gap below sprite bottom

    const nameText = this.scene.add
      .text(0, nameYOffset, participant.displayName, {
        fontFamily: "jersey15",
        fontSize: "13px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 40,
        align: "center",
      })
      .setOrigin(0.5);

    // Show names immediately for both bots and real players
    nameText.setVisible(true);

    // Add sprites in correct order for layering (render order matters):
    // 1. Back dust (behind character)
    // 2. Character sprite (middle)
    // 3. Front dust (in front of character)
    // 4. Name text (always on top)
    container.add(dustBackSprite);
    container.add(sprite);
    container.add(dustFrontSprite);
    container.add(nameText);

    // Consistent falling animation for all characters
    this.scene.tweens.add({
      targets: container,
      y: targetY,
      duration: 250, // Fast fall duration
      ease: "Cubic.easeIn", // Smooth acceleration downward
      onStart: () => {
        logger.game.info(`[PlayerManager] 🎬 Tween started:`, {
          participantId,
          currentY: container.y,
          targetY,
          alpha: container.alpha,
        });
      },
      onComplete: () => {
        logger.game.info(`[PlayerManager] ✅ Tween completed:`, {
          participantId,
          finalY: container.y,
          targetY,
          alpha: container.alpha,
        });

        // Play random impact sound when hitting ground
        try {
          logger.game.debug(`[PlayerManager] Playing random impact sound for ${participantId}`);
          SoundManager.playRandomImpact(this.scene, 0.4);
        } catch (e) {
          logger.game.error("[PlayerManager] Failed to play impact sound:", e);
        }

        // Play landing animation, then transition to idle
        // Safety check: ensure sprite still exists before playing animations
        if (!sprite || !sprite.active) {
          logger.game.warn(
            `[PlayerManager] Sprite no longer exists for ${participantId}, skipping animation`
          );
          return;
        }

        const landingAnimKey = `${textureKey}-landing`;
        if (this.scene.anims.exists(landingAnimKey)) {
          sprite.play(landingAnimKey);

          // After landing animation completes, switch to idle
          sprite.once("animationcomplete", () => {
            const idleAnimKey = `${textureKey}-idle`;
            if (sprite && sprite.active && this.scene.anims.exists(idleAnimKey)) {
              sprite.play(idleAnimKey);
              // Recalculate Y offset for idle frame (may differ from falling frame)
              this.recalculateSpriteY(sprite, scale);
            }
          });
        } else {
          // If no landing animation, go straight to idle
          const idleAnimKey = `${textureKey}-idle`;
          if (this.scene.anims.exists(idleAnimKey)) {
            sprite.play(idleAnimKey);
            // Recalculate Y offset for idle frame
            this.recalculateSpriteY(sprite, scale);
          }
        }
      },
    });
    const gameParticipant: GameParticipant = {
      id: participantId,
      playerId: participant.playerId,
      container,
      sprite,
      dustBackSprite,
      dustFrontSprite,
      nameText,
      characterKey: textureKey,
      betAmount: participant.betAmount,
      size: scale,
      eliminated: participant.eliminated || false,
      targetX,
      targetY,
      spawnIndex: participant.spawnIndex,
      isBoss: participant.isBoss || false,
      betCount: 1, // First bet
      currentScaleTweens: [],
    };

    this.participants.set(participantId, gameParticipant);
    logger.game.debug("[PlayerManager] Participant added successfully", {
      id: participantId,
      newCount: this.participants.size,
    });
  }

  /**
   * Recalculate sprite Y position based on current frame metadata
   * Called after animation changes (e.g., falling -> idle) since frames may have different sizes
   */
  private recalculateSpriteY(sprite: Phaser.GameObjects.Sprite, scale: number) {
    const spriteFrame = sprite.frame;
    const customData = spriteFrame.customData as FrameCustomData | undefined;
    const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
    const trimY = customData?.spriteSourceSize?.y || 0;
    const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
    const feetGapUnscaled = sourceHeight - (trimY + trimHeight);
    const feetGapScaled = feetGapUnscaled * scale;
    sprite.setY(feetGapScaled);
  }

  private calculateParticipantScale(betAmountInSOL: number): number {
    // Bet range: 0.001 - 10 SOL
    const minBet = 0.001;
    const maxBet = 10;

    // Base scale values for native resolution (396x180)
    // Increased minimum scale from 0.5 to 0.8 to make small bets bigger
    const baseMinScale = 0.9;
    const baseMaxScale = 2.5;

    // Apply resolution scale to character sizes
    const minScale = baseMinScale * RESOLUTION_SCALE;
    const maxScale = baseMaxScale * RESOLUTION_SCALE;

    const clampedBet = Math.max(minBet, Math.min(maxBet, betAmountInSOL));
    const scale = minScale + ((clampedBet - minBet) / (maxBet - minBet)) * (maxScale - minScale);
    return scale;
  }

  private calculateSpawnPosition(spawnIndex: number) {
    // Use map-specific config from database
    const config: MapSpawnConfig = this.currentMap?.spawnConfiguration;

    if (!config) {
      logger.game.error("[PlayerManager] No spawn configuration available!");
      throw new Error("No spawn configuration found - map data required");
    }

    // Apply resolution scale to all spawn config values
    const scaledConfig = {
      centerX: config.centerX * RESOLUTION_SCALE,
      centerY: config.centerY * RESOLUTION_SCALE,
      radiusX: config.radiusX * RESOLUTION_SCALE,
      radiusY: config.radiusY * RESOLUTION_SCALE,
      minSpawnRadius: config.minSpawnRadius * RESOLUTION_SCALE,
      maxSpawnRadius: config.maxSpawnRadius * RESOLUTION_SCALE,
      minSpacing: config.minSpacing * RESOLUTION_SCALE,
    };

    // Distribute angles with randomness for more organic placement
    // Base angle evenly distributed (every 8 participants completes a rotation)
    const participantsPerRotation = 8;
    const baseAngle = (spawnIndex / participantsPerRotation) * Math.PI * 2;

    // Add random variation to angle (±22.5° = ±π/8 radians, half the spacing between positions)
    const angleVariation = (Math.random() - 0.5) * (Math.PI / 4); // ±45° variation
    const angle = baseAngle + angleVariation;

    // Random factor (0 to 1) to vary distance from center
    const randomFactor = Math.random() * 0.5 + 0.5; // 0.5 to 1.0 (spawn in outer half of ellipse)

    // Calculate position on ellipse - no normalization needed, radiusX and radiusY define the ellipse
    const x = scaledConfig.centerX + Math.cos(angle) * scaledConfig.radiusX * randomFactor;
    const y = scaledConfig.centerY + Math.sin(angle) * scaledConfig.radiusY * randomFactor;

    logger.game.debug(`[PlayerManager] Spawn position calculated for index ${spawnIndex}:`, {
      angle: ((angle * 180) / Math.PI).toFixed(1) + "°",
      randomFactor: randomFactor.toFixed(2),
      targetX: x.toFixed(1),
      targetY: y.toFixed(1),
      config: {
        centerX: config.centerX,
        centerY: config.centerY,
        radiusX: config.radiusX,
        radiusY: config.radiusY,
      },
    });

    return {
      targetX: x,
      targetY: y,
    };
  }

  updateParticipantData(participant: any) {
    const gameParticipant = this.participants.get(participant._id);
    if (gameParticipant) {
      // Update scale if bet amount changed (apply base multiplier + boss multiplier)
      const betScale = participant.size || this.calculateParticipantScale(participant.betAmount);
      const characterBaseScale = participant.character?.baseScale ?? 1.0;
      const bossMultiplier = gameParticipant.isBoss ? 1.2 : 1.0;
      const newScale = betScale * this.BASE_SCALE_MULTIPLIER * characterBaseScale * bossMultiplier;

      if (gameParticipant.size !== newScale) {
        gameParticipant.size = newScale;
        gameParticipant.betAmount = participant.betAmount;
        gameParticipant.betCount = (gameParticipant.betCount || 0) + 1;

        // Use Mario animation for boss subsequent bets (not first bet)
        if (gameParticipant.isBoss && gameParticipant.betCount > 1) {
          logger.game.debug(
            "👑 [BOSS] Mario animation triggered! betCount:",
            gameParticipant.betCount
          );
          this.animateBossBetScale(gameParticipant, newScale);
        } else {
          // Standard smooth tween for non-boss or first bet
          // Calculate new Y position to keep feet at container origin
          const spriteFrame = gameParticipant.sprite.frame;
          const customData = spriteFrame.customData as FrameCustomData | undefined;
          const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
          const trimY = customData?.spriteSourceSize?.y || 0;
          const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
          const feetGapUnscaled = sourceHeight - (trimY + trimHeight);
          const feetGapScaled = feetGapUnscaled * newScale;

          this.scene.tweens.add({
            targets: gameParticipant.sprite,
            scaleX: newScale,
            scaleY: newScale,
            y: feetGapScaled,
            duration: 300,
            ease: "Power2",
          });
        }
      }

      // Update elimination status from backend
      gameParticipant.eliminated = participant.eliminated || false;
    }
  }

  /**
   * Mario-style scale oscillation animation for boss subsequent bets
   * Oscillates: 1.5x -> 0.8x -> 1.3x -> 0.9x -> final
   * Scales from the visible feet position (magenta dot / container origin)
   */
  private animateBossBetScale(participant: GameParticipant, finalScale: number) {
    logger.game.debug("👑 [BOSS] animateBossBetScale called:", {
      participantId: participant.id,
      finalScale,
      currentScale: participant.sprite?.scaleX,
    });

    // Play Mario power-up sound
    SoundManager.playBossPowerUp(this.scene, 0.5);

    const sprite = participant.sprite;
    const dustBackSprite = participant.dustBackSprite;
    const dustFrontSprite = participant.dustFrontSprite;

    // Cancel any existing scale tweens
    if (participant.currentScaleTweens && participant.currentScaleTweens.length > 0) {
      participant.currentScaleTweens.forEach((t) => {
        if (t && t.isPlaying()) {
          t.stop();
        }
      });
    }
    participant.currentScaleTweens = [];

    // Get frame data to calculate feet offset (same as in addParticipant)
    const spriteFrame = sprite.frame;
    const customData = spriteFrame.customData as FrameCustomData | undefined;
    const sourceHeight = customData?.sourceSize?.h || spriteFrame.height;
    const trimY = customData?.spriteSourceSize?.y || 0;
    const trimHeight = customData?.spriteSourceSize?.h || spriteFrame.height;
    const feetGapUnscaled = sourceHeight - (trimY + trimHeight);

    // Oscillation sequence: extended Mario-style bounce with no interpolation
    const keyframes = [
      { scale: finalScale * 1.5, duration: 100 },
      { scale: finalScale * 0.7, duration: 100 },
      { scale: finalScale * 1.4, duration: 100 },
      { scale: finalScale * 0.8, duration: 100 },
      { scale: finalScale * 1.25, duration: 100 },
      { scale: finalScale * 0.9, duration: 100 },
      { scale: finalScale, duration: 100 },
    ];

    let delay = 0;
    keyframes.forEach((kf) => {
      // Calculate dust scale for this sprite scale
      const dustScale = kf.scale * 0.2;

      // Calculate Y offset for this scale (feet gap scales with sprite)
      const feetGapScaled = feetGapUnscaled * kf.scale;

      // Animate sprite scale and Y position to keep feet at container origin
      const spriteTween = this.scene.tweens.add({
        targets: sprite,
        scaleX: kf.scale,
        scaleY: kf.scale,
        y: feetGapScaled, // Keep feet anchored at magenta dot
        duration: kf.duration,
        delay: delay,
        ease: "Stepped",
      });
      participant.currentScaleTweens!.push(spriteTween);

      // Animate dust sprites to match
      if (dustBackSprite) {
        const dustBackTween = this.scene.tweens.add({
          targets: dustBackSprite,
          scaleX: dustScale,
          scaleY: dustScale,
          duration: kf.duration,
          delay: delay,
          ease: "Stepped",
        });
        participant.currentScaleTweens!.push(dustBackTween);
      }

      if (dustFrontSprite) {
        const dustFrontTween = this.scene.tweens.add({
          targets: dustFrontSprite,
          scaleX: dustScale,
          scaleY: dustScale,
          duration: kf.duration,
          delay: delay,
          ease: "Stepped",
        });
        participant.currentScaleTweens!.push(dustFrontTween);
      }

      delay += kf.duration;
    });
  }

  showResults(gameState: any) {
    // Find winner - get directly from PlayerManager using winnerId
    const winnerId = gameState.winnerId;

    const winnerParticipant = this.participants.get(winnerId);

    if (winnerParticipant) {
      // Hide all other participants first
      this.participants.forEach((participant, id) => {
        if (id !== winnerId) {
          // Fade out losers
          this.scene.tweens.add({
            targets: participant.container,
            alpha: 0,
            duration: 500,
            onComplete: () => {
              participant.container.setVisible(false);
            },
          });
        }
      });

      // DON'T reset sprite.y - it already has the correct offset from spawn
      // The offset compensates for transparent space at bottom of sprite
      const spriteOffset = winnerParticipant.sprite.y;

      // Position container so winner sits on the throne seat
      // Throne is at centerY + 50, winner should sit slightly above center of throne
      const targetThroneY = this.centerY + 100;
      const containerY = targetThroneY + spriteOffset;

      this.scene.tweens.add({
        targets: winnerParticipant.container,
        x: this.centerX,
        y: containerY,
        duration: 1000,
        ease: "Power2.easeInOut",
      });

      // Scale up the winner sprite
      this.scene.tweens.add({
        targets: winnerParticipant.sprite,
        scaleX: winnerParticipant.sprite.scaleX * 2,
        scaleY: winnerParticipant.sprite.scaleY * 2,
        duration: 1000,
        ease: "Back.easeOut",
      });

      // Make winner golden
      // winnerParticipant.sprite.setTint(0xffd700);
      // winnerParticipant.nameText.setColor("#ffd700");
      // winnerParticipant.nameText.setFontSize(20);
      // winnerParticipant.nameText.setStroke("#000000", 4);

      // Victory animation
      const victoryAnimKey = `${winnerParticipant.characterKey}-win`;
      if (this.scene.anims.exists(victoryAnimKey)) {
        winnerParticipant.sprite.play(victoryAnimKey);
      }
      return winnerParticipant;
    }
    return null;
  }

  clearParticipants() {
    logger.game.debug(
      `[CLEANUP] PlayerManager.clearParticipants() - ${this.participants.size} participants`
    );

    let destroyedCount = 0;
    let alreadyDestroyedCount = 0;
    let errorCount = 0;

    this.participants.forEach((participant, id) => {
      try {
        // Check if container still exists and is active before destroying
        if (participant.container && participant.container.scene) {
          logger.game.debug(
            `[CLEANUP]   Destroying: ${id} (${participant.nameText.text}) - alpha:${participant.container.alpha}`
          );
          participant.container.destroy();
          destroyedCount++;
        } else {
          alreadyDestroyedCount++;
          logger.game.warn(
            `[CLEANUP]   Already destroyed: ${id} (container:${!!participant.container}, scene:${!!participant.container?.scene})`
          );
        }
      } catch (e) {
        errorCount++;
        logger.game.error(`[CLEANUP]   Error destroying ${id}:`, e);
      }
    });

    logger.game.debug(
      `[CLEANUP] Destruction summary: total=${this.participants.size}, destroyed=${destroyedCount}, already=${alreadyDestroyedCount}, errors=${errorCount}`
    );

    this.participants.clear();
    logger.game.debug(`[CLEANUP] Participants Map cleared (size now: ${this.participants.size})`);
  }
}
