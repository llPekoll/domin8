import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { GamePhaseManager, GamePhase } from "../managers/GamePhaseManager";
import { UIManager } from "../managers/UIManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { logger } from "../../lib/logger";

export class Game extends Scene {
  camera!: Phaser.Cameras.Scene2D.Camera;
  gameState: any = null;
  centerX: number = 0;
  centerY: number = 0;

  // Managers
  private playerManager!: PlayerManager;
  private animationManager!: AnimationManager;
  private gamePhaseManager!: GamePhaseManager;
  private uiManager!: UIManager;
  private backgroundManager!: BackgroundManager;

  private introPlayed: boolean = false;

  constructor() {
    super("Game");
  }

  create() {
    logger.game.debug("[Game] 🎮 Game scene (RoyalRumble) created and ready");
    this.camera = this.cameras.main;

    // Calculate proper center coordinates based on actual camera dimensions
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    // Initialize managers
    this.playerManager = new PlayerManager(this, this.centerX, this.centerY);
    this.animationManager = new AnimationManager(this, this.centerX, this.centerY);
    this.gamePhaseManager = new GamePhaseManager(this, this.playerManager, this.animationManager);
    this.uiManager = new UIManager(this, this.centerX);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY);

    // Connect UIManager to GamePhaseManager for VRF phase triggering
    this.uiManager.setGamePhaseManager(this.gamePhaseManager);

    // Set default background (will be updated when gameState is received)
    const defaultTexture = "arena_classic";
    if (this.textures.exists(defaultTexture)) {
      this.backgroundManager.setTexture(defaultTexture);
    }

    // Create UI elements
    this.uiManager.create();

    // Handle resize events to keep background centered
    this.scale.on("resize", () => this.handleResize(), this);

    EventBus.emit("current-scene-ready", this);

    // Listen for insert coin event from React UI
    EventBus.on("play-insert-coin-sound", () => {
      SoundManager.playInsertCoin(this);
    });

    // Characters now spawn automatically via blockchain subscription (useActiveGame)
    // No need for separate event listener - updateGameState handles all spawning

    // Play intro sound when real game starts
    this.playIntroSound();
  }

  private playIntroSound() {
    if (!this.introPlayed) {
      try {
        // Initialize SoundManager
        SoundManager.initialize();

        // Unlock audio on first interaction
        void SoundManager.unlockAudio(this).then(() => {
          // Play intro sound if it's loaded
          if (this.cache.audio.exists("domin8-intro")) {
            SoundManager.playSound(this, "domin8-intro", 0.5);
            this.introPlayed = true;
          }
        });
      } catch (e) {
        logger.game.error("[Game] Failed to play intro sound:", e);
      }
    }
  }

  handleResize() {
    // Update center coordinates when window is resized
    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    // Update managers with new center coordinates
    this.backgroundManager.updateCenter(this.centerX, this.centerY);
    this.playerManager.updateCenter(this.centerX, this.centerY);
    this.animationManager.updateCenter(this.centerX, this.centerY);
    this.uiManager.updateCenter(this.centerX);
  }

  // Update game state from blockchain
  updateGameState(gameState: any) {
    logger.game.debug("[Game] 🎮 updateGameState called", {
      hasGameState: !!gameState,
      hasMap: !!gameState?.map,
      mapType: typeof gameState?.map,
      mapValue: gameState?.map,
      mapBackground: gameState?.map?.background,
      fullGameState: gameState,
    });

    this.gameState = gameState;

    if (!gameState) {
      logger.game.warn("[Game] No game state provided to updateGameState");
      return;
    }

    // Update map background based on game data
    if (gameState.map) {
      logger.game.debug("[Game] 🗺️ Processing map data", {
        isObject: typeof gameState.map === "object",
        isNumber: typeof gameState.map === "number",
        hasBackground: !!gameState.map.background,
        map: gameState.map,
      });

      if (gameState.map.background) {
        logger.game.debug("[Game] Setting background texture:", gameState.map.background);
        this.backgroundManager.setTexture(gameState.map.background);

        // Update center position if map specifies it
        if (gameState.map.centerX && gameState.map.centerY) {
          logger.game.debug("[Game] Updating center position", {
            centerX: gameState.map.centerX,
            centerY: gameState.map.centerY,
          });
          this.centerX = gameState.map.centerX;
          this.centerY = gameState.map.centerY;
          this.backgroundManager.updateCenter(this.centerX, this.centerY);
        }
      } else {
        logger.game.error(
          "[Game] ❌ Map object exists but has no background property!",
          gameState.map
        );
      }
    } else {
      logger.game.error("[Game] ❌ No map data in game state!");
    }

    // Spawn characters from blockchain bet data
    if (gameState.bets && gameState.wallets) {
      logger.game.debug("[Game] Spawning characters from blockchain bet data:", {
        betCount: gameState.bets.length,
        walletCount: gameState.wallets.length,
      });

      gameState.bets.forEach((bet: any, betIndex: number) => {
        const walletAddress = gameState.wallets[bet.walletIndex]?.toBase58();
        if (!walletAddress) {
          logger.game.warn("[Game] No wallet found for bet index", betIndex);
          return;
        }

        const participantId = `${walletAddress}_${betIndex}`;

        // Skip if participant already exists
        if (this.playerManager.getParticipant(participantId)) {
          return;
        }

        // TODO: Map skin ID to character name/key
        // For now, use a default mapping
        const characterName = this.getSkinName(bet.skin);
        const characterKey = characterName.toLowerCase().replace(/\s+/g, "-");

        const participant = {
          _id: participantId,
          playerId: walletAddress,
          displayName: characterName,
          betAmount: Number(bet.amount.toString()) / 1_000_000_000, // Convert lamports to SOL
          character: {
            key: characterKey,
            name: characterName,
            id: bet.skin,
          },
          spawnIndex: betIndex,
          isBot: false,
          eliminated: false,
          colorHue: undefined,
        };

        logger.game.debug("[Game] Spawning participant from blockchain:", participant);
        this.playerManager.addParticipant(participant, false);
      });
    }

    // Update UI
    this.uiManager.updateGameState(gameState);

    this.gamePhaseManager.handleGamePhase(gameState);
  }

  // Helper to map skin ID to character name
  private getSkinName(skinId: number): string {
    // TODO: Load this mapping from Convex characters table
    const skinMap: { [key: number]: string } = {
      0: "Warrior",
      1: "Mage",
      2: "Archer",
      3: "Orc",
      4: "Male",
      5: "Soldier",
      // Add more mappings as needed
    };
    return skinMap[skinId] || "Warrior";
  }

  // Add update method to continuously update the timer and check game phase
  update() {
    this.uiManager.updateTimer();

    // Continuously check game phase to detect winner during VRF_PENDING
    if (this.gameState) {
      this.gamePhaseManager.handleGamePhase(this.gameState);
    }
  }

  shutdown() {
    // Clean up event listeners to prevent memory leaks
    EventBus.off("play-insert-coin-sound");
  }

  changeScene() {
    this.scene.start("GameOver");
  }
}
