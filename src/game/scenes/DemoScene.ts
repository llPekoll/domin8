import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { demoMapData, charactersData } from "../main";
import { logger } from "../../lib/logger";
import {
  generateDemoParticipant,
  generateDemoWinner,
  generateRandomSpawnIntervals,
  DEMO_PARTICIPANT_COUNT,
} from "../../lib/demoGenerator";
import { DEMO_TIMINGS } from "../../config/demoTimings";
import { generateRandomEllipsePositions } from "../../config/spawnConfig";

/**
 * DemoScene - Pure client-side demo mode
 *
 * Features:
 * - 20 bots spawning with random timing
 * - Random map selection
 * - 3 phases: spawning (30s) → arena (3s) → results (5s)
 * - Auto-restart loop
 * - No database calls, no blockchain
 * - Listens to GamePhaseManager: active when phase === IDLE
 */

type DemoPhase = "spawning" | "arena" | "results";

export class DemoScene extends Scene {
  camera!: Phaser.Cameras.Scene2D.Camera;
  centerX: number = 0;
  centerY: number = 0;

  // Managers
  private playerManager!: PlayerManager;
  private animationManager!: AnimationManager;
  private backgroundManager!: BackgroundManager;

  // Demo state
  private participants: any[] = [];
  private isActive: boolean = true; // Start with demo active
  private demoPhase: DemoPhase = "spawning";
  private countdown: number = 30;
  private shuffledPositions: Array<{ x: number; y: number }> = [];
  private spawnTimeouts: NodeJS.Timeout[] = [];
  private spawnCount: number = 0;
  private isSpawning: boolean = false;

  // Timers
  private countdownTimer?: Phaser.Time.TimerEvent;

  private battleMusic: Phaser.Sound.BaseSound | null = null;
  private audioUnlocked: boolean = false;
  private introPlayed: boolean = false;

  // Demo UI elements
  private demoUIContainer!: Phaser.GameObjects.Container;
  private insertCoinText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;

  constructor() {
    super("Demo");
  }

  create() {
    logger.game.debug("[DemoScene] 🎮 DemoScene created and ready");
    this.camera = this.cameras.main;
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    this.playerManager = new PlayerManager(this, this.centerX, this.centerY);
    this.animationManager = new AnimationManager(this, this.centerX, this.centerY);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY + 200);

    // Initialize background immediately with preloaded demo map
    if (demoMapData?.background) {
      logger.game.debug("[DemoScene] Initializing background with:", demoMapData.background);
      this.backgroundManager.setTexture(demoMapData.background);
    } else {
      logger.game.warn("[DemoScene] No demo map data available!");
    }

    this.scale.on("resize", () => this.handleResize(), this);
    EventBus.emit("current-scene-ready", this);

    // Initialize SoundManager
    SoundManager.initialize();

    // Set up audio unlock on first user interaction
    this.setupAudioUnlock();

    // Listen for insert coin event from React UI
    EventBus.on("play-insert-coin-sound", () => {
      SoundManager.playInsertCoin(this);
    });

    // Listen for player bet placement to spawn character immediately
    EventBus.on(
      "player-bet-placed",
      (data: {
        characterId: number;
        characterName: string;
        position: [number, number];
        betAmount: number;
        roundId: number;
        betIndex: number;
        walletAddress: string;
      }) => {
        logger.game.debug("[DemoScene] 🎯 RECEIVED player-bet-placed EVENT");
        logger.game.debug("[DemoScene] Event data:", data);

        // Derive character key from character name (e.g., "Warrior" -> "warrior")
        const characterKey = data.characterName?.toLowerCase().replace(/\s+/g, "-") || "warrior";

        // Transform the data into the format expected by PlayerManager
        const participant = {
          _id: `${data.walletAddress}_${data.betIndex}`, // Unique ID combining wallet + bet index
          playerId: data.walletAddress,
          displayName: data.characterName || "Player",
          betAmount: data.betAmount,
          character: {
            key: characterKey, // Derived sprite key
            name: data.characterName,
            id: data.characterId, // Store blockchain numeric ID for reference
          },
          spawnIndex: data.betIndex, // Use bet index as spawn index
          isBot: false, // This is a real player
          eliminated: false,
          colorHue: undefined, // Will be assigned by backend if needed
        };

        // Spawn the character in the demo scene
        this.spawnDemoParticipant(participant);
      }
    );

    // Create demo UI
    this.createDemoUI();

    // Start demo mode
    this.startDemoMode();
  }

  private startDemoMode() {
    logger.game.debug("[DemoScene] 🎮 Starting demo mode");
    this.isActive = true;
    this.countdown = DEMO_TIMINGS.SPAWNING_PHASE_DURATION / 1000;
    this.demoPhase = "spawning";
    this.participants = [];
    this.spawnCount = 0;
    this.isSpawning = false;

    // Clear any existing spawns
    this.clearAllDemoState();

    // Generate random positions
    this.shuffledPositions = generateRandomEllipsePositions(
      DEMO_PARTICIPANT_COUNT,
      this.centerX,
      this.centerY
    );

    logger.game.debug("[DemoScene] Positions generated:", this.shuffledPositions.length);

    // Update UI
    this.updateDemoUI(this.demoPhase, this.countdown, 0);

    // Start countdown timer
    this.startCountdownTimer();

    // Start spawning bots
    this.startBotSpawning();
  }

  private stopDemoMode() {
    logger.game.debug("[DemoScene] 🛑 Stopping demo mode");
    this.isActive = false;
    this.clearAllDemoState();

    // Hide demo UI
    if (this.demoUIContainer) {
      this.demoUIContainer.setVisible(false);
    }
  }

  private clearAllDemoState() {
    // Clear timers
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
      this.countdownTimer = undefined;
    }

    // Clear spawn timeouts
    this.spawnTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.spawnTimeouts = [];

    // Clear participants
    this.clearDemoParticipants();

    this.isSpawning = false;
    this.spawnCount = 0;
  }

  private startCountdownTimer() {
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }

    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!this.isActive || this.demoPhase !== "spawning") return;

        this.countdown--;
        this.updateDemoUI(this.demoPhase, this.countdown, this.participants.length);

        if (this.countdown <= 0) {
          // Transition to arena phase
          this.transitionToArenaPhase();
        }
      },
      loop: true,
    });
  }

  private startBotSpawning() {
    if (this.isSpawning || !charactersData || charactersData.length === 0) {
      logger.game.warn("[DemoScene] Cannot start spawning:", {
        isSpawning: this.isSpawning,
        hasCharacters: !!charactersData,
      });
      return;
    }

    logger.game.debug("[DemoScene] Starting bot spawn sequence");
    this.isSpawning = true;

    // Generate random spawn intervals
    const spawnIntervals = generateRandomSpawnIntervals(DEMO_PARTICIPANT_COUNT);

    let cumulativeTime = 0;
    spawnIntervals.forEach((interval, index) => {
      cumulativeTime += interval;

      const timeout = setTimeout(() => {
        if (!this.isActive || this.spawnCount >= DEMO_PARTICIPANT_COUNT) return;

        const position = this.shuffledPositions[this.spawnCount];
        if (!position) {
          logger.game.error(`[DemoScene] No position at index ${this.spawnCount}`);
          return;
        }

        const participant = generateDemoParticipant(
          this.spawnCount,
          charactersData,
          position
        );

        this.spawnDemoParticipant(participant);
        this.spawnCount++;
        this.updateDemoUI(this.demoPhase, this.countdown, this.participants.length);
      }, cumulativeTime);

      this.spawnTimeouts.push(timeout);
    });
  }

  private transitionToArenaPhase() {
    logger.game.debug("[DemoScene] ⚔️ Transitioning to arena phase");
    this.demoPhase = "arena";
    this.updateDemoUI(this.demoPhase, 0, this.participants.length);

    // Move participants to center for battle
    this.moveParticipantsToCenter();

    // After 3 seconds, show results
    this.time.delayedCall(DEMO_TIMINGS.ARENA_PHASE_DURATION, () => {
      this.transitionToResultsPhase();
    });
  }

  private transitionToResultsPhase() {
    logger.game.debug("[DemoScene] 🏆 Transitioning to results phase");
    this.demoPhase = "results";
    this.updateDemoUI(this.demoPhase, 0, this.participants.length);

    // Pick random winner
    const winner = generateDemoWinner(this.participants);
    if (winner) {
      this.showDemoWinner(winner);
    }

    // After 5 seconds, restart demo
    this.time.delayedCall(DEMO_TIMINGS.RESULTS_PHASE_DURATION, () => {
      if (this.isActive) {
        this.startDemoMode(); // Restart the loop
      }
    });
  }

  private createDemoUI() {
    // Create container for all UI elements - bottom 1/3 of screen
    const bottomThirdY = this.camera.height * 0.75; // 75% down the screen
    this.demoUIContainer = this.add.container(this.centerX, bottomThirdY);
    this.demoUIContainer.setDepth(1000);
    this.demoUIContainer.setScrollFactor(0);

    // "INSERT COIN!" text - much bigger and centered
    this.insertCoinText = this.add.text(0, 0, "INSERT COIN!", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "64px",
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 6,
    });
    // this.insertCoinText.setAlpha(0);
    this.insertCoinText.setOrigin(0.5);

    // Countdown text - bigger and centered below INSERT COIN
    this.countdownText = this.add.text(0, 110, "30", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "96px",
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 8,
    });
    this.countdownText.setOrigin(0.5);

    // Phase text (Battle Royale / Winner Crowned) - bigger and centered
    this.phaseText = this.add.text(0, 0, "", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "48px",
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 5,
    });
    this.phaseText.setOrigin(0.5);

    // Sub text (participant count / restarting info) - bigger and centered
    this.subText = this.add.text(0, 70, "", {
      fontFamily: "metal-slug, Arial, sans-serif",
      fontSize: "28px",
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.subText.setOrigin(0.5);

    // Add to container
    this.demoUIContainer.add([
      this.insertCoinText,
      this.countdownText,
      this.phaseText,
      this.subText,
    ]);

    // Add instant blink animation to INSERT COIN text (no fade)
    // Stays visible longer (1000ms), then briefly disappears (300ms)
    const blinkCycle = () => {
      // Start visible for 1000ms
      this.insertCoinText.setAlpha(1);
      this.time.delayedCall(1000, () => {
        // Hide for 300ms
        this.insertCoinText.setAlpha(0);
        this.time.delayedCall(300, () => {
          // Repeat the cycle
          blinkCycle();
        });
      });
    };
    blinkCycle();

    // Start with spawning phase visible
    this.updateDemoUI("spawning", 30, 0);
  }

  public updateDemoUI(
    phase: "spawning" | "arena" | "results",
    countdown: number,
    participantCount: number
  ) {
    if (!this.demoUIContainer) return;

    if (phase === "spawning") {
      // Show INSERT COIN + countdown
      this.insertCoinText.setVisible(true);
      this.countdownText.setVisible(true);
      this.countdownText.setText(countdown.toString());
      this.phaseText.setVisible(false);
      this.subText.setVisible(false);
    } else if (phase === "arena") {
      // Show Battle Royale
      this.insertCoinText.setVisible(false);
      this.countdownText.setVisible(false);
      this.phaseText.setVisible(true);
      this.phaseText.setText("⚔️ BATTLE ROYALE!");
      this.subText.setVisible(true);
      this.subText.setText(`${participantCount} bots fighting for victory`);
    } else if (phase === "results") {
      // Show Winner Crowned
      this.insertCoinText.setVisible(false);
      this.countdownText.setVisible(false);
      this.phaseText.setVisible(true);
      this.phaseText.setText("🏆 WINNER CROWNED!");
      this.subText.setVisible(true);
      this.subText.setText("Restarting in 5s...");
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
          // Try to start music after unlocking
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
        // Play intro sound first (only once per scene instance)
        if (!this.introPlayed && this.cache.audio.exists("domin8-intro")) {
          SoundManager.playSound(this, "domin8-intro", 0.5);
          this.introPlayed = true;
        }

        // Check if audio file is loaded
        if (!this.cache.audio.exists("battle-theme")) {
          logger.game.error("[DemoScene] battle-theme audio not loaded!");
          return;
        }

        // Use SoundManager to play battle music (respects mute and volume)
        this.battleMusic = SoundManager.play(this, "battle-theme", 0.2, {
          loop: true,
        });

        // Register with SoundManager for centralized control
        SoundManager.setBattleMusic(this.battleMusic);
      } catch (e) {
        logger.game.error("[DemoScene] Failed to start battle music:", e);
      }
    }
  }

  handleResize() {
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;
    this.backgroundManager.updateCenter(this.centerX, this.centerY);
    this.playerManager.updateCenter(this.centerX, this.centerY);
    this.animationManager.updateCenter(this.centerX, this.centerY);

    // Update demo UI container position - bottom 1/3 of screen
    if (this.demoUIContainer) {
      const bottomThirdY = this.camera.height * 0.75;
      this.demoUIContainer.setPosition(this.centerX, bottomThirdY);
    }
  }

  public setDemoMap(mapData: any) {
    logger.game.debug("[DemoScene] setDemoMap called:", mapData?.name);

    if (mapData?.background) {
      this.backgroundManager.setTexture(mapData.background);
    }
  }

  public spawnDemoParticipant(participant: any) {
    const participantId = participant._id || participant.id;

    logger.game.debug("[DemoScene] spawnDemoParticipant called", {
      id: participantId,
      currentParticipantsCount: this.participants.length,
      playerManagerCount: this.playerManager.getParticipants().size,
    });

    // Check if participant already exists to prevent double spawning
    if (this.playerManager.getParticipant(participantId)) {
      logger.game.warn(
        `[DemoScene] Participant ${participantId} already exists in PlayerManager, skipping duplicate spawn`
      );
      return;
    }

    // Also check in our local participants array
    if (this.participants.find((p) => (p._id || p.id) === participantId)) {
      logger.game.warn(
        `[DemoScene] Participant ${participantId} found in local array, skipping duplicate spawn`
      );
      return;
    }

    logger.game.debug(`[DemoScene] Adding participant ${participantId} to scene`);
    this.playerManager.addParticipant(participant);
    this.participants.push(participant);
    logger.game.debug(`[DemoScene] Participant ${participantId} added successfully`);
  }

  public moveParticipantsToCenter() {
    this.playerManager.moveParticipantsToCenter();

    // After 2 seconds of running, start continuous explosions
    this.time.delayedCall(500, () => {
      logger.game.debug("[DemoScene] 💥 Starting continuous explosions after 2 seconds of running");
      this.animationManager.createContinuousExplosions();
    });
  }

  public showDemoWinner(winner: any) {
    // Mark all non-winners as eliminated
    const participants = this.playerManager.getParticipants();
    participants.forEach((participant) => {
      if (participant.id !== winner._id && participant.id !== winner.id) {
        participant.eliminated = true;
      } else {
        participant.eliminated = false; // Winner stays
      }
    });

    // Explode losers outward with physics (includes explosions, blood, shake)
    this.animationManager.explodeParticipantsOutward(participants);

    // After 3 seconds: Show winner celebration
    this.time.delayedCall(3000, () => {
      logger.game.debug("[DemoScene] 🎉 Starting winner celebration for:", winner);

      const demoGameState = {
        status: "results",
        winnerId: winner._id || winner.id,
        participants: Array.from(participants.values()),
        isDemo: true,
      };

      // Show winner with PlayerManager (scales up, golden tint, etc.)
      const winnerParticipant = this.playerManager.showResults(demoGameState);

      logger.game.debug("[DemoScene] Winner participant from showResults:", winnerParticipant);

      // Add celebration animations (confetti, text, bounce)
      if (winnerParticipant) {
        logger.game.debug("[DemoScene] 🏆 Calling addWinnerCelebration");
        this.animationManager.addWinnerCelebration(winnerParticipant, winner);
      } else {
        logger.game.error("[DemoScene] ❌ No winner participant returned!");
      }
    });
  }

  public clearDemoParticipants() {
    logger.game.debug("[DemoScene] Clearing demo participants", {
      count: this.participants.length,
    });
    this.playerManager.clearParticipants();
    this.animationManager.clearCelebration();
    this.participants = [];
  }

  shutdown() {
    // Clean up event listeners to prevent memory leaks
    EventBus.off("play-insert-coin-sound");
    EventBus.off("player-bet-placed");

    // Stop demo mode when scene is shut down
    this.stopDemoMode();

    // Clean up demo state
    this.clearAllDemoState();

    // Clean up music when scene is shut down
    if (this.battleMusic) {
      this.battleMusic.stop();
      this.battleMusic = null;
      SoundManager.setBattleMusic(null); // Unregister from SoundManager
    }
    // Reset intro flag for next time scene is created
    this.introPlayed = false;
  }

  update() {}
}
