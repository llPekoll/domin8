import { Game as PhaserGame } from "phaser";
import { EventBus } from "../EventBus";
import { logger } from "../../lib/logger";

/**
 * GlobalGameStateManager - Single Source of Truth for Game State
 *
 * Unified manager that replaces both SceneManager and GamePhaseManager
 *
 * Responsibilities:
 * 1. Detect game phase from blockchain state
 * 2. Handle initial state on page load
 * 3. Manage scene transitions (Demo ↔ Game)
 * 4. Coordinate animations via events
 * 5. Track celebration windows for late joiners
 *
 * Key Design Principles:
 * - Single source of truth for game phase
 * - Scenes are pure rendering (react to events, no state logic)
 * - All phase detection happens here
 * - All timing coordination happens here
 */

export enum GamePhase {
  IDLE = "idle", // No game, show demo
  INSERT_COIN = "insert_coin", // Game created, waiting for first bet (status=2)
  WAITING = "waiting", // Accepting bets, countdown active (status=0)
  VRF_PENDING = "vrf_pending", // Countdown ended, waiting for winner
  FIGHTING = "fighting", // Battle animations (3s)
  CELEBRATING = "celebrating", // Winner celebration (15s)
  CLEANUP = "cleanup", // Fading out, preparing for next game
}

export class GlobalGameStateManager {
  private game: PhaserGame;
  private currentPhase: GamePhase = GamePhase.IDLE;
  private isFirstUpdate: boolean = true;
  private isTransitioning: boolean = false;

  // Timing state
  private celebrationStartTime: number = 0;
  private lastCountdownSeconds: number = -1;
  private currentGameEndTimestamp: number = 0; // Track current game's end time

  // Animation tracking
  private battleSequenceStarted: boolean = false;
  private celebrationSequenceStarted: boolean = false;

  // Initial state handling
  private pendingInitialGameState: any = null;

  // Store current game state for phase transitions
  private currentGameState: any = null;

  // Local countdown timer
  private countdownInterval: NodeJS.Timeout | null = null;

  // Constants
  private readonly CELEBRATION_DURATION = 7000;
  private readonly BATTLE_DURATION = 2000;

  constructor(game: PhaserGame) {
    this.game = game;
    logger.game.debug("[GlobalGameStateManager] 🎬 Initialized");
    this.setupEventListeners();
    this.startCountdownTimer(); // ✅ Start local timer immediately
  }

  /**
   * Start local countdown timer (checks every second)
   * This allows us to detect countdown=0 immediately without waiting for blockchain updates
   */
  private startCountdownTimer() {
    if (this.countdownInterval) return;

    this.countdownInterval = setInterval(() => {
      this.checkLocalCountdown();
    }, 1000); // Check every second

    logger.game.debug("[GlobalGameStateManager] ⏱️ Local countdown timer started");
  }

  /**
   * Check countdown locally (independent of blockchain updates)
   */
  private checkLocalCountdown() {
    // Only check during WAITING phase with valid endTimestamp
    if (this.currentPhase !== GamePhase.WAITING) return;
    if (!this.currentGameEndTimestamp || this.currentGameEndTimestamp === 0) return;

    const currentTime = Date.now();
    const timeRemaining = Math.max(0, this.currentGameEndTimestamp - currentTime);
    const countdownSeconds = Math.ceil(timeRemaining / 1000);

    // Detect countdown ending (transition from >0 to 0)
    if (countdownSeconds === 0 && this.lastCountdownSeconds > 0) {
      logger.game.debug("=".repeat(60));
      logger.game.debug("[GlobalGameStateManager] ⏰ LOCAL COUNTDOWN REACHED 0!");
      logger.game.debug("[GlobalGameStateManager] 🎲 Transitioning to VRF_PENDING");
      logger.game.debug("=".repeat(60));

      // Transition to VRF_PENDING (wait for winner from blockchain)
      this.currentPhase = GamePhase.VRF_PENDING;
      EventBus.emit("game-phase-changed", GamePhase.VRF_PENDING);
    }

    this.lastCountdownSeconds = countdownSeconds;
  }

  private setupEventListeners() {
    logger.game.debug(`[GlobalGameStateManager] [${Date.now()}] Setting up event listeners`);

    // ✅ Listen to blockchain updates from App.tsx
    // Note: Preloader handles initial scene selection, we only handle runtime updates
    EventBus.on("blockchain-state-update", (gameState: any) => {
      logger.game.debug(
        `[GlobalGameStateManager] [${Date.now()}] 📥 blockchain-state-update event received`
      );
      this.handleBlockchainUpdate(gameState);
    });

    // Listen to player names updates
    EventBus.on(
      "player-names-update",
      (playerNames: Array<{ walletAddress: string; displayName: string | null }>) => {
        this.updateActiveSceneWithPlayerNames(playerNames);
      }
    );

    // Listen for Preloader complete event (Preloader now handles initial scene selection)
    EventBus.on("preloader-complete", () => {
      logger.game.debug(
        `[GlobalGameStateManager] [${Date.now()}] 🎨 preloader-complete event received`
      );
      logger.game.debug(
        "[GlobalGameStateManager] Preloader started initial scene, we'll handle runtime updates"
      );
      // No action needed - Preloader already started the correct scene
      // We only handle runtime blockchain updates now
    });

    // Listen for scene ready event to update Game scene with blockchain state
    EventBus.on("current-scene-ready", (scene: any) => {
      const timestamp = Date.now();
      logger.game.debug(
        `[GlobalGameStateManager] [${timestamp}] 🎬 Scene ready:`,
        scene.scene.key,
        {
          hasPendingState: !!this.pendingInitialGameState,
          isFirstUpdate: this.isFirstUpdate,
          isTransitioning: this.isTransitioning,
        }
      );

      // ✅ If Game scene just started and we have pending state (from Demo→Game transition), update it
      if (scene.scene.key === "Game" && this.pendingInitialGameState && !this.isTransitioning) {
        logger.game.debug(
          `[GlobalGameStateManager] [${timestamp}] ✅ Updating Game scene with pending state`,
          {
            hasBets: !!this.pendingInitialGameState.bets,
            betCount: this.pendingInitialGameState.bets?.length || 0,
            hasWallets: !!this.pendingInitialGameState.wallets,
            walletCount: this.pendingInitialGameState.wallets?.length || 0,
          }
        );
        this.updateActiveSceneWithGameState(this.pendingInitialGameState);
        this.pendingInitialGameState = null; // Clear pending state
      }
    });

    logger.game.debug("[GlobalGameStateManager] Event listeners established");
  }

  /**
   * Main entry point: handle blockchain state updates
   */
  private handleBlockchainUpdate(gameState: any) {
    const timestamp = Date.now();
    logger.game.debug(`[GlobalGameStateManager] [${timestamp}] 🔗 Blockchain state received`, {
      hasGameState: !!gameState,
      status: gameState?.status,
      isFirstUpdate: this.isFirstUpdate,
      hasBets: !!gameState?.bets,
      betCount: gameState?.bets?.length || 0,
    });

    // ✅ Guard: Ignore updates while Preloader is active
    // Preloader reads activeGameData directly, no need to coordinate via events
    const activeScenes = this.game.scene.getScenes(true);
    const activeSceneKey = activeScenes[0]?.scene.key;
    logger.game.debug(`[GlobalGameStateManager] [${timestamp}] Active scene check:`, {
      activeSceneCount: activeScenes.length,
      activeSceneKey,
      isPreloaderOrBoot: activeSceneKey === "Preloader" || activeSceneKey === "Boot",
    });

    if (activeSceneKey === "Preloader" || activeSceneKey === "Boot") {
      logger.game.debug(
        `[GlobalGameStateManager] [${timestamp}] ⏸️ Ignoring update - Preloader is active (will read activeGameData directly)`
      );
      return; // Just ignore, Preloader handles initial state
    }

    // ✅ Store endTimestamp for local countdown timer
    const endTimestamp = gameState?.endTimestamp || gameState?.endDate;
    if (endTimestamp && endTimestamp !== 0) {
      this.currentGameEndTimestamp =
        endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;
    }

    // Determine what phase we should be in
    const targetPhase = this.determinePhaseFromState(gameState);

    // ✅ On first update after Preloader, just update the scene data (Preloader already started the scene)
    if (this.isFirstUpdate) {
      this.isFirstUpdate = false;
      logger.game.debug(
        `[GlobalGameStateManager] [${timestamp}] First runtime update, updating scene with game state`
      );
      this.currentPhase = targetPhase;
      EventBus.emit("game-phase-changed", targetPhase);

      // Update the scene that Preloader started
      if (!this.isTransitioning) {
        this.updateActiveSceneWithGameState(gameState);
      }
      return;
    }

    // Handle subsequent updates (phase transitions)
    this.handlePhaseTransition(targetPhase, gameState);

    // Update active scene with latest data (unless we're transitioning)
    // During transition, Game scene will be updated when it emits "current-scene-ready"
    if (!this.isTransitioning) {
      this.updateActiveSceneWithGameState(gameState);
    }
  }

  /**
   * Determine which phase we should be in based on blockchain state
   */
  private determinePhaseFromState(gameState: any): GamePhase {
    if (!gameState) {
      logger.game.debug("[GlobalGameStateManager] No game state → IDLE");
      return GamePhase.IDLE;
    }

    const status = gameState.status;
    // Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
    const isInsertCoin = status === 2 || status === "waiting" || status === "Waiting"; // No bets yet
    const isOpen = status === 0 || status === "open" || status === "Open"; // Bets placed, countdown active
    const hasWinner = this.checkHasWinner(gameState);

    logger.game.debug("[GlobalGameStateManager] 🔍 Phase detection:", {
      status,
      isInsertCoin,
      isOpen,
      hasWinner,
      hasBets: !!gameState.bets,
      betCount: gameState.bets?.length || 0,
    });

    // Get timing info
    const endTimestamp = gameState.endTimestamp || gameState.endDate;
    let gameHasEnded = false;
    let celebrationElapsed = -1;

    if (endTimestamp && endTimestamp !== 0) {
      const endTimestampMs = endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;
      const currentTime = Date.now();
      gameHasEnded = currentTime >= endTimestampMs;

      if (gameHasEnded) {
        celebrationElapsed = currentTime - endTimestampMs;
      }
    }

    // Phase decision tree (order matters!)

    // 1. If winner exists and within 15s celebration window → CELEBRATING
    if (hasWinner && celebrationElapsed >= 0 && celebrationElapsed < this.CELEBRATION_DURATION) {
      logger.game.debug(
        `[GlobalGameStateManager] 🎉 Phase: CELEBRATING (${celebrationElapsed}ms elapsed)`
      );
      return GamePhase.CELEBRATING;
    }

    // 2. If game ended but no winner yet → VRF_PENDING
    if (gameHasEnded && !hasWinner) {
      logger.game.debug("[GlobalGameStateManager] ⏳ Phase: VRF_PENDING");
      return GamePhase.VRF_PENDING;
    }

    // 3. If status=2 (WAITING, no bets yet) → INSERT_COIN
    if (isInsertCoin) {
      logger.game.debug("[GlobalGameStateManager] 🪙 Phase: INSERT_COIN");
      return GamePhase.INSERT_COIN;
    }

    // 4. If status=0 (OPEN, has bets) and game hasn't ended → WAITING
    if (isOpen && !gameHasEnded) {
      logger.game.debug("[GlobalGameStateManager] ⏰ Phase: WAITING");
      return GamePhase.WAITING;
    }

    // 5. Default → IDLE (show demo)
    logger.game.debug("[GlobalGameStateManager] 😴 Phase: IDLE (default)");
    return GamePhase.IDLE;
  }

  /**
   * Check if game has a valid winner
   */
  private checkHasWinner(gameState: any): boolean {
    if (!gameState.winner) return false;

    const winnerStr =
      typeof gameState.winner === "string" ? gameState.winner : gameState.winner.toBase58?.();

    return (
      !!winnerStr &&
      winnerStr !== "11111111111111111111111111111111" &&
      winnerStr !== "SystemProgram11111111111111111111111111111"
    );
  }

  /**
   * Handle phase transitions during runtime
   */
  private handlePhaseTransition(targetPhase: GamePhase, gameState: any) {
    const oldPhase = this.currentPhase;

    // ✅ Special case: VRF_PENDING + winner arrives → Go to FIGHTING
    if (oldPhase === GamePhase.VRF_PENDING && this.checkHasWinner(gameState)) {
      logger.game.debug("=".repeat(60));
      logger.game.debug("[GlobalGameStateManager] 🏆 WINNER ARRIVED!");
      logger.game.debug("[GlobalGameStateManager] ⚔️ Transitioning VRF_PENDING → FIGHTING");
      logger.game.debug("=".repeat(60));

      this.currentGameState = gameState; // Store for later phases
      this.currentPhase = GamePhase.FIGHTING;
      EventBus.emit("game-phase-changed", GamePhase.FIGHTING);
      this.updateActiveSceneWithGameState(gameState); // Update scene with winner data
      this.startBattleSequence();
      return;
    }

    // No change, check for celebration progress
    if (oldPhase === targetPhase) {
      this.checkCelebrationProgress();
      return;
    }

    logger.game.debug(`[GlobalGameStateManager] 🔄 Phase transition: ${oldPhase} → ${targetPhase}`);

    const previousPhase = this.currentPhase;
    this.currentPhase = targetPhase;

    // Emit phase change for UI components
    EventBus.emit("game-phase-changed", targetPhase);

    // ✅ If transitioning from IDLE to active game, store pending state
    // Game scene will be started via transition and needs data when ready
    if (previousPhase === GamePhase.IDLE && targetPhase !== GamePhase.IDLE) {
      this.pendingInitialGameState = gameState;
      logger.game.debug(
        "[GlobalGameStateManager] 📦 Stored pending game state for Demo→Game transition",
        {
          hasBets: !!gameState?.bets,
          betCount: gameState?.bets?.length || 0,
          hasWallets: !!gameState?.wallets,
          walletCount: gameState?.wallets?.length || 0,
          status: gameState?.status,
        }
      );
    }

    // Handle scene transitions
    this.handleSceneTransition(previousPhase, targetPhase);

    // Handle phase-specific actions
    this.handlePhaseActions(previousPhase, targetPhase, gameState);
  }

  /**
   * Check celebration progress and cleanup when done
   */
  private checkCelebrationProgress() {
    if (this.currentPhase !== GamePhase.CELEBRATING) return;
    if (this.celebrationStartTime === 0) return;

    const elapsed = Date.now() - this.celebrationStartTime;
    if (elapsed >= this.CELEBRATION_DURATION) {
      logger.game.debug("[GlobalGameStateManager] 🎉 Celebration complete, starting cleanup");
      this.currentPhase = GamePhase.CLEANUP;
      EventBus.emit("game-phase-changed", GamePhase.CLEANUP);
      this.startCleanupSequence();
    }
  }

  /**
   * Handle scene transitions based on phase changes
   */
  private handleSceneTransition(oldPhase: GamePhase, newPhase: GamePhase) {
    // IDLE → Any game phase: Show Game scene
    if (oldPhase === GamePhase.IDLE && newPhase !== GamePhase.IDLE) {
      this.transitionToGame();
    }

    // CLEANUP → IDLE: Show Demo scene
    if (oldPhase === GamePhase.CLEANUP && newPhase === GamePhase.IDLE) {
      this.transitionToDemo();
    }
  }

  /**
   * Handle phase-specific actions (animations, timers, etc.)
   */
  private handlePhaseActions(oldPhase: GamePhase, newPhase: GamePhase, gameState: any) {
    // Reset phase-specific state when leaving phases
    if (oldPhase === GamePhase.FIGHTING) {
      this.battleSequenceStarted = false;
    }
    if (oldPhase === GamePhase.CELEBRATING) {
      this.celebrationSequenceStarted = false;
      this.celebrationStartTime = 0;
    }

    // Handle entering new phases
    switch (newPhase) {
      case GamePhase.IDLE:
        // Notify demo scene to start
        EventBus.emit("demo-mode-active", true);
        break;

      case GamePhase.WAITING:
        // Stop demo mode
        EventBus.emit("game-started");
        break;

      case GamePhase.FIGHTING:
        this.startBattleSequence();
        break;

      case GamePhase.CELEBRATING:
        this.startCelebrationSequence(gameState, 0);
        break;

      case GamePhase.CLEANUP:
        this.startCleanupSequence();
        break;
    }
  }

  /**
   * Start battle animation sequence
   */
  private startBattleSequence() {
    if (this.battleSequenceStarted) return;

    this.battleSequenceStarted = true;

    logger.game.debug("[GlobalGameStateManager] ⚔️ Starting battle sequence (3s)");

    // Tell Game scene to start battle animations
    EventBus.emit("start-battle-phase");

    // Transition to CELEBRATING after battle duration
    setTimeout(() => {
      if (this.currentPhase === GamePhase.FIGHTING) {
        logger.game.debug(
          "[GlobalGameStateManager] ⚔️ Battle complete, transitioning to CELEBRATING"
        );

        this.currentPhase = GamePhase.CELEBRATING;
        EventBus.emit("game-phase-changed", GamePhase.CELEBRATING);

        // Start celebration with elapsedTime=0 (we just finished FIGHTING)
        if (this.currentGameState) {
          this.startCelebrationSequence(this.currentGameState, 0);
        } else {
          logger.game.error("[GlobalGameStateManager] ❌ No game state available for celebration!");
        }
      }
    }, this.BATTLE_DURATION);
  }

  /**
   * Start celebration sequence
   * @param elapsedTime - Time already elapsed (for late joiners)
   */
  private startCelebrationSequence(gameState: any, elapsedTime: number = 0) {
    if (this.celebrationSequenceStarted) return;
    if (!this.checkHasWinner(gameState)) return;

    logger.game.debug("[GlobalGameStateManager] 🎉 Starting celebration", {
      elapsedTime,
      remainingTime: this.CELEBRATION_DURATION - elapsedTime,
    });

    this.celebrationSequenceStarted = true;
    this.celebrationStartTime = Date.now() - elapsedTime;

    // Tell Game scene to start celebration animations
    const winnerStr =
      typeof gameState.winner === "string" ? gameState.winner : gameState.winner.toBase58?.();

    EventBus.emit("start-celebration", {
      winner: winnerStr,
      remainingTime: this.CELEBRATION_DURATION - elapsedTime,
    });

    // ✅ Schedule cleanup to run after celebration ends
    const remainingTime = this.CELEBRATION_DURATION - elapsedTime;
    setTimeout(() => {
      logger.game.debug("[GlobalGameStateManager] 🎉 Celebration time elapsed, starting cleanup");
      this.startCleanupSequence();
    }, remainingTime);
  }

  /**
   * Start cleanup sequence
   */
  private startCleanupSequence() {
    logger.game.debug("[GlobalGameStateManager] 🧹 Starting cleanup");

    // Set phase to CLEANUP
    this.currentPhase = GamePhase.CLEANUP;
    EventBus.emit("game-phase-changed", GamePhase.CLEANUP);

    // Tell Game scene to cleanup (fade out animations)
    EventBus.emit("cleanup-game");

    // Transition back to Demo scene after cleanup animations (1 second fade)
    setTimeout(() => {
      if (this.currentPhase === GamePhase.CLEANUP) {
        logger.game.debug("[GlobalGameStateManager] Cleanup complete, transitioning to Demo");

        // ✅ Reset all game state
        this.currentPhase = GamePhase.IDLE;
        this.currentGameState = null;
        this.currentGameEndTimestamp = 0;
        this.lastCountdownSeconds = -1;
        this.battleSequenceStarted = false;
        this.celebrationSequenceStarted = false;
        this.celebrationStartTime = 0;

        EventBus.emit("game-phase-changed", GamePhase.IDLE);

        // ✅ Directly transition to Demo scene
        this.transitionToDemo();
      }
    }, 1000);
  }

  /**
   * Transition from Demo to Game scene
   */
  private transitionToGame() {
    const demoScene = this.game.scene.getScene("Demo");
    if (!demoScene?.scene.isActive()) return;
    if (this.isTransitioning) return;

    logger.game.debug("[GlobalGameStateManager] 🎬 Transitioning: Demo → Game");
    this.isTransitioning = true;

    // Create wipe transition effect
    const camera = demoScene.cameras.main;
    const fx = camera.postFX.addWipe();

    demoScene.events.once("transitionout", () => {
      this.isTransitioning = false;
      EventBus.emit("scene-transition-complete", "Game");

      // ✅ Update Game scene with pending state after transition completes
      if (this.pendingInitialGameState) {
        logger.game.debug(
          "[GlobalGameStateManager] 🎯 Transition complete, updating Game scene with pending state"
        );
        setTimeout(() => {
          this.updateActiveSceneWithGameState(this.pendingInitialGameState);
          this.pendingInitialGameState = null;
        }, 100); // Small delay to ensure Game scene is fully active
      }
    });

    demoScene.scene.transition({
      target: "Game",
      duration: 700,
      moveBelow: true,
      onUpdate: (progress: number) => {
        fx.progress = progress;
      },
    });
  }

  /**
   * Transition from Game to Demo scene
   */
  private transitionToDemo() {
    const gameScene = this.game.scene.getScene("Game") as any;
    if (!gameScene?.scene.isActive()) return;
    if (this.isTransitioning) return;

    logger.game.debug("[GlobalGameStateManager] 🎬 Transitioning: Game → Demo");
    this.isTransitioning = true;

    // Create wipe transition effect
    const camera = gameScene.cameras.main;
    const fx = camera.postFX.addWipe();

    gameScene.events.once("transitionout", () => {
      this.isTransitioning = false;
      EventBus.emit("scene-transition-complete", "Demo");
    });

    gameScene.scene.transition({
      target: "Demo",
      duration: 1000,
      moveBelow: true,
      onUpdate: (progress: number) => {
        fx.progress = progress;
      },
    });
  }

  /**
   * Update active scene with blockchain game state
   */
  private updateActiveSceneWithGameState(gameState: any) {
    const activeScenes = this.game.scene.getScenes(true);

    logger.game.debug("[GlobalGameStateManager] 🔄 updateActiveSceneWithGameState called", {
      activeSceneCount: activeScenes.length,
      activeSceneKey: activeScenes[0]?.scene.key,
      hasBets: !!gameState?.bets,
      betCount: gameState?.bets?.length || 0,
    });

    if (activeScenes.length === 0) {
      logger.game.warn("[GlobalGameStateManager] ⚠️ No active scenes found!");
      return;
    }

    const activeScene = activeScenes[0];
    const sceneKey = activeScene.scene.key;

    // Only Game scene needs blockchain data
    if (sceneKey === "Game") {
      logger.game.debug("[GlobalGameStateManager] ✅ Calling Game.updateGameState()");
      (activeScene as any).updateGameState?.(gameState);
    } else {
      logger.game.debug("[GlobalGameStateManager] ⏭️ Skipping update - active scene is", sceneKey);
    }
  }

  /**
   * Update active scene with player names
   */
  private updateActiveSceneWithPlayerNames(
    playerNames: Array<{ walletAddress: string; displayName: string | null }>
  ) {
    const gameScene = this.game.scene.getScene("Game");
    if (gameScene?.scene.isActive()) {
      (gameScene as any).setPlayerNames?.(playerNames);
    }
  }

  /**
   * Get current phase (for external consumers)
   */
  getCurrentPhase(): GamePhase {
    return this.currentPhase;
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    // Stop countdown timer
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      logger.game.debug("[GlobalGameStateManager] ⏱️ Countdown timer stopped");
    }

    EventBus.off("blockchain-state-update");
    EventBus.off("player-names-update");
    EventBus.off("current-scene-ready");
    EventBus.off("preloader-complete");
    logger.game.debug("[GlobalGameStateManager] 🗑️ Destroyed");
  }
}
