import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { logger } from "../../lib/logger";
import { RESOLUTION_SCALE, charactersData, allMapsData } from "../main";

/**
 * OneVOneScene - 1v1 Coinflip fight scene
 *
 * Features:
 * - 2 players (Player A vs Player B)
 * - Fixed background
 * - 3 phases: waiting → battle → results
 * - Reuses PlayerManager, AnimationManager, BackgroundManager
 * - Supports modal-based workflow with single character spawn
 */

interface FightData {
  lobbyId: number;
  playerA: string;
  playerB: string;
  characterA: number;
  characterB: number;
  winner: string; // Winner's wallet address
  mapId: number;
}

interface SingleCharacterData {
  playerId: string;
  characterId: number;
  position: "left" | "right";
  displayName: string;
}

export class OneVOneScene extends Scene {
  camera!: Phaser.Cameras.Scene2D.Camera;
  centerX: number = 0;
  centerY: number = 0;

  // Managers
  private playerManager!: PlayerManager;
  private animationManager!: AnimationManager;
  private backgroundManager!: BackgroundManager;

  // Scene state
  private fightData: FightData | null = null;
  private fightStarted: boolean = false;
  private battleMusic: Phaser.Sound.BaseSound | null = null;
  private fireSounds: Phaser.Sound.BaseSound | null = null;
  private audioUnlocked: boolean = false;
  private spawnedCharacters: Set<string> = new Set();
  private currentMapData: any = null;

  // UI elements
  private loadingText!: Phaser.GameObjects.Text;
  private battleText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  constructor() {
    super("OneVOne");
  }

  create() {
    this.camera = this.cameras.main;
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    // Initialize managers
    this.playerManager = new PlayerManager(this, this.centerX, this.centerY);
    this.animationManager = new AnimationManager(this, this.centerX, this.centerY);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY);

    // Set background to default arena (bg1) - will be updated if fight data specifies different map
    const defaultMapId = 1;
    this.backgroundManager.setBackgroundById(defaultMapId);

    // Get real map data from allMapsData
    this.currentMapData = allMapsData.find((map: any) => map.id === defaultMapId);
    if (!this.currentMapData) {
      logger.game.warn("[OneVOneScene] Map not found, using first available map");
      this.currentMapData = allMapsData[0];
    }

    // Use real map spawn configuration
    if (this.currentMapData) {
      this.playerManager.setMapData(this.currentMapData);
    }

    // Initialize SoundManager
    SoundManager.initialize();

    // Setup audio unlock
    this.setupAudioUnlock();

    // Create UI text elements
    this.createUI();

    // Emit scene ready event
    EventBus.emit("current-scene-ready", this);
  }

  private createUI() {
    // Loading text (shown initially) - hidden by default for modal workflow
    this.loadingText = this.add.text(this.centerX, this.centerY - 40, "Loading fight...", {
      fontFamily: "metal-slug",
      fontSize: "20px",
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 4,
    });
    this.loadingText.setOrigin(0.5);
    this.loadingText.setScrollFactor(0);
    this.loadingText.setDepth(1000);
    this.loadingText.setVisible(false); // Hidden by default

    // Battle text (shown during fight)
    this.battleText = this.add.text(this.centerX, this.centerY - 40, "⚔️ 1v1 FIGHT!", {
      fontFamily: "metal-slug",
      fontSize: "24px",
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 4,
    });
    this.battleText.setOrigin(0.5);
    this.battleText.setScrollFactor(0);
    this.battleText.setDepth(1000);
    this.battleText.setVisible(false);

    // Result text - winner name at bottom of screen
    this.resultText = this.add.text(this.centerX, this.cameras.main.height - 60, "", {
      fontFamily: "metal-slug",
      fontSize: "36px",
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 4,
      resolution: 4,
    });
    this.resultText.setOrigin(0.5);
    this.resultText.setScrollFactor(0);
    this.resultText.setDepth(2000);
    this.resultText.setVisible(false);
  }

  /**
   * Set the map for the 1v1 arena
   * Called from React to update the map before spawning characters
   */
  public setMap(mapId: number) {
    if (this.currentMapData?.id === mapId) {
      return; // Already set to this map
    }

    const newMapData = allMapsData.find((map: any) => map.id === mapId);
    if (newMapData) {
      this.currentMapData = newMapData;
      this.backgroundManager.setBackgroundById(mapId);
      this.playerManager.setMapData(this.currentMapData);
      logger.game.debug("[OneVOneScene] Map set to", mapId, newMapData.name);
    } else {
      logger.game.warn("[OneVOneScene] Map not found:", mapId);
    }
  }

  /**
   * Spawn a single character in the arena (for waiting/joining states)
   * This is called from React when a lobby is created or joined
   * Characters are spawned face-to-face on left and right sides of the arena
   */
  public spawnSingleCharacter(data: SingleCharacterData) {
    // Debug: Log what we receive and what we find
    console.log("[1v1 Debug] OneVOneScene.spawnSingleCharacter - received:", {
      playerId: data.playerId,
      characterId: data.characterId,
      position: data.position,
    });
    console.log("[1v1 Debug] charactersData available:", charactersData.map((c: any) => ({
      id: c.id,
      name: c.name,
    })));

    // Look up character name from charactersData by ID
    const characterData = charactersData.find((c: any) => c.id === data.characterId);

    console.log("[1v1 Debug] Character lookup result:", {
      searchedId: data.characterId,
      foundCharacter: characterData ? { id: characterData.id, name: characterData.name } : null,
    });

    const characterName = characterData?.name || `character_${data.characterId}`;
    const characterKey = characterName.toLowerCase().replace(/\s+/g, "-");

    // Prevent duplicate spawns
    if (this.spawnedCharacters.has(data.playerId)) {
      return;
    }

    // Get arena dimensions from real map spawn configuration
    const spawnConfig = this.currentMapData?.spawnConfiguration;
    const arenaCenterX = spawnConfig ? spawnConfig.centerX * RESOLUTION_SCALE : this.centerX;
    const arenaCenterY = spawnConfig ? spawnConfig.centerY * RESOLUTION_SCALE : this.centerY;
    const arenaRadiusX = spawnConfig ? spawnConfig.radiusX * RESOLUTION_SCALE : this.centerX * 0.5;
    const arenaRadiusY = spawnConfig ? spawnConfig.radiusY * RESOLUTION_SCALE : this.centerY * 0.3;

    // Position characters on the arena floor, spread apart horizontally
    const spawnOffsetX = 0.75; // 75% of horizontal radius (further apart)
    const spawnOffsetY = 0.45; // 45% down the vertical radius (higher on arena)

    let targetX: number;
    let targetY: number;
    let flipX: boolean;

    if (data.position === "left") {
      // Left side - facing right
      targetX = arenaCenterX - arenaRadiusX * spawnOffsetX;
      targetY = arenaCenterY + arenaRadiusY * spawnOffsetY;
      flipX = false; // Face right
    } else {
      // Right side - facing left
      targetX = arenaCenterX + arenaRadiusX * spawnOffsetX;
      targetY = arenaCenterY + arenaRadiusY * spawnOffsetY;
      flipX = true; // Face left
    }

    // Create participant data with explicit position
    const participant = {
      _id: `${data.playerId}_1v1`,
      playerId: data.playerId,
      displayName: data.displayName,
      character: {
        id: data.characterId,
        name: characterName,
        key: characterKey,
      },
      spawnIndex: data.position === "left" ? 0 : 1,
      isBot: false,
      eliminated: false,
      size: 1.5 * RESOLUTION_SCALE, // Slightly larger for visibility
      betAmount: 0,
      // Custom 1v1 position data
      explicitPosition: { x: targetX, y: targetY },
      flipX: flipX,
    };

    // Spawn the character with explicit position
    this.spawnCharacterAtPosition(participant);
    this.spawnedCharacters.add(data.playerId);

    // Play challenger sound for dramatic entrance
    SoundManager.playChallenger(this, 0.8);
  }

  /**
   * Spawn a character at an explicit position (for 1v1 face-to-face positioning)
   * Uses containers like PlayerManager for proper animation support
   */
  private spawnCharacterAtPosition(participant: any) {
    const { explicitPosition, flipX } = participant;
    const characterKey = participant.character.key;

    // Calculate fall start position - fall from arena center height
    const spawnConfig = this.currentMapData?.spawnConfiguration;
    const arenaCenterY = spawnConfig ? spawnConfig.centerY * RESOLUTION_SCALE : this.centerY;
    const startX = explicitPosition.x;
    const startY = arenaCenterY; // Start from arena center, fall down to floor position

    // Create container at start position (like PlayerManager)
    const container = this.add.container(startX, startY);

    // Set depth based on target Y position
    const baseDepth = 100;
    const depthFromY = Math.floor(explicitPosition.y);
    container.setDepth(baseDepth + depthFromY);

    // Check texture exists
    let textureKey = characterKey;
    if (!this.textures.exists(characterKey)) {
      textureKey = "warrior";
    }

    // Create sprite inside container at origin (0, 0)
    const sprite = this.add.sprite(0, 0, textureKey);
    sprite.setOrigin(0.5, 1); // Bottom-center origin
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Apply scale
    const scale = participant.size * 0.8; // Slightly smaller for 1v1
    sprite.setScale(scale);

    // Apply flip for facing direction
    sprite.setFlipX(flipX);

    // Play falling animation
    const fallingAnimKey = `${textureKey}-falling`;
    if (this.anims.exists(fallingAnimKey)) {
      sprite.play(fallingAnimKey);
    }

    // Create player name at top of screen (fighting game style)
    const isLeftPlayer = participant.spawnIndex === 0;
    const nameX = isLeftPlayer ? 80 : this.cameras.main.width - 80;
    const nameY = 40;

    const nameText = this.add.text(nameX, nameY, participant.displayName.toUpperCase(), {
      fontFamily: "metal-slug",
      fontSize: "28px",
      color: isLeftPlayer ? "#FFD700" : "#FF4444",
      stroke: "#000000",
      strokeThickness: 4,
      resolution: 4,
      align: "center",
    });
    nameText.setOrigin(isLeftPlayer ? 0 : 1, 0.5); // Left-align for P1, right-align for P2
    nameText.setScrollFactor(0); // Fixed to camera
    nameText.setDepth(2000); // Above everything

    // Add only sprite to container (name is separate UI element)
    container.add(sprite);

    // Store in PlayerManager with container (matching PlayerManager's GameParticipant structure)
    const gameParticipant = {
      id: participant._id,
      playerId: participant.playerId,
      container,
      sprite,
      nameText,
      characterKey: textureKey,
      displayName: participant.displayName,
      betAmount: participant.betAmount || 0,
      size: scale,
      isBot: false,
      eliminated: false,
      targetX: explicitPosition.x,
      targetY: explicitPosition.y,
      spawnIndex: participant.spawnIndex,
      flipX,
    };

    this.playerManager.getParticipants().set(participant._id, gameParticipant);

    // Animate container falling
    this.tweens.add({
      targets: container,
      y: explicitPosition.y,
      duration: 250,
      ease: "Cubic.easeIn",
      onComplete: () => {
        // Play impact sound
        SoundManager.playRandomImpact(this, 0.4);

        // Play landing animation, then idle
        const landingAnimKey = `${textureKey}-landing`;
        if (this.anims.exists(landingAnimKey)) {
          sprite.play(landingAnimKey);
          sprite.once("animationcomplete", () => {
            const idleAnimKey = `${textureKey}-idle`;
            if (sprite && sprite.active && this.anims.exists(idleAnimKey)) {
              sprite.play(idleAnimKey);
            }
          });
        } else {
          // No landing animation, go straight to idle
          const idleAnimKey = `${textureKey}-idle`;
          if (this.anims.exists(idleAnimKey)) {
            sprite.play(idleAnimKey);
          }
        }
      },
    });
  }

  /**
   * Start a 1v1 fight with the given data (legacy method - redirects to startFightAnimation)
   * This is called from the React component after blockchain confirmation
   */
  public startFight(data: FightData) {
    this.startFightAnimation(data);
  }

  /**
   * Start the fight animation sequence
   * Called when both players are ready and winner is determined
   */
  public startFightAnimation(data: FightData) {
    if (this.fightStarted) {
      return;
    }

    // Update map if fight data specifies a different mapId
    if (data.mapId && data.mapId !== this.currentMapData?.id) {
      const newMapData = allMapsData.find((map: any) => map.id === data.mapId);
      if (newMapData) {
        this.currentMapData = newMapData;
        this.backgroundManager.setBackgroundById(data.mapId);
        this.playerManager.setMapData(this.currentMapData);
        logger.game.debug("[OneVOneScene] Updated map to", data.mapId);
      }
    }

    this.fightData = data;
    this.fightStarted = true;

    // Hide loading UI
    this.loadingText.setVisible(false);

    // Show battle text
    this.battleText.setVisible(true);

    // Check if characters are already spawned (modal workflow)
    const existingParticipants = this.playerManager.getParticipants();
    const hasExistingCharacters = existingParticipants.size > 0;

    if (!hasExistingCharacters) {
      // Legacy flow: spawn both characters now

      // Look up character names from charactersData
      const charDataA = charactersData.find((c: any) => c.id === data.characterA);
      const charNameA = charDataA?.name || `character_${data.characterA}`;
      const charKeyA = charNameA.toLowerCase().replace(/\s+/g, "-");

      const charDataB = charactersData.find((c: any) => c.id === data.characterB);
      const charNameB = charDataB?.name || `character_${data.characterB}`;
      const charKeyB = charNameB.toLowerCase().replace(/\s+/g, "-");

      // Create participants for Player A
      const participantA = {
        _id: `${data.playerA}_1v1`,
        playerId: data.playerA,
        displayName: "Player A",
        character: {
          id: data.characterA,
          name: charNameA,
          key: charKeyA,
        },
        spawnIndex: 0,
        isBot: false,
        eliminated: false,
        size: 1.5 * RESOLUTION_SCALE,
        betAmount: 0,
      };

      // Create participants for Player B
      const participantB = {
        _id: `${data.playerB}_1v1`,
        playerId: data.playerB,
        displayName: "Player B",
        character: {
          id: data.characterB,
          name: charNameB,
          key: charKeyB,
        },
        spawnIndex: 1,
        isBot: false,
        eliminated: false,
        size: 1.5 * RESOLUTION_SCALE,
        betAmount: 0,
      };

      // Spawn characters
      this.playerManager.addParticipant(participantA);
      this.playerManager.addParticipant(participantB);

      // Play challenger sound
      SoundManager.playChallenger(this, 0.8);

      // After characters land, start battle (single movement to center)
      this.time.delayedCall(800, () => {
        this.runBattle();
      });
    } else {
      // Modal workflow: characters already spawned, start fight immediately
      logger.game.debug("[OneVOneScene] Characters exist, starting fight sequence");

      // Start battle after delay - let players see characters face-to-face first
      this.time.delayedCall(1500, () => {
        this.runBattle();
      });
    }

    // Start battle music
    this.tryStartMusic();
  }

  private runBattle() {
    const participants = Array.from(this.playerManager.getParticipants().values());

    // Play sound effect
    SoundManager.playInsertCoin(this, 0.6);

    // Move participants to center for combat collision
    participants.forEach((participant) => {
      // Play run animation while moving
      const runAnimKey = `${participant.characterKey}-run`;
      if (this.anims.exists(runAnimKey)) {
        participant.sprite.play(runAnimKey);
      }

      // Single movement from spawn position to center
      this.tweens.add({
        targets: participant.container,
        x: this.centerX + (Math.random() - 0.5) * 30,
        y: this.centerY + 50 + (Math.random() - 0.5) * 20,
        duration: 350,
        ease: "Power2.easeIn",
      });
    });

    // Play explosion and blood effects when characters collide
    this.time.delayedCall(250, () => {
      // Explosion effect
      const explosion = this.add.sprite(this.centerX, this.centerY, "explosion-fullscreen");
      explosion.setScale(RESOLUTION_SCALE);
      explosion.setDepth(1550);
      explosion.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

      if (this.anims.exists("explosion-fullscreen")) {
        explosion.play("explosion-fullscreen");
        SoundManager.playExplosion(this, 0.8);
      }

      explosion.once("animationcomplete", () => {
        explosion.destroy();
      });

      // Blood effects when characters collide
      this.animationManager.createDirectionalBloodEffects();
    });

    // Screen shake
    this.cameras.main.shake(400, 0.015);

    // After battle phase, show results and kick out loser
    this.time.delayedCall(2500, () => {
      this.showResults();
    });
  }

  private showResults() {
    logger.game.debug("[OneVOneScene] Showing fight results", this.fightData);

    if (!this.fightData) {
      logger.game.error("[OneVOneScene] No fight data available");
      return;
    }

    // Hide battle text
    this.battleText.setVisible(false);

    // Find the winner participant
    const players = Array.from(this.playerManager.getParticipants().values());
    let winnerParticipant: any = null;

    // Find the winner based on wallet address
    players.forEach((participant) => {
      if (
        (participant.playerId === this.fightData!.playerA &&
          this.fightData!.playerA === this.fightData!.winner) ||
        (participant.playerId === this.fightData!.playerB &&
          this.fightData!.playerB === this.fightData!.winner)
      ) {
        winnerParticipant = participant;
      }
    });

    if (winnerParticipant) {
      logger.game.debug("[OneVOneScene] Winner found:", winnerParticipant.playerId);

      // Use AnimationManager's comprehensive results phase sequence
      // This handles: elimination marks, explosions, blood, winner celebration, confetti
      this.animationManager.startResultsPhaseSequence(this.playerManager, winnerParticipant, () => {
        logger.game.debug("[OneVOneScene] Results phase complete, emitting completion event");

        // Emit completion event to React component
        this.time.delayedCall(1000, () => {
          logger.game.debug("[OneVOneScene] 1v1 fight completed, emitting completion event");
          EventBus.emit("1v1-complete");

          // Clean up (don't auto-cleanup - let React handle it via modal close)
          // this.internalCleanup();
        });
      });

      // Show winner name at bottom of screen
      this.resultText.setVisible(true);
      this.resultText.setText(`👑 ${winnerParticipant.displayName.toUpperCase()} WINS!`);

      // Emit results event immediately so React can show buttons
      EventBus.emit("1v1-results-ready");
    } else {
      logger.game.error("[OneVOneScene] Could not determine winner");
      // Still emit completion but with error
      this.resultText.setVisible(true);
      this.resultText.setText("DRAW");

      this.time.delayedCall(3000, () => {
        EventBus.emit("1v1-complete");
        // Don't auto-cleanup - let React handle it
        // this.internalCleanup();
      });
    }
  }

  /**
   * Clean up the scene state (public method for React to call)
   */
  public cleanup() {
    logger.game.debug("[OneVOneScene] Cleaning up scene");

    // Clear participants
    this.playerManager.clearParticipants();
    this.animationManager.clearCelebration();

    // Reset state
    this.fightData = null;
    this.fightStarted = false;
    this.spawnedCharacters.clear();

    // Hide all UI
    this.loadingText.setVisible(false);
    this.battleText.setVisible(false);
    this.resultText.setVisible(false);

    // Stop music
    if (this.battleMusic) {
      this.battleMusic.stop();
      this.battleMusic = null;
    }
  }

  private setupAudioUnlock() {
    // Apply mute state from SoundManager
    SoundManager.applyMuteToScene(this);

    // Set up click handler to unlock audio on first interaction
    const unlockHandler = async () => {
      if (!this.audioUnlocked) {
        this.audioUnlocked = true;

        await SoundManager.unlockAudio(this).then(() => {
          this.tryStartMusic();
        });

        // Remove the handler after first interaction
        this.input.off("pointerdown", unlockHandler);
      }
    };

    // Listen for any pointer/touch interaction
    this.input.on("pointerdown", unlockHandler);

    // Also try to start music immediately (will work if already unlocked)
    this.tryStartMusic();
  }

  private tryStartMusic() {
    if (!this.battleMusic) {
      try {
        // Check if audio file is loaded
        if (!this.cache.audio.exists("battle-theme")) {
          logger.game.warn("[OneVOneScene] battle-theme audio not loaded");
          return;
        }

        // Use SoundManager to play battle music
        this.battleMusic = SoundManager.play(this, "battle-theme", 0.2, {
          loop: true,
        });

        // Register with SoundManager
        SoundManager.setBattleMusic(this.battleMusic);

        // Also play fire sounds alongside battle theme
        if (this.cache.audio.exists("fire-sounds")) {
          this.fireSounds = SoundManager.play(this, "fire-sounds", 0.15, {
            loop: true,
          });
          // Register with SoundManager for centralized control
          SoundManager.setFireSounds(this.fireSounds);
        }
      } catch (e) {
        logger.game.error("[OneVOneScene] Failed to start battle music:", e);
      }
    }
  }

  shutdown() {
    logger.game.debug("[OneVOneScene] Scene shutting down");

    // Stop music
    if (this.battleMusic) {
      this.battleMusic.stop();
      this.battleMusic = null;
      SoundManager.setBattleMusic(null);
    }
    if (this.fireSounds) {
      this.fireSounds.stop();
      this.fireSounds = null;
      SoundManager.setFireSounds(null);
    }

    // Clean up
    this.cleanup();
  }

  update() {}
}
