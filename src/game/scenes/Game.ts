import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { PlayerManager } from "../managers/PlayerManager";
import { AnimationManager } from "../managers/AnimationManager";
import { UIManager } from "../managers/UIManager";
import { BackgroundManager } from "../managers/BackgroundManager";
import { SoundManager } from "../managers/SoundManager";
import { logger } from "../../lib/logger";
import { activeGameData, allMapsData, RESOLUTION_SCALE } from "../main";

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
  private playerWins: Map<string, number> = new Map(); // wallet -> totalWins

  // Arena mask
  private currentMapId: number | null = null;
  private arenaMask: Phaser.Display.Masks.BitmapMask | null = null;

  // Boss wallet (previous winner)
  private bossWallet: string | null = null;

  // Audio
  private battleMusic: Phaser.Sound.BaseSound | null = null;
  private fireSounds: Phaser.Sound.BaseSound | null = null;
  private audioUnlocked: boolean = false;

  constructor() {
    super("Game");
  }

  // Set characters data from AssetsContext
  setCharacters(characters: any[]) {
    this.characters = characters || [];
  }

  // Set player names and stats mapping (wallet address -> display name, totalWins)
  setPlayerNames(playerNames: Array<{ walletAddress: string; displayName: string | null; totalWins?: number }>) {
    this.playerNames.clear();
    this.playerWins.clear();
    playerNames.forEach(({ walletAddress, displayName, totalWins }) => {
      if (displayName) {
        this.playerNames.set(walletAddress, displayName);
      }
      if (totalWins !== undefined) {
        this.playerWins.set(walletAddress, totalWins);
      }
    });

    // Pass updated player names to AnimationManager
    if (this.animationManager) {
      this.animationManager.setPlayerNames(this.playerNames);
    }

    // Pass updated player names to UIManager
    if (this.uiManager) {
      this.uiManager.setPlayerNames(playerNames);
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
    });

    // Characters now spawn automatically via blockchain subscription (useActiveGame)
    // No need for separate event listener - updateGameState handles all spawning

    // Setup audio (music + fire sounds)
    this.setupAudioUnlock();
  }

  /**
   * Setup audio unlock handler for browser autoplay policy
   */
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

  /**
   * Try to start background music
   */
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
          logger.game.error("[Game] battle-theme audio not loaded!");
          return;
        }

        // Use SoundManager to play battle music (respects mute and volume)
        this.battleMusic = SoundManager.play(this, "battle-theme", 0.2, {
          loop: true,
        });

        // Register with SoundManager for centralized control
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
        logger.game.error("[Game] Failed to start battle music:", e);
      }
    }
  }

  /**
   * Set up event listeners from GlobalGameStateManager
   */
  private setupEventListeners() {
    // Listen for sound settings changes from UI
    EventBus.on("sound-settings-changed", (data: { type: string; muted: boolean }) => {
      logger.game.debug("[Game] Sound settings changed:", data);

      if (data.type === "master" || data.type === "music") {
        // Music toggle - handle both starting and resuming
        if (!data.muted) {
          if (this.battleMusic) {
            // Music exists but might be paused - resume it
            this.battleMusic.resume();
          } else {
            // No music yet - create and play it
            this.tryStartMusic();
          }
        }
      }

      if (data.type === "master" || data.type === "fire") {
        // Fire sounds toggle - handle both starting and resuming
        if (!data.muted) {
          if (this.fireSounds) {
            // Fire sounds exist but might be paused - resume
            this.fireSounds.resume();
          } else if (this.cache.audio.exists("fire-sounds")) {
            // No fire sounds yet - create and play
            this.fireSounds = SoundManager.play(this, "fire-sounds", 0.15, { loop: true });
            SoundManager.setFireSounds(this.fireSounds);
          }
        }
      }
    });

    // Listen for battle phase start
    EventBus.on("start-battle-phase", ({ winner }: { winner: string | null }) => {
      logger.game.debug("[Game] ⚔️ Battle phase triggered", { winner });

      // Remove arena masks before battle starts
      this.removeArenaMasks();

      const participantsMap = this.playerManager.getParticipants();
      if (participantsMap.size > 0) {
        this.animationManager.startBattlePhaseSequence(this.playerManager);

        // Kick out losers after they run to center (moveParticipantsToCenter takes 400-600ms)
        if (winner) {
          this.time.delayedCall(700, () => {
            const participants = this.playerManager.getParticipants();

            // Mark all non-winners as eliminated
            logger.game.debug("[Game] 🎯 Marking elimination status", {
              winner,
              participantCount: participants.size,
            });
            participants.forEach((participant: any) => {
              const isWinner = participant.id === winner || participant.playerId === winner;
              participant.eliminated = !isWinner;
              logger.game.debug("[Game] 👤 Participant status", {
                id: participant.id,
                playerId: participant.playerId,
                isWinner,
                eliminated: participant.eliminated,
              });
            });

            // Get explosion center from map config
            const mapConfig = this.playerManager.getMapData()?.spawnConfiguration;
            const explosionCenterX = mapConfig ? mapConfig.centerX * RESOLUTION_SCALE : this.scale.width / 2;
            const explosionCenterY = mapConfig ? mapConfig.centerY * RESOLUTION_SCALE : this.scale.height / 2;

            // Kick out losers with staggered timing
            this.animationManager.explodeParticipantsOutward(participants, explosionCenterX, explosionCenterY, true);
          });
        }
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

    // Listen for player names updates from PlayerNamesContext
    EventBus.on(
      "player-names-update",
      (playerNames: Array<{ walletAddress: string; displayName: string | null }>) => {
        logger.game.debug("[Game] 📛 Player names update received:", playerNames.length);
        this.setPlayerNames(playerNames);
      }
    );

    // Listen for boss info updates from App
    EventBus.on("boss-info-update", ({ bossWallet }: { bossWallet: string | null }) => {
      logger.game.debug("[Game] 👑 Boss wallet update:", bossWallet);
      this.bossWallet = bossWallet;
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

  // Update game state from blockchain
  // bossWallet is passed directly to avoid timing issues
  updateGameState(gameState: any, bossWallet?: string | null) {
    // Update bossWallet if provided (takes precedence over EventBus update)
    if (bossWallet !== undefined) {
      this.bossWallet = bossWallet;
    }

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
      bossWallet: this.bossWallet,
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

      // Create arena mask for the map (only if map changed)
      if (this.currentMapId !== mapId) {
        this.createArenaMask(mapId);
      }

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

      // For boss: combine all bets into single participant
      // Track boss's total bet amount and first bet info
      let bossTotalBet = 0;
      let bossFirstBet: any = null;
      let bossFirstBetIndex = -1;

      // First pass: calculate boss total if boss is in this game
      if (this.bossWallet) {
        gameState.bets.forEach((bet: any, betIndex: number) => {
          const walletAddress = gameState.wallets[bet.walletIndex]?.toBase58();
          if (walletAddress === this.bossWallet) {
            const betAmount = Number(bet.amount.toString()) / 1_000_000_000;
            bossTotalBet += betAmount;
            if (bossFirstBet === null) {
              bossFirstBet = bet;
              bossFirstBetIndex = betIndex;
            }
          }
        });
        if (bossTotalBet > 0) {
          logger.game.debug("[Game] 👑 Boss total bet calculated:", bossTotalBet);
        }
      }

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

        const isBoss = walletAddress === this.bossWallet;

        // For boss: only create ONE participant (skip subsequent bets)
        // Use wallet address as ID (not wallet_betIndex) so all bets merge
        const participantId = isBoss ? walletAddress : `${walletAddress}_${betIndex}`;

        // For boss: skip if not the first bet (we'll update the existing one)
        if (isBoss && betIndex !== bossFirstBetIndex) {
          // Check if boss participant exists and update their bet amount
          const existingBoss = this.playerManager.getParticipant(participantId);
          if (existingBoss) {
            logger.game.debug(`[Game] 👑 Boss additional bet - updating existing participant`);
            // Update bet amount to trigger animation
            this.playerManager.updateParticipantData({
              _id: participantId,
              betAmount: bossTotalBet,
              character: existingBoss.sprite ? { baseScale: 1.0 } : undefined,
            });
          }
          return; // Skip creating new participant
        }

        // Skip if participant already exists (for non-boss)
        if (this.playerManager.getParticipant(participantId)) {
          // For boss, update with new total
          if (isBoss) {
            logger.game.debug(`[Game] 👑 Boss exists, updating bet amount to ${bossTotalBet}`);
            this.playerManager.updateParticipantData({
              _id: participantId,
              betAmount: bossTotalBet,
              character: { baseScale: 1.0 },
            });
          } else {
            logger.game.debug(`[Game] ⏭️ Participant ${participantId} already exists, skipping`);
          }
          return;
        }

        const characterConfig = this.getCharacterConfig(bet.skin);
        const characterKey = characterConfig.name.toLowerCase().replace(/\s+/g, "-");
        const participantName = this.getParticipantName(walletAddress);

        // For boss: use combined total bet amount
        const betAmount = isBoss ? bossTotalBet : Number(bet.amount.toString()) / 1_000_000_000;

        const participant = {
          _id: participantId,
          playerId: walletAddress,
          displayName: participantName,
          betAmount: betAmount,
          character: {
            key: characterKey,
            name: characterConfig.name,
            id: bet.skin,
            spriteOffsetY: characterConfig.spriteOffsetY,
            baseScale: characterConfig.baseScale,
          },
          spawnIndex: betIndex,
          isBot: false,
          eliminated: false,
          colorHue: undefined,
          isBoss: isBoss,
        };

        logger.game.debug("[Game] ✅ Spawning participant from blockchain:", participant);
        this.playerManager.addParticipant(participant);

        // Play challenger sound to notify all players of new participant
        SoundManager.playChallenger(this);

        // Apply arena mask to the newly spawned participant
        if (this.arenaMask) {
          const gameParticipant = this.playerManager.getParticipant(participantId);
          if (gameParticipant) {
            gameParticipant.container.setMask(this.arenaMask);
            logger.game.debug(`[Game] Arena mask applied to participant ${participantId}`);
          }
        }
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

  private getCharacterConfig(skinId: number): {
    name: string;
    spriteOffsetY: number;
    baseScale: number;
  } {
    const character = this.characters.find((char) => char.id === skinId);
    if (!character) {
      return { name: `Character ${skinId}`, spriteOffsetY: 0, baseScale: 1.0 };
    }
    return {
      name: character.name,
      spriteOffsetY: character.spriteOffsetY ?? 0,
      baseScale: character.baseScale ?? 1.0,
    };
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

  /**
   * Create arena mask based on current map
   * bg1 (Classic Arena) uses mask_classic
   * bg2 (Mystic Forest/Secte) uses mask_secte
   */
  private createArenaMask(mapId: number) {
    // Map background IDs to mask keys
    const maskKeys: { [key: number]: string } = {
      1: "mask_classic",
      2: "mask_secte",
    };

    const maskKey = maskKeys[mapId];
    if (!maskKey) {
      logger.game.warn(`[Game] No mask defined for map ID ${mapId}`);
      return;
    }

    // Check if mask texture exists
    if (!this.textures.exists(maskKey)) {
      logger.game.error(`[Game] Mask texture '${maskKey}' not found!`);
      return;
    }

    // Destroy old mask if it exists
    if (this.arenaMask) {
      this.arenaMask.destroy();
      this.arenaMask = null;
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
    this.currentMapId = mapId;
    logger.game.debug(`[Game] Arena mask created using ${maskKey} with scale ${RESOLUTION_SCALE}`);
  }

  /**
   * Remove arena masks from all participants
   * Called when transitioning to battle phase (when characters run to center)
   */
  private removeArenaMasks() {
    logger.game.debug("[Game] Removing arena masks from all participants");
    const participants = this.playerManager.getParticipants();
    participants.forEach((participant) => {
      if (participant.container) {
        participant.container.clearMask();
      }
    });
    logger.game.debug("[Game] Arena masks removed");
  }

  shutdown() {
    // Clean up event listeners
    EventBus.off("play-insert-coin-sound");
    EventBus.off("start-battle-phase");
    EventBus.off("start-celebration");
    EventBus.off("cleanup-game");
    EventBus.off("sound-settings-changed");
    EventBus.off("boss-info-update");

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

    // Clean up music
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

    this.tweens.killAll();
    this.time.removeAllEvents();

    // Reset game state
    this.gameState = null;
    this.introPlayed = false;

    logger.game.debug("[Game] Scene shutdown complete");
  }
}
