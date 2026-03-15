import { Game as PhaserGame } from "phaser";
import { EventBus } from "../EventBus";
import { logger } from "../../lib/logger";
import { GAME_TIMING } from "../constants";

/**
 * GlobalGameStateManager - Single Source of Truth for Game State
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *                              GAME LOOP (NO DEMO)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a continuous loop - no demo mode:
 *
 *  1. MAP_CAROUSEL (IDLE) → Rolling backgrounds, waiting for game creation
 *  2. INSERT_COIN (status=2) → Game created, waiting for first bet
 *  3. WAITING (status=0) → First bet placed, 60s countdown
 *  4. VRF_PENDING → Countdown ended, waiting for winner
 *  5. FIGHTING → 2s battle animations
 *  6. CELEBRATING → 10s winner celebration
 *  7. CLEANUP → 1s fade, back to MapCarousel
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Responsibilities:
 * 1. Detect game phase from blockchain state
 * 2. Handle initial state on page load
 * 3. Manage scene transitions (MapCarousel ↔ Game)
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
  IDLE = "idle", // No game, show MapCarousel (rolling backgrounds)
  INSERT_COIN = "insert_coin", // Game created, waiting for first bet (status=2)
  WAITING = "waiting", // Accepting bets, 60s countdown active (status=0)
  VRF_PENDING = "vrf_pending", // Countdown ended, waiting for winner
  FIGHTING = "fighting", // Battle animations (2s)
  CELEBRATING = "celebrating", // Winner celebration (10s)
  CLEANUP = "cleanup", // Fading out (1s), transition to MapCarousel
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

  // Boss wallet (previous winner)
  private bossWallet: string | null = null;

  // Local countdown timer
  private countdownInterval: NodeJS.Timeout | null = null;

  // Use constants from game/constants.ts
  private readonly CELEBRATION_DURATION = GAME_TIMING.CELEBRATION_DURATION;
  private readonly BATTLE_DURATION = GAME_TIMING.BATTLE_DURATION;

  constructor(game: PhaserGame) {
    this.game = game;
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
      // Transition to VRF_PENDING (wait for winner from blockchain)
      this.currentPhase = GamePhase.VRF_PENDING;
      EventBus.emit("game-phase-changed", GamePhase.VRF_PENDING);
    }

    this.lastCountdownSeconds = countdownSeconds;
  }

  private setupEventListeners() {
    // ✅ Listen to blockchain updates from App.tsx
    // Note: Preloader handles initial scene selection, we only handle runtime updates
    EventBus.on(
      "blockchain-state-update",
      (data: { gameState: any; bossWallet: string | null }) => {
        // Store bossWallet for use when updating Game scene
        this.bossWallet = data.bossWallet;
        this.handleBlockchainUpdate(data.gameState);
      }
    );

    // Note: Player names are now handled via unified participants-update event
    // which goes directly to Game.ts (no need to relay through GlobalGameStateManager)

    // Listen for Preloader complete event (Preloader now handles initial scene selection)
    EventBus.on("preloader-complete", () => {
      // No action needed - Preloader already started the correct scene
      // We only handle runtime blockchain updates now
    });

    // Listen for scene ready event to update Game scene with blockchain state
    EventBus.on("current-scene-ready", (scene: any) => {
      // ✅ If Game scene just started and we have pending state (from MapCarousel→Game transition), update it
      if (scene.scene.key === "Game" && this.pendingInitialGameState && !this.isTransitioning) {
        this.updateActiveSceneWithGameState(this.pendingInitialGameState);
        this.pendingInitialGameState = null; // Clear pending state
      }
    });
  }

  /**
   * Main entry point: handle blockchain state updates
   */
  private handleBlockchainUpdate(gameState: any) {
    // ✅ Guard: Ignore updates while Preloader is active
    // Preloader reads activeGameData directly, no need to coordinate via events
    const activeScenes = this.game.scene.getScenes(true);
    const activeSceneKey = activeScenes[0]?.scene.key;

    if (activeSceneKey === "Preloader" || activeSceneKey === "Boot") {
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
      return GamePhase.IDLE;
    }

    const status = gameState.status;
    // Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
    const isInsertCoin = status === 2 || status === "waiting" || status === "Waiting"; // No bets yet
    const isOpen = status === 0 || status === "open" || status === "Open"; // Bets placed, countdown active
    const hasWinner = this.checkHasWinner(gameState);

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

    // 1. If status=2 (WAITING, no bets yet) → INSERT_COIN
    // Must check before VRF_PENDING because a new game may carry stale endTimestamp
    if (isInsertCoin) {
      return GamePhase.INSERT_COIN;
    }

    // 2. If winner exists and within 15s celebration window → CELEBRATING
    if (hasWinner && celebrationElapsed >= 0 && celebrationElapsed < this.CELEBRATION_DURATION) {
      return GamePhase.CELEBRATING;
    }

    // 3. If game ended but no winner yet → VRF_PENDING
    if (gameHasEnded && !hasWinner) {
      return GamePhase.VRF_PENDING;
    }

    // 4. If status=0 (OPEN, has bets) and game hasn't ended → WAITING
    if (isOpen && !gameHasEnded) {
      return GamePhase.WAITING;
    }

    // 5. Default → IDLE (show demo)
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

    // ✅ PROTECT celebration: Never interrupt celebration with other phases
    if (oldPhase === GamePhase.CELEBRATING || oldPhase === GamePhase.FIGHTING) {
      // During battle/celebration, ignore blockchain updates that might show VRF_PENDING
      if (targetPhase === GamePhase.VRF_PENDING || targetPhase === GamePhase.INSERT_COIN) {
        return; // Don't transition
      }
    }

    // ✅ Special case: VRF_PENDING + winner arrives → Go to FIGHTING
    if (oldPhase === GamePhase.VRF_PENDING && this.checkHasWinner(gameState)) {
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

    const previousPhase = this.currentPhase;
    this.currentPhase = targetPhase;

    // Emit phase change for UI components
    EventBus.emit("game-phase-changed", targetPhase);

    // ✅ If transitioning from IDLE to active game, store pending state
    // Game scene will be started via transition and needs data when ready
    if (previousPhase === GamePhase.IDLE && targetPhase !== GamePhase.IDLE) {
      this.pendingInitialGameState = gameState;
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
      this.currentPhase = GamePhase.CLEANUP;
      EventBus.emit("game-phase-changed", GamePhase.CLEANUP);
      this.startCleanupSequence();
    }
  }

  /**
   * Handle scene transitions based on phase changes
   */
  private handleSceneTransition(oldPhase: GamePhase, newPhase: GamePhase) {
    // ✅ IDLE → Game: Let MapCarousel handle this transition!
    // MapCarousel will spin, land on the selected map, wait 3.5s, then transition to Game.
    // We do NOT auto-transition here to avoid racing with MapCarousel's animation.
    if (oldPhase === GamePhase.IDLE && newPhase !== GamePhase.IDLE) {
      // Don't call transitionToGame() - MapCarousel will do it after spin animation
      return;
    }

    // CLEANUP → IDLE: Show MapCarousel scene (we handle this)
    if (oldPhase === GamePhase.CLEANUP && newPhase === GamePhase.IDLE) {
      this.transitionToMapCarousel();
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
        // MapCarousel will show - emit event for any listeners
        EventBus.emit("carousel-active", true);
        break;

      case GamePhase.WAITING:
        // Game is active with bets
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

    // Get winner from current game state
    const winnerStr = this.currentGameState?.winner
      ? typeof this.currentGameState.winner === "string"
        ? this.currentGameState.winner
        : this.currentGameState.winner.toBase58?.()
      : null;

    // Get winning bet index from current game state
    const winningBetIndex = this.currentGameState?.winningBetIndex
      ? typeof this.currentGameState.winningBetIndex === "object" &&
        this.currentGameState.winningBetIndex.toNumber
        ? this.currentGameState.winningBetIndex.toNumber()
        : Number(this.currentGameState.winningBetIndex)
      : null;

    // Tell Game scene to start battle animations (include winner + bet index for precise kick-out)
    EventBus.emit("start-battle-phase", { winner: winnerStr, winningBetIndex });

    // Transition to CELEBRATING after battle duration
    setTimeout(() => {
      if (this.currentPhase === GamePhase.FIGHTING) {
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

    this.celebrationSequenceStarted = true;
    this.celebrationStartTime = Date.now() - elapsedTime;

    // Tell Game scene to start celebration animations
    const winnerStr =
      typeof gameState.winner === "string" ? gameState.winner : gameState.winner.toBase58?.();

    // Get winning bet index
    const winningBetIndex = gameState.winningBetIndex
      ? typeof gameState.winningBetIndex === "object" && gameState.winningBetIndex.toNumber
        ? gameState.winningBetIndex.toNumber()
        : Number(gameState.winningBetIndex)
      : null;

    EventBus.emit("start-celebration", {
      winner: winnerStr,
      winningBetIndex,
      remainingTime: this.CELEBRATION_DURATION - elapsedTime,
    });

    // ✅ Schedule cleanup to run after celebration ends
    const remainingTime = this.CELEBRATION_DURATION - elapsedTime;
    setTimeout(() => {
      this.startCleanupSequence();
    }, remainingTime);
  }

  /**
   * Start cleanup sequence
   */
  private startCleanupSequence() {
    // Set phase to CLEANUP
    this.currentPhase = GamePhase.CLEANUP;
    EventBus.emit("game-phase-changed", GamePhase.CLEANUP);

    // ✅ Reset all game state immediately
    this.currentGameState = null;
    this.currentGameEndTimestamp = 0;
    this.lastCountdownSeconds = -1;
    this.battleSequenceStarted = false;
    this.celebrationSequenceStarted = false;
    this.celebrationStartTime = 0;

    // ✅ Direct swipe transition to MapCarousel (no fade-out delay)
    this.currentPhase = GamePhase.IDLE;
    EventBus.emit("game-phase-changed", GamePhase.IDLE);
    this.transitionToMapCarousel();
  }

  /**
   * Transition from Game to MapCarousel scene
   */
  private transitionToMapCarousel() {
    const gameScene = this.game.scene.getScene("Game") as any;
    if (!gameScene?.scene.isActive()) return;
    if (this.isTransitioning) return;

    this.isTransitioning = true;

    // Create wipe transition effect
    const camera = gameScene.cameras.main;
    const fx = camera.postFX.addWipe();

    gameScene.events.once("transitionout", () => {
      this.isTransitioning = false;
      EventBus.emit("scene-transition-complete", "MapCarousel");
    });

    gameScene.scene.transition({
      target: "MapCarousel",
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

    if (activeScenes.length === 0) {
      logger.game.warn("[GlobalGameStateManager] ⚠️ No active scenes found!");
      return;
    }

    const activeScene = activeScenes[0];
    const sceneKey = activeScene.scene.key;

    // Only Game scene needs blockchain data
    if (sceneKey === "Game") {
      (activeScene as any).updateGameState?.(gameState, this.bossWallet);
    } else {
      logger.game.debug("[GlobalGameStateManager] ⏭️ Skipping update - active scene is", sceneKey);
    }
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    // Stop countdown timer
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    EventBus.off("blockchain-state-update");
    EventBus.off("current-scene-ready");
    EventBus.off("preloader-complete");
  }
}
