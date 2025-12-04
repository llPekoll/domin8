import { Scene } from "phaser";
import { type MapSpawnConfig } from "../../config/spawnConfig";
import { SoundManager } from "./SoundManager";
import { logger } from "../../lib/logger";
import { RESOLUTION_SCALE } from "../main";

export interface GameParticipant {
  id: string;
  playerId?: string;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  dustBackSprite?: Phaser.GameObjects.Sprite; // Dust animation behind character
  dustFrontSprite?: Phaser.GameObjects.Sprite; // Dust animation in front of character
  auraBackSprite?: Phaser.GameObjects.Sprite; // Aura animation behind character
  auraFrontSprite?: Phaser.GameObjects.Sprite; // Aura animation in front of character
  nameText: Phaser.GameObjects.Text;
  characterKey: string;
  auraKey?: string; // Aura asset key (e.g., "B", "H", "M")
  displayName: string;
  betAmount: number;
  size: number;
  colorHue?: number;
  isBot: boolean;
  eliminated: boolean;
  targetX: number;
  targetY: number;
  spawnIndex: number;
}

// Aura scale relative to character size (0.8 = 80% of character scale)
const AURA_SCALE_MULTIPLIER = 0.8;
// Aura Y offset multiplier (negative = up, relative to character scale)
const AURA_Y_OFFSET = -20;

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

  updateCenter(centerX: number, centerY: number) {
    this.centerX = centerX;
    this.centerY = centerY;
  }

  setMapData(mapData: any) {
    this.currentMap = mapData;
  }

  getParticipants(): Map<string, GameParticipant> {
    return this.participants;
  }

  getParticipant(id: string): GameParticipant | undefined {
    return this.participants.get(id);
  }

  // Get all participants for a specific player
  getPlayerParticipants(playerId: string): GameParticipant[] {
    return Array.from(this.participants.values()).filter((p) => p.playerId === playerId);
  }

  updateParticipantsInWaiting(participants: any[], mapData: any) {
    this.currentMap = mapData;

    // Add new participants or update existing ones
    participants.forEach((participant: any) => {
      if (!this.participants.has(participant._id)) {
        this.addParticipant(participant);
      } else {
        this.updateParticipantData(participant);
      }
    });

    // Remove participants who left
    const currentIds = new Set(participants.map((p: any) => p._id));
    this.participants.forEach((_participant, id) => {
      if (!currentIds.has(id)) {
        this.removeParticipant(id);
      }
    });
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

    // Apply base 3x multiplier + bet scaling FIRST
    const betScale = participant.size || this.calculateParticipantScale(participant.betAmount);
    const scale = betScale * this.BASE_SCALE_MULTIPLIER;
    sprite.setScale(scale);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Make sprite interactive for poke animation, but allow clicks to pass through
    sprite.setInteractive({
      cursor: "pointer",
      pixelPerfect: true, // Only trigger on non-transparent pixels
    });
    sprite.on("pointerdown", () => {
      // Only play poke animation if currently playing idle
      const currentAnim = sprite.anims.currentAnim;
      if (currentAnim && currentAnim.key === `${textureKey}-idle`) {
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

        sprite.play(selectedPokeKey);

        // After poke animation completes, return to idle
        sprite.once("animationcomplete", () => {
          const idleAnimKey = `${textureKey}-idle`;
          if (this.scene.anims.exists(idleAnimKey)) {
            sprite.play(idleAnimKey);
          }
        });
      }
    });

    // Create dust front sprite (plays in front of character)
    const dustFrontSprite = this.scene.add.sprite(0, 0, "dust");
    dustFrontSprite.setOrigin(0.5, 1.0); // Bottom-center anchor (same as character)
    dustFrontSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // Keep pixel art crisp
    if (this.scene.anims.exists("dust-front")) {
      dustFrontSprite.play("dust-front");
    }

    // Create aura sprites if participant has an equipped aura
    let auraBackSprite: Phaser.GameObjects.Sprite | undefined;
    let auraFrontSprite: Phaser.GameObjects.Sprite | undefined;
    const auraKey = participant.auraKey; // e.g., "B", "H", "M"

    logger.game.debug(`[PlayerManager] Aura check for ${participantId}:`, {
      auraKey,
      textureExists: auraKey ? this.scene.textures.exists(`aura-${auraKey}`) : false,
      backAnimExists: auraKey ? this.scene.anims.exists(`aura-${auraKey}-back`) : false,
      frontAnimExists: auraKey ? this.scene.anims.exists(`aura-${auraKey}-front`) : false,
    });

    if (auraKey && this.scene.textures.exists(`aura-${auraKey}`)) {
      // Create back aura sprite (renders behind character)
      auraBackSprite = this.scene.add.sprite(0, 0, `aura-${auraKey}`);
      auraBackSprite.setOrigin(0.5, 0.5); // Center anchor for aura
      auraBackSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

      // Create front aura sprite (renders in front of character)
      auraFrontSprite = this.scene.add.sprite(0, 0, `aura-${auraKey}`);
      auraFrontSprite.setOrigin(0.5, 0.5); // Center anchor for aura
      auraFrontSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

      // Play aura animations
      const backAnimKey = `aura-${auraKey}-back`;
      const frontAnimKey = `aura-${auraKey}-front`;

      if (this.scene.anims.exists(backAnimKey)) {
        auraBackSprite.play(backAnimKey);
      }
      if (this.scene.anims.exists(frontAnimKey)) {
        auraFrontSprite.play(frontAnimKey);
      }

      // Scale aura relative to character size
      const auraScale = scale * AURA_SCALE_MULTIPLIER;
      auraBackSprite.setScale(auraScale);
      auraFrontSprite.setScale(auraScale);

      // Position aura sprites centered on character body (above name)
      const auraOffsetY = AURA_Y_OFFSET * scale;
      auraBackSprite.setY(auraOffsetY);
      auraFrontSprite.setY(auraOffsetY);

      // Initially hide auras (show after landing)
      auraBackSprite.setVisible(false);
      auraFrontSprite.setVisible(false);

      logger.game.debug(
        `[PlayerManager] Created aura sprites for ${participantId} with key: ${auraKey}`
      );
    }

    // Scale dust sprites relative to character size (same as old dust-impact)
    const dustScale = scale * 0.2; // Scale dust relative to character size
    dustBackSprite.setScale(dustScale);
    dustFrontSprite.setScale(dustScale);

    // Offset dust down from character's feet (same as old dust-impact)
    const dustOffsetY = 15; // Offset down from character's feet
    dustBackSprite.setY(dustOffsetY);
    dustFrontSprite.setY(dustOffsetY);

    // Character-specific Y offset adjustments (scales with sprite size)
    // These values are in original sprite pixels and will be scaled automatically
    const spriteOffsetsInPixels: { [key: string]: number } = {
      male: 48, // Transparent space at bottom in original sprite
      orc: 13, // Transparent space at bottom in original sprite
      soldier: 42,
      pepe: 13, // Transparent space at bottom in original sprite
      yasuo: 13, // Transparent space at bottom in original sprite
      darthvader: 13, // Transparent space at bottom in original sprite
      huggy_wuggy: 13, // Transparent space at bottom in original sprite
      nomu: 12, // Transparent space at bottom in original sprite
      siren: 12, // Transparent space at bottom in original sprite
      // Add other characters here if needed
    };
    const offsetPixels = spriteOffsetsInPixels[textureKey] || 0;
    const scaledOffset = offsetPixels * scale;
    sprite.setY(scaledOffset);

    // With bottom-origin sprite, name goes below with consistent gap
    const nameYOffset = 10; // Fixed gap below sprite bottom

    // Style bot names differently
    const isBot = participant.isBot && !participant.playerId;
    const nameColor = isBot ? "#ffff99" : "#ffffff"; // Light yellow for bots
    const strokeColor = isBot ? "#666600" : "#000000"; // Darker yellow stroke for bots

    const nameText = this.scene.add
      .text(0, nameYOffset, participant.displayName, {
        fontFamily: "jersey15",
        fontSize: "13px",
        color: nameColor,
        stroke: strokeColor,
        strokeThickness: 2, // Scaled down from 6px
        resolution: 40, // High resolution for crisp text when scaled
        align: "center",
      })
      .setOrigin(0.5);

    // Show names immediately for both bots and real players
    nameText.setVisible(true);

    // Add sprites in correct order for layering (render order matters):
    // 1. Aura back (behind everything)
    // 2. Back dust (behind character)
    // 3. Character sprite (middle)
    // 4. Front dust (in front of character)
    // 5. Aura front (in front of dust)
    // 6. Name text (always on top)
    if (auraBackSprite) container.add(auraBackSprite);
    container.add(dustBackSprite);
    container.add(sprite);
    container.add(dustFrontSprite);
    if (auraFrontSprite) container.add(auraFrontSprite);
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

          // After landing animation completes, switch to idle and show aura
          sprite.once("animationcomplete", () => {
            const idleAnimKey = `${textureKey}-idle`;
            if (sprite && sprite.active && this.scene.anims.exists(idleAnimKey)) {
              sprite.play(idleAnimKey);
            }
            // Show aura after landing
            if (auraBackSprite) auraBackSprite.setVisible(true);
            if (auraFrontSprite) auraFrontSprite.setVisible(true);
          });
        } else {
          // If no landing animation, go straight to idle and show aura
          const idleAnimKey = `${textureKey}-idle`;
          if (this.scene.anims.exists(idleAnimKey)) {
            sprite.play(idleAnimKey);
          }
          // Show aura after landing
          if (auraBackSprite) auraBackSprite.setVisible(true);
          if (auraFrontSprite) auraFrontSprite.setVisible(true);
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
      auraBackSprite,
      auraFrontSprite,
      nameText,
      characterKey: textureKey,
      auraKey: auraKey,
      displayName: participant.displayName,
      betAmount: participant.betAmount,
      size: scale,
      colorHue: participant.colorHue,
      isBot: participant.isBot || false,
      eliminated: participant.eliminated || false,
      targetX,
      targetY,
      spawnIndex: participant.spawnIndex,
    };

    this.participants.set(participantId, gameParticipant);
    logger.game.debug("[PlayerManager] Participant added successfully", {
      id: participantId,
      newCount: this.participants.size,
    });
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
      // Update scale if bet amount changed (apply base multiplier)
      const betScale = participant.size || this.calculateParticipantScale(participant.betAmount);
      const newScale = betScale * this.BASE_SCALE_MULTIPLIER;
      if (gameParticipant.size !== newScale) {
        gameParticipant.size = newScale;
        gameParticipant.betAmount = participant.betAmount;

        // Scale only the sprite, not the text
        this.scene.tweens.add({
          targets: gameParticipant.sprite,
          scaleX: newScale,
          scaleY: newScale,
          duration: 300,
          ease: "Power2",
        });

        // Also scale aura sprites if present
        const auraScale = newScale * AURA_SCALE_MULTIPLIER;
        if (gameParticipant.auraBackSprite) {
          this.scene.tweens.add({
            targets: gameParticipant.auraBackSprite,
            scaleX: auraScale,
            scaleY: auraScale,
            duration: 300,
            ease: "Power2",
          });
        }
        if (gameParticipant.auraFrontSprite) {
          this.scene.tweens.add({
            targets: gameParticipant.auraFrontSprite,
            scaleX: auraScale,
            scaleY: auraScale,
            duration: 300,
            ease: "Power2",
          });
        }
      }

      // Update tint - simple logic
      if (participant.colorHue !== undefined && !participant.isBot) {
        const hue = participant.colorHue / 360;
        const tint = Phaser.Display.Color.HSVToRGB(hue, 0.3, 1.0).color;
        gameParticipant.sprite.setTint(tint);
      } else {
        gameParticipant.sprite.clearTint();
      }

      // Update elimination status from backend
      gameParticipant.eliminated = participant.eliminated || false;
    }
  }

  updateParticipantScale(participant: any) {
    // Legacy method for backward compatibility
    this.updateParticipantData(participant);
  }

  removeParticipant(participantId: string) {
    const participant = this.participants.get(participantId);
    if (participant) {
      // Destroying the container automatically destroys all children
      participant.container.destroy();
      this.participants.delete(participantId);
    }
  }

  /**
   * Add aura to an existing participant (for late-loading aura data)
   */
  addAuraToParticipant(participantId: string, auraKey: string) {
    const participant = this.participants.get(participantId);
    if (!participant) {
      logger.game.warn(`[PlayerManager] Cannot add aura - participant ${participantId} not found`);
      return;
    }

    // Skip if participant already has this aura
    if (participant.auraKey === auraKey) {
      return;
    }

    // Skip if texture doesn't exist
    if (!this.scene.textures.exists(`aura-${auraKey}`)) {
      logger.game.warn(`[PlayerManager] Aura texture aura-${auraKey} not found`);
      return;
    }

    logger.game.debug(`[PlayerManager] Adding aura ${auraKey} to participant ${participantId}`);

    // Create back aura sprite
    const auraBackSprite = this.scene.add.sprite(0, 0, `aura-${auraKey}`);
    auraBackSprite.setOrigin(0.5, 0.5);
    auraBackSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Create front aura sprite
    const auraFrontSprite = this.scene.add.sprite(0, 0, `aura-${auraKey}`);
    auraFrontSprite.setOrigin(0.5, 0.5);
    auraFrontSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Play animations
    const backAnimKey = `aura-${auraKey}-back`;
    const frontAnimKey = `aura-${auraKey}-front`;

    if (this.scene.anims.exists(backAnimKey)) {
      auraBackSprite.play(backAnimKey);
    }
    if (this.scene.anims.exists(frontAnimKey)) {
      auraFrontSprite.play(frontAnimKey);
    }

    // Scale aura relative to character size
    const auraScale = participant.size * AURA_SCALE_MULTIPLIER;
    auraBackSprite.setScale(auraScale);
    auraFrontSprite.setScale(auraScale);

    // Position aura sprites centered on character body (above name)
    const auraOffsetY = AURA_Y_OFFSET * participant.size;
    auraBackSprite.setY(auraOffsetY);
    auraFrontSprite.setY(auraOffsetY);

    // Add to container in correct order (before sprite and after dust)
    // Find indices for proper layering
    const container = participant.container;
    const spriteIndex = container.list.indexOf(participant.sprite);

    // Insert back aura before sprite (behind character)
    container.addAt(auraBackSprite, spriteIndex);
    // Insert front aura after sprite (in front of character, before name)
    container.addAt(auraFrontSprite, spriteIndex + 2);

    // Update participant
    participant.auraBackSprite = auraBackSprite;
    participant.auraFrontSprite = auraFrontSprite;
    participant.auraKey = auraKey;

    // Show aura immediately (since character already landed)
    auraBackSprite.setVisible(true);
    auraFrontSprite.setVisible(true);

    logger.game.debug(`[PlayerManager] Aura ${auraKey} added to participant ${participantId}`);
  }

  moveParticipantsToCenter() {
    // Use map-specific spawn center, not screen center
    const config: MapSpawnConfig = this.currentMap?.spawnConfiguration;
    const targetCenterX = config ? config.centerX * RESOLUTION_SCALE : this.centerX;
    const targetCenterY = config ? config.centerY * RESOLUTION_SCALE : this.centerY;

    this.participants.forEach((participant) => {
      // Show names when moving to center
      participant.nameText.setVisible(true);

      // Animate container moving towards map center (sprite and text move together)
      // Faster duration: 400-600ms instead of 800-1200ms
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

  showSurvivors(survivorIds: string[]) {
    // Highlight the survivors (only called for large games)
    this.participants.forEach((participant, id) => {
      const isSurvivor = survivorIds.includes(id);

      if (isSurvivor) {
        // Highlight survivors
        participant.sprite.setTint(0xffd700); // Golden tint
        participant.nameText.setColor("#ffd700"); // Golden name

        // Add glowing effect to container (affects both sprite and text)
        this.scene.tweens.add({
          targets: participant.container,
          alpha: { from: 1, to: 0.7 },
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
      } else {
        // Fade out eliminated participants
        participant.sprite.setTint(0x666666);
        participant.container.setAlpha(0.3); // Fades both sprite and text
        participant.eliminated = true;
      }
    });
  }

  showBattlePhase() {
    // Animate battle between remaining participants
    this.participants.forEach((participant) => {
      if (!participant.eliminated) {
        // Battle animations - rapid movement of container
        this.scene.tweens.add({
          targets: participant.container,
          x: this.centerX + (Math.random() - 0.5) * 200,
          y: this.centerY + (Math.random() - 0.5) * 200,
          duration: 300,
          ease: "Power2.easeInOut",
          repeat: 5,
          yoyo: true,
        });

        // Change to attack animation
        const attackAnimKey = `${participant.characterKey}-attack`;
        if (this.scene.anims.exists(attackAnimKey)) {
          participant.sprite.play(attackAnimKey);
        }
      }
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

      // Position container so feet align with throne anchor
      // Need to ADD offset to move container down to account for sprite's internal offset
      const targetThroneY = this.centerY + 120;
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

  // Update participants in any phase (not just waiting)
  updateParticipants(participants: any[]) {
    // Update existing participants with new data from backend
    participants.forEach((participant: any) => {
      const gameParticipant = this.participants.get(participant._id);
      if (gameParticipant) {
        // Update elimination status and other data
        gameParticipant.eliminated = participant.eliminated || false;
        gameParticipant.betAmount = participant.betAmount;
      }
    });
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
            `[CLEANUP]   Destroying: ${id} (${participant.displayName}) - alpha:${participant.container.alpha}`
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

  // Debug: Draw the spawn ellipse to visualize configuration
  debugDrawSpawnEllipse(config?: MapSpawnConfig) {
    const spawnConfig: MapSpawnConfig = config || this.currentMap?.spawnConfiguration;

    if (!spawnConfig) {
      logger.game.error("[PlayerManager] No spawn configuration available for debug drawing!");
      console.error("[DEBUG] currentMap:", this.currentMap);
      return;
    }

    // Apply resolution scale to all values for drawing
    const scaledConfig = {
      centerX: spawnConfig.centerX * RESOLUTION_SCALE,
      centerY: spawnConfig.centerY * RESOLUTION_SCALE,
      radiusX: spawnConfig.radiusX * RESOLUTION_SCALE,
      radiusY: spawnConfig.radiusY * RESOLUTION_SCALE,
      minSpawnRadius: spawnConfig.minSpawnRadius * RESOLUTION_SCALE,
      maxSpawnRadius: spawnConfig.maxSpawnRadius * RESOLUTION_SCALE,
      minSpacing: spawnConfig.minSpacing * RESOLUTION_SCALE,
    };

    console.log(`[DEBUG] ===== SPAWN ELLIPSE DEBUG =====`);
    console.log(`[DEBUG] Base centerX: ${spawnConfig.centerX} → Scaled: ${scaledConfig.centerX}`);
    console.log(`[DEBUG] Base centerY: ${spawnConfig.centerY} → Scaled: ${scaledConfig.centerY}`);
    console.log(`[DEBUG] Base radiusX: ${spawnConfig.radiusX} → Scaled: ${scaledConfig.radiusX}`);
    console.log(`[DEBUG] Base radiusY: ${spawnConfig.radiusY} → Scaled: ${scaledConfig.radiusY}`);
    console.log(`[DEBUG] Resolution scale: ${RESOLUTION_SCALE}`);
    console.log(
      `[DEBUG] Green ellipse size: ${scaledConfig.radiusX * 2} x ${scaledConfig.radiusY * 2}`
    );
    console.log(`[DEBUG] ==================================`);

    // Draw center point
    const centerDot = this.scene.add.circle(
      scaledConfig.centerX,
      scaledConfig.centerY,
      3,
      0xff0000,
      1
    );
    centerDot.setDepth(10000);

    // Draw outer ellipse (full radiusX and radiusY)
    const outerEllipse = this.scene.add.ellipse(
      scaledConfig.centerX,
      scaledConfig.centerY,
      scaledConfig.radiusX * 2, // diameter = radius * 2
      scaledConfig.radiusY * 2,
      0x00ff00,
      0
    );
    outerEllipse.setStrokeStyle(2, 0x00ff00, 1);
    outerEllipse.setDepth(10000);

    // Draw min spawn radius ellipse (inner boundary)
    const minRadius = scaledConfig.minSpawnRadius;
    const minRadiusX = (minRadius / scaledConfig.radiusY) * scaledConfig.radiusX;
    const minEllipse = this.scene.add.ellipse(
      scaledConfig.centerX,
      scaledConfig.centerY,
      minRadiusX * 2,
      minRadius * 2,
      0xff0000,
      0
    );
    minEllipse.setStrokeStyle(2, 0xff0000, 1);
    minEllipse.setDepth(10000);

    // Draw max spawn radius ellipse (outer boundary)
    const maxRadius = scaledConfig.maxSpawnRadius;
    const maxRadiusX = (maxRadius / scaledConfig.radiusY) * scaledConfig.radiusX;
    const maxEllipse = this.scene.add.ellipse(
      scaledConfig.centerX,
      scaledConfig.centerY,
      maxRadiusX * 2,
      maxRadius * 2,
      0x0000ff,
      0
    );
    maxEllipse.setStrokeStyle(2, 0x0000ff, 1);
    maxEllipse.setDepth(10000);

    // Add labels
    const labelY = scaledConfig.centerY - scaledConfig.radiusY - 10;
    const label = this.scene.add.text(
      scaledConfig.centerX,
      labelY,
      `Spawn Ellipse\nCenter: (${scaledConfig.centerX}, ${scaledConfig.centerY})\nRadius: (${scaledConfig.radiusX}, ${scaledConfig.radiusY})`,
      {
        fontFamily: "jersey",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 1,
        align: "center",
        resolution: 40,
      }
    );
    label.setOrigin(0.5, 1);
    label.setDepth(10000);

    logger.game.info(`[DEBUG] Ellipse drawn - Green=Full, Red=Min, Blue=Max`);
  }
}
