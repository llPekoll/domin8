import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { PlayerManager } from '../managers/PlayerManager';
import { AnimationManager } from '../managers/AnimationManager';
import { GamePhaseManager } from '../managers/GamePhaseManager';
import { UIManager } from '../managers/UIManager';
import { BackgroundManager } from '../managers/BackgroundManager';
import { SoundManager } from '../managers/SoundManager';

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

    // Play intro sound when real game starts
    this.playIntroSound();
  }

  private playIntroSound() {
    if (!this.introPlayed) {
      try {
        // Initialize SoundManager
        SoundManager.initialize();

        // Unlock audio on first interaction
        SoundManager.unlockAudio(this).then(() => {
          // Play intro sound if it's loaded
          if (this.cache.audio.exists('domin8-intro')) {
            SoundManager.playSound(this, 'domin8-intro', 0.5);
            this.introPlayed = true;
          }
        });
      } catch (e) {
        console.error('[Game] Failed to play intro sound:', e);
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

  // Update game state from Convex
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

    // Update UI
    this.uiManager.updateGameState(gameState);


    this.gamePhaseManager.handleGamePhase(gameState);
  }

  // Public method for real-time participant spawning
  public spawnParticipantImmediately(participant: any) {
    this.playerManager.spawnParticipantImmediately(participant);
  }

  // Add update method to continuously update the timer
  update() {
    this.uiManager.updateTimer();
  }

  changeScene() {
    this.scene.start('GameOver');
  }
}
