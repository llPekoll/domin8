import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { PlayerManager } from '../managers/PlayerManager';
import { AnimationManager } from '../managers/AnimationManager';
import { GamePhaseManager } from '../managers/GamePhaseManager';
import { UIManager } from '../managers/UIManager';
import { BackgroundManager } from '../managers/BackgroundManager';
import { SoundManager } from '../managers/SoundManager';
import { logger } from '../../lib/logger';

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
    super('RoyalRumble');
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

    // Set default background (will be updated when gameState is received)
    const defaultTexture = 'arena_classic';
    if (this.textures.exists(defaultTexture)) {
      this.backgroundManager.setTexture(defaultTexture);
    }

    // Create UI elements
    this.uiManager.create();

    // Handle resize events to keep background centered
    this.scale.on('resize', () => this.handleResize(), this);

    EventBus.emit('current-scene-ready', this);

    // Listen for insert coin event from React UI
    EventBus.on("play-insert-coin-sound", () => {
      SoundManager.playInsertCoin(this);
    });

    // Listen for player bet placement to spawn character immediately
    EventBus.on("player-bet-placed", (data: {
      characterId: number;
      characterName: string;
      position: [number, number];
      betAmount: number;
      roundId: number;
      betIndex: number;
      walletAddress: string;
    }) => {
      logger.game.debug("[Game] 🎯 RECEIVED player-bet-placed EVENT");
      logger.game.debug("[Game] Event data:", data);

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

      // Spawn the character immediately in the scene
      this.spawnParticipantImmediately(participant);
    });

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
          if (this.cache.audio.exists('domin8-intro')) {
            SoundManager.playSound(this, 'domin8-intro', 0.5);
            this.introPlayed = true;
          }
        });
      } catch (e) {
        logger.game.error('[Game] Failed to play intro sound:', e);
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
    this.gameState = gameState;

    if (!gameState) return;

    // Update map background based on game data
    if (gameState.map && gameState.map.background) {
      this.backgroundManager.setTexture(gameState.map.background);

      // Update center position if map specifies it
      if (gameState.map.centerX && gameState.map.centerY) {
        this.centerX = gameState.map.centerX;
        this.centerY = gameState.map.centerY;
        this.backgroundManager.updateCenter(this.centerX, this.centerY);
      }
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

  // Public method for real-time participant spawning
  public spawnParticipantImmediately(participant: any) {
    this.playerManager.spawnParticipantImmediately(participant);
  }

  // Add update method to continuously update the timer
  update() {
    this.uiManager.updateTimer();
  }

  shutdown() {
    // Clean up event listeners to prevent memory leaks
    EventBus.off("play-insert-coin-sound");
    EventBus.off("player-bet-placed");
  }

  changeScene() {
    this.scene.start('GameOver');
  }
}
