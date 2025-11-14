import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
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
    this.uiManager = new UIManager(this, this.centerX);
    this.backgroundManager = new BackgroundManager(this, this.centerX, this.centerY);

    // Set up event listeners from GlobalGameStateManager
    this.setupEventListeners();

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

    EventBus.emit("current-scene-ready", this);

    // ✅ Initialize game state from activeGameData on initial load
    if (activeGameData) {
      logger.game.debug("[Game] 🎮 Initial load - updating game state from activeGameData", {
        hasBets: !!activeGameData.bets,
        betCount: activeGameData.bets?.length || 0,
        hasWallets: !!activeGameData.wallets,
        walletCount: activeGameData.wallets?.length || 0,
      });
      this.updateGameState(activeGameData);
    } else {
      logger.game.warn("[Game] ⚠️ No activeGameData on initial load");
    }

    // Listen for insert coin event from React UI
    EventBus.on("play-insert-coin-sound", () => {
      SoundManager.playInsertCoin(this);
    });

    // Listen for new player joining the game
    EventBus.on("player-bet-placed", (data: any) => {
      logger.game.debug("[Game] 🎮 Player bet placed event received:", data);
      // Play challenger sound when a new player joins
      // (Note: insert-coin plays for the player who placed the bet)
      SoundManager.playChallenger(this);
    });

    // Characters now spawn automatically via blockchain subscription (useActiveGame)
    // No need for separate event listener - updateGameState handles all spawning

    // Play intro sound when real game starts
    this.playIntroSound();
  }

  /**
   * Set up event listeners from GlobalGameStateManager
   */
  private setupEventListeners() {
    // Listen for battle phase start
    EventBus.on("start-battle-phase", () => {
      logger.game.debug("[Game] ⚔️ Battle phase triggered");
      const participantsMap = this.playerManager.getParticipants();
      if (participantsMap.size > 0) {
        this.animationManager.startBattlePhaseSequence(this.playerManager);
      }
    });

    // Listen for celebration start
    EventBus.on(
      "start-celebration",
      ({ winner, remainingTime }: { winner: string; remainingTime: number }) => {
        logger.game.debug("[Game] 🎉 Celebration triggered", { winner, remainingTime });

        // Find winner participant
        const participants = Array.from(this.playerManager.getParticipants().values());
        const winnerParticipant = participants.find(
          (p) => p.id === winner || p.playerId === winner
        );

        if (winnerParticipant) {
          this.animationManager.startResultsPhaseSequence(this.playerManager, winnerParticipant);
        } else {
          logger.game.warn("[Game] ⚠️ Winner not found in participants:", winner);
        }
      }
    );

    // Listen for cleanup
    EventBus.on("cleanup-game", () => {
      logger.game.debug("[Game] 🧹 Cleanup triggered");
      this.handleGameCleanup();
    });
  }

  /**
   * Handle game cleanup (fade out participants and celebration visuals)
   */
  private handleGameCleanup() {
    logger.game.debug("[CLEANUP] ========================================");
    logger.game.debug("[CLEANUP] STARTED - Game.handleGameCleanup()");
    logger.game.debug("[CLEANUP] ========================================");

    // ✅ Fade out celebration visuals FIRST (throne, overlay, confetti)
    // This gives a smooth transition before participants disappear
    this.animationManager.fadeOutCelebration(1000);

    // ✅ Fade out UI elements (WINNER CROWNED text, etc.)
    if (this.uiManager) {
      this.uiManager.fadeOutWinnerUI(1000);
    }

    // Stop all ongoing animations and timers (but allow our cleanup fades)
    this.time.delayedCall(100, () => {
      const tweenCount = this.tweens.getTweens().length;
      logger.game.debug(`[CLEANUP] Active tweens before kill: ${tweenCount}`);
    });

    // Get all participants before cleanup
    const participants = Array.from(this.playerManager.getParticipants().values());
    logger.game.debug(`[CLEANUP] Found ${participants.length} participants to fade out`);

    // Fade out all participants
    let fadeCompleteCount = 0;
    const totalFades = participants.length;

    if (totalFades === 0) {
      logger.game.debug("[CLEANUP] No participants to fade, waiting for visual fade then cleanup");
      // Wait for celebration visuals to fade (1000ms)
      this.time.delayedCall(1000, () => {
        this.finalizeCleanup();
      });
      return;
    }

    participants.forEach((participant) => {
      this.tweens.add({
        targets: participant.container,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          fadeCompleteCount++;
          logger.game.debug(`[CLEANUP] Fade ${fadeCompleteCount}/${totalFades} complete`);

          if (fadeCompleteCount === totalFades) {
            logger.game.debug("[CLEANUP] All fades complete, calling finalizeCleanup()");
            this.finalizeCleanup();
          }
        },
      });
    });
  }

  /**
   * Finalize cleanup (clear participants and UI)
   */
  private finalizeCleanup() {
    logger.game.debug("[CLEANUP] Finalizing - clearing participants and UI");
    this.playerManager.clearParticipants();
    this.animationManager.clearCelebration();

    // ✅ Clear winner UI (WINNER CROWNED text, etc.)
    if (this.uiManager) {
      this.uiManager.hideAllUI();
    }

    logger.game.debug("[CLEANUP] Complete");
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

  // Update game state from blockchain
  updateGameState(gameState: any) {
    logger.game.debug("[Game] 🎮 updateGameState called", {
      hasGameState: !!gameState,
      hasMap: !!gameState?.map,
      hasBets: !!gameState?.bets,
      betCount: gameState?.bets?.length || 0,
      hasWallets: !!gameState?.wallets,
      walletCount: gameState?.wallets?.length || 0,
      hasCharacters: !!this.characters,
      characterCount: this.characters?.length || 0,
      status: gameState?.status,
    });

    this.gameState = gameState;

    if (!gameState) {
      logger.game.warn("[Game] No game state provided to updateGameState");
      return;
    }

    // Update map background and spawn configuration based on game data
    if (gameState.map !== undefined && gameState.map !== null) {
      // Extract map ID - it could be a number or an object with an id property
      const mapId = typeof gameState.map === "object" ? gameState.map.id : gameState.map;

      logger.game.debug("[Game] 🗺️ Setting background and map config by ID:", mapId);
      this.backgroundManager.setBackgroundById(mapId);

      // Load map config for spawn positions from global allMapsData
      const selectedMap = allMapsData.find((map: any) => map.id === mapId);
      if (selectedMap) {
        logger.game.debug("[Game] Loaded map config for spawning:", selectedMap.spawnConfiguration);
        // Just set the map config, don't manage participants (they're managed separately below)
        this.playerManager.setMapData(selectedMap);
      } else {
        logger.game.error(
          "[Game] Could not find map data for ID:",
          mapId,
          "Available maps:",
          allMapsData.map((m: any) => m.id)
        );
      }
    } else {
      logger.game.error("[Game] ❌ No map data in game state!");
    }

    // Spawn characters from blockchain bet data
    if (gameState.bets && gameState.wallets) {
      logger.game.debug("[Game] 🚀 Starting character spawn from blockchain bet data:", {
        betCount: gameState.bets.length,
        walletCount: gameState.wallets.length,
        hasPlayerManager: !!this.playerManager,
        currentParticipantCount: this.playerManager?.getParticipants().size || 0,
      });

      gameState.bets.forEach((bet: any, betIndex: number) => {
        logger.game.debug(`[Game] 🔍 Processing bet ${betIndex}:`, {
          walletIndex: bet.walletIndex,
          skin: bet.skin,
          amount: bet.amount?.toString(),
        });

        const walletAddress = gameState.wallets[bet.walletIndex]?.toBase58();
        if (!walletAddress) {
          logger.game.warn("[Game] ❌ No wallet found for bet index", betIndex);
          return;
        }

        const participantId = `${walletAddress}_${betIndex}`;

        // Skip if participant already exists
        if (this.playerManager.getParticipant(participantId)) {
          logger.game.debug(`[Game] ⏭️ Participant ${participantId} already exists, skipping`);
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

        logger.game.debug("[Game] ✅ Spawning participant from blockchain:", participant);
        this.playerManager.addParticipant(participant, false);
      });

      logger.game.debug(
        "[Game] ✅ Character spawn complete. Final participant count:",
        this.playerManager.getParticipants().size
      );
    } else {
      logger.game.warn("[Game] ⚠️ No bets or wallets in game state!", {
        hasBets: !!gameState.bets,
        hasWallets: !!gameState.wallets,
      });
    }

    // Update UI
    this.uiManager.updateGameState(gameState);

    // ✅ Phase handling is now done by GlobalGameStateManager
    // No need to call handleGamePhase() here
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

  // Update method to update the timer display
  update() {
    this.uiManager.updateTimer();

    // ✅ Phase detection is now handled by GlobalGameStateManager
    // No need to continuously check phases here
  }

  shutdown() {
    // Clean up event listeners
    EventBus.off("play-insert-coin-sound");
    EventBus.off("start-battle-phase");
    EventBus.off("start-celebration");
    EventBus.off("cleanup-game");

    // Clean up UIManager
    if (this.uiManager) {
      this.uiManager.destroy();
    }

    // Clear all participants from the scene
    if (this.playerManager) {
      this.playerManager.clearParticipants();
    }

    // Clear animations
    if (this.animationManager) {
      this.animationManager.clearCelebration();
    }

    this.tweens.killAll();
    this.time.removeAllEvents();

    // Reset game state
    this.gameState = null;
    this.introPlayed = false;

    logger.game.debug("[Game] Scene shutdown complete");
  }
}
