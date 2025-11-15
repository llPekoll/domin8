import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { charactersData, allMapsData, RESOLUTION_SCALE } from "../main";
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
  private isActive: boolean = false; // ✅ Start INACTIVE, wait for confirmation
  private demoPhase: DemoPhase = "spawning";
  private countdown: number = 30;
  private shuffledPositions: Array<{ x: number; y: number }> = [];
  private spawnTimeouts: NodeJS.Timeout[] = [];
  private spawnCount: number = 0;
  private isSpawning: boolean = false;
  private initialStateReceived: boolean = false; // ✅ Track if we got initial state
  private currentBackgroundId: number = 1; // Track current background for mask selection
  private arenaMask: Phaser.Display.Masks.BitmapMask | null = null; // Arena mask

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
    this.camera = this.cameras.main;
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    this.playerManager = new PlayerManager(this, this.centerX, this.centerY);
    this.animationManager = new AnimationManager(this, this.centerX, this.centerY);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY);

    // Initialize background with random selection between available backgrounds
    // Available backgrounds: bg1 (Arena Classic), bg2 (Secte Arena)
    const availableBackgrounds = [1, 2];
    const randomBgId =
      availableBackgrounds[Math.floor(Math.random() * availableBackgrounds.length)];
    this.currentBackgroundId = randomBgId; // Store for mask selection
    logger.game.debug("[DemoScene] Randomly selected background ID:", randomBgId);
    this.backgroundManager.setBackgroundById(randomBgId);

    // Create arena mask based on background
    this.createArenaMask();

    // Load corresponding map config for spawn positions
    const selectedMap = allMapsData.find((map: any) => map.id === randomBgId);
    if (selectedMap) {
      logger.game.debug("[DemoScene] Loaded map config:", selectedMap.spawnConfiguration);
      // Pass map data to PlayerManager for spawn calculations
      this.playerManager.updateParticipantsInWaiting([], selectedMap);

      // Generate spawn positions from map config
      this.shuffledPositions = generateRandomEllipsePositions(
        DEMO_PARTICIPANT_COUNT,
        selectedMap.spawnConfiguration
      );

      // DEBUG: Draw spawn ellipse to verify configuration
      // this.playerManager.debugDrawSpawnEllipse();

      logger.game.debug("[DemoScene] Positions ready, starting demo mode");
    } else {
      logger.game.error("[DemoScene] Could not find map config for ID:", randomBgId);
    }
    EventBus.emit("current-scene-ready", this);

    // Listen for when scene becomes active again after Game scene (restart fresh demo)
    this.events.on("transitioncomplete", () => {
      logger.game.debug("[DemoScene] Transition complete, restarting demo");
      this.initialStateReceived = true; // We know we're in IDLE phase after transition
      this.startDemoMode();
    });

    // Initialize SoundManager
    SoundManager.initialize();

    // Set up audio unlock on first user interaction
    this.setupAudioUnlock();

    // Listen for insert coin event from React UI
    EventBus.on("play-insert-coin-sound", () => {
      SoundManager.playInsertCoin(this);
    });

    // Listen for game-started event from GlobalGameStateManager to stop demo
    EventBus.on("game-started", () => {
      logger.game.debug("[DemoScene] 🛑 Real game starting, stopping demo mode");
      this.stopDemoMode();
    });

    // Listen for demo-mode-active event from GlobalGameStateManager to restart demo
    EventBus.on("demo-mode-active", (isActive: boolean) => {
      logger.game.debug("[DemoScene] Received demo-mode-active event:", isActive);

      // Mark that we received initial state
      if (!this.initialStateReceived) {
        this.initialStateReceived = true;
        logger.game.debug("[DemoScene] ✅ Initial state confirmed: DEMO MODE");
      }

      if (isActive && !this.isActive) {
        logger.game.debug("[DemoScene] 🎮 Demo mode activated");
        this.clearDemoParticipants();
        this.startDemoMode();
      }
    });

    // ✅ NEW: Also listen to game-phase-changed for initial IDLE phase
    EventBus.on("game-phase-changed", (newPhase: string) => {
      logger.game.debug("[DemoScene] Received game-phase-changed:", newPhase);

      // If initial state is IDLE, start demo
      if (newPhase === "idle" && !this.initialStateReceived) {
        this.initialStateReceived = true;
        logger.game.debug("[DemoScene] ✅ Initial state confirmed: IDLE, starting demo");
        this.startDemoMode();
      }
    });

    // Listen for player bet placement to spawn character immediately
    // CRITICAL: Only spawn if demo is active, not during real game
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
        // GUARD: Only spawn characters in demo scene if demo is actually active
        if (!this.isActive) {
          logger.game.debug("[DemoScene] Ignoring player-bet-placed event (demo not active)");
          return;
        }

        logger.game.debug("[DemoScene] Spawning player character in demo mode", data);

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

    // ✅ DON'T auto-start demo - wait for initial state confirmation from GlobalGameStateManager
    // Demo will start when we receive "demo-mode-active" event OR after timeout
    logger.game.debug("[DemoScene] Waiting for initial state confirmation before starting demo...");

    // Safety timeout: if no state arrives in 2 seconds, assume IDLE and start demo
    this.time.delayedCall(2000, () => {
      if (!this.initialStateReceived) {
        logger.game.warn(
          "[DemoScene] No initial state received after 2s, starting demo as fallback"
        );
        this.initialStateReceived = true;
        this.startDemoMode();
      }
    });
  }

  private startDemoMode() {
    logger.game.debug("[DemoScene] 🎬 Starting demo mode");

    // First, ensure everything is cleared (defensive cleanup)
    this.clearAllDemoState();

    // Reset state
    this.isActive = true;
    this.countdown = DEMO_TIMINGS.SPAWNING_PHASE_DURATION / 1000;
    this.demoPhase = "spawning";
    this.participants = [];
    this.spawnCount = 0;
    this.isSpawning = false;

    // Note: shuffledPositions are generated in create() after map config loads

    // Update UI
    this.updateDemoUI(this.demoPhase, this.countdown, 0);

    // Start countdown timer
    this.startCountdownTimer();

    // Start spawning bots
    this.startBotSpawning();
  }

  private stopDemoMode() {
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
    spawnIntervals.forEach((interval) => {
      cumulativeTime += interval;

      const timeout = setTimeout(() => {
        if (!this.isActive || this.spawnCount >= DEMO_PARTICIPANT_COUNT) return;

        const position = this.shuffledPositions[this.spawnCount];
        if (!position) {
          logger.game.error(`[DemoScene] No position at index ${this.spawnCount}`);
          return;
        }

        const participant = generateDemoParticipant(this.spawnCount, charactersData, position);

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

    // Remove arena masks from all participants before they move to center
    this.removeArenaMasks();

    // Use shared battle phase animation sequence
    this.animationManager.startBattlePhaseSequence(this.playerManager);

    // After 3 seconds, show results (using max duration)
    this.time.delayedCall(DEMO_TIMINGS.ARENA_PHASE_MAX_DURATION, () => {
      this.transitionToResultsPhase();
    });
  }

  private transitionToResultsPhase() {
    logger.game.debug("[DemoScene] 🏆 Transitioning to results phase");
    this.demoPhase = "results";
    this.updateDemoUI(this.demoPhase, 0, this.participants.length);

    // Pick random winner and use shared results phase animation sequence
    const winner = generateDemoWinner(this.participants);
    if (winner) {
      this.animationManager.startResultsPhaseSequence(this.playerManager, winner);
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

    // "INSERT COIN!" text - scaled for native 396x180 resolution
    this.insertCoinText = this.add.text(0, 0, "INSERT COIN!", {
      fontFamily: "metal-slug",
      fontSize: "20px", // Scaled down from 64px (approximately 1/3)
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 2, // Scaled down from 6px
      resolution: 4, // High resolution for crisp text when scaled
    });
    // this.insertCoinText.setAlpha(0);
    this.insertCoinText.setOrigin(0.5);

    // Countdown text - scaled for native resolution
    this.countdownText = this.add.text(0, 35, "30", {
      fontFamily: "metal-slug",
      fontSize: "30px", // Scaled down from 96px
      color: "#FF4444",
      stroke: "#000000",
      strokeThickness: 3, // Scaled down from 8px
      resolution: 4, // High resolution for crisp text when scaled
    });
    this.countdownText.setOrigin(0.5);

    // Phase text (Battle Royale / Winner Crowned) - scaled for native resolution
    this.phaseText = this.add.text(0, 0, "", {
      fontFamily: "metal-slug",
      fontSize: "16px", // Scaled down from 48px
      color: "#FFD700",
      stroke: "#000000",
      strokeThickness: 2, // Scaled down from 5px
      resolution: 4, // High resolution for crisp text when scaled
    });
    this.phaseText.setOrigin(0.5);

    // Sub text (participant count / restarting info) - scaled for native resolution
    this.subText = this.add.text(0, 22, "", {
      fontFamily: "metal-slug",
      fontSize: "10px", // Scaled down from 28px
      color: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: 1, // Scaled down from 3px
      resolution: 4, // High resolution for crisp text when scaled
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
      // Hide all UI in results phase - no need to show anything in demo mode
      this.insertCoinText.setVisible(false);
      this.countdownText.setVisible(false);
      this.phaseText.setVisible(false);
      this.subText.setVisible(false);
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

    // Apply arena mask to the newly spawned participant
    if (this.arenaMask) {
      const gameParticipant = this.playerManager.getParticipant(participantId);
      if (gameParticipant) {
        gameParticipant.container.setMask(this.arenaMask);
        logger.game.debug(`[DemoScene] Arena mask applied to participant ${participantId}`);
      }
    }

    logger.game.debug(`[DemoScene] Participant ${participantId} added successfully`);
  }

  public clearDemoParticipants() {
    logger.game.debug(
      `[CLEANUP] DemoScene.clearDemoParticipants() - ${this.participants.length} demo participants`
    );
    this.playerManager.clearParticipants();
    this.animationManager.clearCelebration();
    this.participants = [];
    logger.game.debug("[CLEANUP] Demo participants cleared");
  }

  /**
   * Create arena mask based on current background
   * bg1 (Classic Arena) uses mask_classic
   * bg2 (Mystic Forest/Secte) uses mask_secte
   */
  private createArenaMask() {
    // Map background IDs to mask keys
    const maskKeys: { [key: number]: string } = {
      1: "mask_classic",
      2: "mask_secte",
    };

    const maskKey = maskKeys[this.currentBackgroundId];
    if (!maskKey) {
      logger.game.warn(`[DemoScene] No mask defined for background ID ${this.currentBackgroundId}`);
      return;
    }

    // Check if mask texture exists
    if (!this.textures.exists(maskKey)) {
      logger.game.error(`[DemoScene] Mask texture '${maskKey}' not found!`);
      return;
    }

    // Create mask image (hidden, used only for masking)
    const maskImage = this.make.image({
      x: this.centerX,
      y: this.centerY,
      key: maskKey,
      add: false, // Don't add to display list
    });

    // Scale the mask to match the game's resolution scale
    maskImage.setScale(RESOLUTION_SCALE);

    // Create bitmap mask from the image
    this.arenaMask = maskImage.createBitmapMask();
    logger.game.debug(`[DemoScene] Arena mask created using ${maskKey} with scale ${RESOLUTION_SCALE}`);
  }

  /**
   * Remove arena masks from all participants
   * Called when transitioning to arena phase (when characters run to center)
   */
  private removeArenaMasks() {
    logger.game.debug("[DemoScene] Removing arena masks from all participants");
    const participants = this.playerManager.getParticipants();
    participants.forEach((participant) => {
      if (participant.container) {
        participant.container.clearMask();
      }
    });
    logger.game.debug("[DemoScene] Arena masks removed");
  }

  shutdown() {
    // Clean up event listeners to prevent memory leaks
    EventBus.off("play-insert-coin-sound");
    EventBus.off("game-started");
    EventBus.off("demo-mode-active");
    EventBus.off("game-phase-changed");
    EventBus.off("player-bet-placed");
    this.events.off("transitioncomplete");

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
