import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { GamePhaseManager } from "../managers/GamePhaseManager";
import { UIManager } from "../managers/UIManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { logger } from "../../lib/logger";
import { activeGameData, allMapsData } from "../main";

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
  private characters: any[] = [];
  private playerNames: Map<string, string> = new Map(); // wallet -> displayName

  constructor() {
    super("Game");
  }

  // Set characters data from AssetsContext
  setCharacters(characters: any[]) {
    this.characters = characters || [];
  }

  // Set player names mapping (wallet address -> display name)
  setPlayerNames(playerNames: Array<{ walletAddress: string; displayName: string | null }>) {
    this.playerNames.clear();
    playerNames.forEach(({ walletAddress, displayName }) => {
      if (displayName) {
        this.playerNames.set(walletAddress, displayName);
      }
    });

    // Pass updated player names to AnimationManager
    if (this.animationManager) {
      this.animationManager.setPlayerNames(this.playerNames);
    }

    // Update existing participants with new display names
    if (this.playerManager) {
      this.updateParticipantDisplayNames();
    }
  }

  // Update display names for all existing participants
  private updateParticipantDisplayNames() {
    const participants = this.playerManager.getParticipants();
    participants.forEach((participant) => {
      if (participant.playerId) {
        const displayName = this.playerNames.get(participant.playerId);
        if (displayName && displayName !== participant.displayName) {
          participant.displayName = displayName;
          participant.nameText.setText(displayName);
        }
      }
    });
  }

  create() {
    this.camera = this.cameras.main;

    this.centerX = this.camera.centerX;
    this.centerY = this.camera.centerY;

    // Initialize managers
    this.playerManager = new PlayerManager(this, this.centerX, this.centerY);
    this.animationManager = new AnimationManager(this, this.centerX, this.centerY);
    this.gamePhaseManager = new GamePhaseManager(this, this.playerManager, this.animationManager);
    this.uiManager = new UIManager(this, this.centerX);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY);

    // Set background from active game data (from useActiveGame hook)
    if (activeGameData?.map !== undefined && activeGameData.map !== null) {
      logger.game.debug(
        "[Game] Setting initial background from activeGameData:",
        activeGameData.map.id
      );
      this.backgroundManager.setBackgroundById(activeGameData.map.id);
      console.log("Background set oooo");
    } else {
      logger.game.warn("[Game] No map data in activeGameData, will wait for updateGameState()");
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

    // Update map background and spawn configuration based on game data
    if (gameState.map !== undefined && gameState.map !== null) {
      // Extract map ID - it could be a number or an object with an id property
      const mapId = typeof gameState.map === 'object' ? gameState.map.id : gameState.map;

      logger.game.debug("[Game] 🗺️ Setting background and map config by ID:", mapId);
      this.backgroundManager.setBackgroundById(mapId);

      // Load map config for spawn positions from global allMapsData
      const selectedMap = allMapsData.find((map: any) => map.id === mapId);
      if (selectedMap) {
        logger.game.debug("[Game] Loaded map config for spawning:", selectedMap.spawnConfiguration);
        // Just set the map config, don't manage participants (they're managed separately below)
        this.playerManager.setMapData(selectedMap);
      } else {
        logger.game.error("[Game] Could not find map data for ID:", mapId, "Available maps:", allMapsData.map((m: any) => m.id));
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

        const characterName = this.getSkinName(bet.skin);
        const characterKey = characterName.toLowerCase().replace(/\s+/g, "-");
        const participantName = this.getParticipantName(walletAddress);

        const participant = {
          _id: participantId,
          playerId: walletAddress,
          displayName: participantName,
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

  private getSkinName(skinId: number): string {
    const character = this.characters.find((char) => char.id === skinId);
    return character.name;
  }

  // Helper to get participant display name from wallet address
  private getParticipantName(walletAddress: string): string {
    // Try to get display name from playerNames mapping
    const displayName = this.playerNames.get(walletAddress);

    if (displayName) {
      return displayName;
    }

    // Fallback to truncated wallet address
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
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
    EventBus.off("play-insert-coin-sound");

    // Clean up UIManager
    if (this.uiManager) {
      this.uiManager.destroy();
    }

    // Clear all participants from the scene
    if (this.playerManager) {
      this.playerManager.clearParticipants();
    }

    this.tweens.killAll();
    this.time.removeAllEvents();

    if (this.gamePhaseManager) {
      this.gamePhaseManager.reset();
    }

    // Reset game state
    this.gameState = null;
    this.introPlayed = false;
  }
}
