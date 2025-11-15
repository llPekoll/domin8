import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { logger } from "../../lib/logger";

/**
 * OneVOneScene - 1v1 Coinflip fight scene
 *
 * Features:
 * - 2 players (Player A vs Player B)
 * - Fixed background
 * - 3 phases: loading → battle → results
 * - Reuses PlayerManager, AnimationManager, BackgroundManager
 * - Polls Convex for lobby state updates
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
  private audioUnlocked: boolean = false;

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

    // Set background to a fixed arena (bg1 for now)
    this.backgroundManager.setBackgroundById(1);

    // Initialize SoundManager
    SoundManager.initialize();

    // Setup audio unlock
    this.setupAudioUnlock();

    // Create UI text elements
    this.createUI();

    // Emit scene ready event
    EventBus.emit("current-scene-ready", this);

    logger.game.debug("[OneVOneScene] Scene created and ready");
  }

  private createUI() {
    // Loading text (shown initially)
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

    // Result text (shown after fight)
    this.resultText = this.add.text(this.centerX, this.centerY, "Victory!", {
      fontFamily: "metal-slug",
      fontSize: "32px",
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 4,
    });
    this.resultText.setOrigin(0.5);
    this.resultText.setScrollFactor(0);
    this.resultText.setDepth(1000);
    this.resultText.setVisible(false);
  }

  /**
   * Start a 1v1 fight with the given data
   * This is called from the React component after blockchain confirmation
   */
  public startFight(data: FightData) {
    if (this.fightStarted) {
      logger.game.warn("[OneVOneScene] Fight already in progress");
      return;
    }

    logger.game.debug("[OneVOneScene] Starting 1v1 fight", data);

    this.fightData = data;
    this.fightStarted = true;

    // Hide loading UI
    this.loadingText.setVisible(false);

    // Show battle text
    this.battleText.setVisible(true);

    // Play challenger sound for dramatic entrance
    SoundManager.playChallenger(this, 0.8);

    // Create map data for 1v1 (simple centered arena)
    const oneVOneMapData = {
      spawnConfiguration: {
        centerX: this.centerX,
        centerY: this.centerY,
        radiusX: this.centerX * 0.4, // Compact spawn radius for 1v1
        radiusY: this.centerY * 0.3,
        minSpawnRadius: 0,
        maxSpawnRadius: 100,
        minSpacing: 50,
      },
    };

    // Set map data on player manager
    this.playerManager.setMapData(oneVOneMapData);

    // Create participants for Player A
    const participantA = {
      _id: `${data.playerA}_1v1_a`,
      playerId: data.playerA,
      displayName: "Player A",
      character: {
        id: data.characterA,
        name: `Character ${data.characterA}`,
        key: `character_${data.characterA}`,
      },
      spawnIndex: 0, // Left position
      isBot: false,
      eliminated: false,
      size: 1.2, // Slightly larger for visibility
    };

    // Create participants for Player B
    const participantB = {
      _id: `${data.playerB}_1v1_b`,
      playerId: data.playerB,
      displayName: "Player B",
      character: {
        id: data.characterB,
        name: `Character ${data.characterB}`,
        key: `character_${data.characterB}`,
      },
      spawnIndex: 1, // Right position (opposite side)
      isBot: false,
      eliminated: false,
      size: 1.2, // Slightly larger for visibility
    };

    // Spawn characters - this will handle falling animation automatically
    this.playerManager.addParticipant(participantA);
    this.playerManager.addParticipant(participantB);

    // After characters land (400ms), play dramatic entrance
    this.time.delayedCall(600, () => {
      this.playEntranceAnimation();
    });

    // Start battle animation sequence
    this.time.delayedCall(1500, () => {
      this.runBattle();
    });

    // Start battle music
    this.tryStartMusic();
  }

  private playEntranceAnimation() {
    logger.game.debug("[OneVOneScene] Playing entrance animation");

    const participants = Array.from(this.playerManager.getParticipants().values());

    // Play run animation for both players towards center
    participants.forEach((participant) => {
      const runAnimKey = `${participant.characterKey}-run`;
      if (this.anims.exists(runAnimKey)) {
        participant.sprite.play(runAnimKey);
      }

      // Shake screen when they start charging
      this.cameras.main.shake(200, 0.01);
    });

    // Play a dramatic sound effect
    SoundManager.playInsertCoin(this, 0.6);
  }

  private runBattle() {
    logger.game.debug("[OneVOneScene] Running battle animation");

    // Move participants to center for combat
    this.playerManager.moveParticipantsToCenter();

    // Use AnimationManager's comprehensive battle sequence
    this.animationManager.startBattlePhaseSequence(this.playerManager, () => {
      // Battle phase complete callback
      logger.game.debug("[OneVOneScene] Battle phase sequence complete");
    });

    // After battle phase (~4 seconds), show results
    this.time.delayedCall(4500, () => {
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
      this.animationManager.startResultsPhaseSequence(
        this.playerManager,
        winnerParticipant,
        () => {
          logger.game.debug(
            "[OneVOneScene] Results phase complete, emitting completion event"
          );

          // Emit completion event to React component
          this.time.delayedCall(1000, () => {
            logger.game.debug("[OneVOneScene] 1v1 fight completed, emitting completion event");
            EventBus.emit("1v1-complete");

            // Clean up
            this.cleanup();
          });
        }
      );

      // Show result text with winner info (shorter text for 1v1)
      this.resultText.setVisible(true);
      this.resultText.setText("🎉 Victory!");
    } else {
      logger.game.error("[OneVOneScene] Could not determine winner");
      // Still emit completion but with error
      this.resultText.setVisible(true);
      this.resultText.setText("Fight Complete");

      this.time.delayedCall(3000, () => {
        EventBus.emit("1v1-complete");
        this.cleanup();
      });
    }
  }

  private cleanup() {
    logger.game.debug("[OneVOneScene] Cleaning up scene");

    // Clear participants
    this.playerManager.clearParticipants();
    this.animationManager.clearCelebration();

    // Reset state
    this.fightData = null;
    this.fightStarted = false;

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

    // Clean up
    this.cleanup();
  }

  update() {}
}
