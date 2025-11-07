import { Game as PhaserGame } from "phaser";
import { EventBus } from "../EventBus";
import { GamePhase } from "./GamePhaseManager";
import { logger } from "../../lib/logger";

/**
 * SceneManager - Centralized Scene Transition Controller
 *
 * Single responsibility: Handle ALL scene transitions based on game phase changes.
 * This removes the need for individual scenes to manage their own transitions.
 *
 * Flow:
 * 1. GamePhaseManager detects phase change
 * 2. Emits "game-phase-changed" event
 * 3. SceneManager listens and handles appropriate transition
 * 4. Scenes remain decoupled and focus only on rendering
 */
export class SceneManager {
  private game: PhaserGame;
  private currentPhase: GamePhase = GamePhase.IDLE;
  private isTransitioning: boolean = false;
  private lastBlockchainStatus: number | string | null = null;

  constructor(game: PhaserGame) {
    this.game = game;
    logger.game.debug("[SceneManager] 🎬 Initialized");
    this.listenToPhaseChanges();
    this.listenToBlockchainUpdates();
    this.listenToPlayerNamesUpdates();
  }

  private listenToPhaseChanges() {
    EventBus.on("game-phase-changed", (newPhase: GamePhase) => {
      const oldPhase = this.currentPhase;

      console.log("🔔 [SceneManager] EventBus received 'game-phase-changed' event");
      console.log(`   Old Phase: ${oldPhase}`);
      console.log(`   New Phase: ${newPhase}`);

      // Prevent duplicate processing
      if (oldPhase === newPhase) {
        console.log("   ⚠️ Same phase, skipping");
        return;
      }

      logger.game.debug(`[SceneManager] 🎬 Phase change detected: ${oldPhase} → ${newPhase}`);
      this.currentPhase = newPhase;

      // Handle scene transitions based on phase changes
      this.handleSceneTransition(oldPhase, newPhase);
    });

    console.log("✅ [SceneManager] Now listening to 'game-phase-changed' events");
    logger.game.debug("[SceneManager] Listening to game-phase-changed events");
  }

  private listenToBlockchainUpdates() {
    EventBus.on("blockchain-state-update", (gameState: any) => {
      console.log("🔗 [SceneManager] Blockchain state update received:", {
        hasGameState: !!gameState,
        status: gameState?.status,
      });

      if (!gameState) {
        // No active game
        if (this.currentPhase !== GamePhase.IDLE) {
          console.log("   → No active game, triggering IDLE phase");
          EventBus.emit("game-phase-changed", GamePhase.IDLE);
        }
        this.lastBlockchainStatus = null;
        return;
      }

      const status = gameState.status;

      // Detect game start (status changed to Waiting)
      if (status !== this.lastBlockchainStatus) {
        console.log(`   → Blockchain status changed: ${this.lastBlockchainStatus} → ${status}`);

        const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
        if (isWaiting && this.currentPhase === GamePhase.IDLE) {
          console.log("   → Game starting! Emitting WAITING phase");
          EventBus.emit("game-phase-changed", GamePhase.WAITING);
        }

        this.lastBlockchainStatus = status;
      }

      // Update active scene with blockchain data
      this.updateActiveScene(gameState);
    });

    console.log("✅ [SceneManager] Now listening to 'blockchain-state-update' events");
  }

  private listenToPlayerNamesUpdates() {
    EventBus.on("player-names-update", (playerNames: Array<{ walletAddress: string; displayName: string | null }>) => {
      logger.game.debug("[SceneManager] Player names update received:", playerNames?.length || 0);

      // Update Game scene with player names
      const gameScene = this.game.scene.getScene("Game");
      if (gameScene && gameScene.scene.isActive()) {
        (gameScene as any).setPlayerNames?.(playerNames);
      }
    });

    console.log("✅ [SceneManager] Now listening to 'player-names-update' events");
  }

  private updateActiveScene(gameState: any) {
    const activeScenes = this.game.scene.getScenes(true);
    if (activeScenes.length === 0) return;

    const activeScene = activeScenes[0];
    const sceneKey = activeScene.scene.key;

    // Only update Game scene (Demo scene doesn't need blockchain data)
    if (sceneKey === "Game") {
      console.log(`   → Updating Game scene with blockchain data`);
      (activeScene as any).updateGameState?.(gameState);
    }
  }

  private handleSceneTransition(oldPhase: GamePhase, newPhase: GamePhase) {
    console.log(`🔄 [SceneManager] handleSceneTransition called`);
    console.log(`   Old: ${oldPhase} → New: ${newPhase}`);
    console.log(`   isTransitioning: ${this.isTransitioning}`);

    // Prevent overlapping transitions
    if (this.isTransitioning) {
      console.log("   ⚠️ Already transitioning, skipping");
      logger.game.warn("[SceneManager] ⚠️ Already transitioning, skipping");
      return;
    }

    // Demo → Game (Real game starts)
    if (oldPhase === GamePhase.IDLE && newPhase === GamePhase.WAITING) {
      console.log("   ✅ Condition matched: IDLE → WAITING");
      console.log("   🎮 Starting Demo → Game transition");
      logger.game.debug("[SceneManager] 🎮 Transitioning: Demo → Game");
      this.transitionToGame();
    }
    // Game → Demo (Game cleanup complete)
    else if (oldPhase === GamePhase.CLEANUP && newPhase === GamePhase.IDLE) {
      console.log("   ✅ Condition matched: CLEANUP → IDLE");
      console.log("   🎮 Starting Game → Demo transition");
      logger.game.debug("[SceneManager] 🎮 Transitioning: Game → Demo");
      this.transitionToDemo();
    }
    else {
      console.log(`   ℹ️ No transition needed for ${oldPhase} → ${newPhase}`);
    }
  }

  private transitionToGame() {
    const demoScene = this.game.scene.getScene("Demo");

    if (!demoScene) {
      logger.game.error("[SceneManager] ❌ Demo scene not found!");
      return;
    }

    if (!demoScene.scene.isActive()) {
      logger.game.warn("[SceneManager] ⚠️ Demo scene not active, cannot transition");
      return;
    }

    this.isTransitioning = true;
    logger.game.debug("[SceneManager] Starting Demo → Game transition with wipe effect");

    // Create wipe transition effect
    const camera = demoScene.cameras.main;
    const fx = camera.postFX.addWipe();

    // Listen for transition complete
    demoScene.events.once("transitionout", () => {
      logger.game.debug("[SceneManager] ✅ Demo → Game transition complete");
      this.isTransitioning = false;

      // Notify App.tsx that transition is complete so it can update Game scene
      console.log("   → Emitting 'scene-transition-complete' event");
      EventBus.emit("scene-transition-complete", "Game");
    });

    demoScene.scene.transition({
      target: "Game",
      duration: 1000,
      moveBelow: true,
      onUpdate: (progress: number) => {
        fx.progress = progress;
      },
    });
  }

  private transitionToDemo() {
    const gameScene = this.game.scene.getScene("Game") as any;

    if (!gameScene) {
      logger.game.error("[SceneManager] ❌ Game scene not found!");
      return;
    }

    if (!gameScene.scene.isActive()) {
      logger.game.warn("[SceneManager] ⚠️ Game scene not active, cannot transition");
      return;
    }

    this.isTransitioning = true;
    logger.game.debug("[CLEANUP] SceneManager.transitionToDemo() - Preparing transition");

    // CRITICAL: Force clear all participants BEFORE transition starts
    // This ensures Game scene containers are destroyed before Demo scene shows
    if (gameScene.playerManager) {
      logger.game.debug("[CLEANUP] Force clearing Game scene participants before transition");
      const participantCount = gameScene.playerManager.getParticipants().size;
      logger.game.debug(`[CLEANUP] Game scene has ${participantCount} participants to clear`);
      gameScene.playerManager.clearParticipants();
      logger.game.debug(`[CLEANUP] Game scene participants cleared, remaining: ${gameScene.playerManager.getParticipants().size}`);
    }

    // Also clear all tweens and game objects to be safe
    gameScene.tweens.killAll();

    // FORCE CLEAR: Destroy ALL children in the Game scene (nuclear option)
    // This catches any lingering containers that weren't in the participants Map
    const childrenCount = gameScene.children.list.length;
    logger.game.debug(`[CLEANUP] Game scene has ${childrenCount} total children before force clear`);

    // Get all containers in the scene and destroy them
    const containers = gameScene.children.list.filter((child: any) => child.type === 'Container');
    logger.game.debug(`[CLEANUP] Found ${containers.length} containers to force destroy`);
    containers.forEach((container: any, index: number) => {
      logger.game.debug(`[CLEANUP]   Force destroying container ${index}: depth=${container.depth}, alpha=${container.alpha}`);
      container.destroy();
    });

    logger.game.debug(`[CLEANUP] Game scene children after force clear: ${gameScene.children.list.length}`);

    // Create wipe transition effect
    const camera = gameScene.cameras.main;
    const fx = camera.postFX.addWipe();

    // Listen for transition complete
    gameScene.events.once("transitionout", () => {
      logger.game.debug("[CLEANUP] Game → Demo transition complete");
      this.isTransitioning = false;

      // Notify App.tsx that transition is complete
      console.log("   → Emitting 'scene-transition-complete' event");
      EventBus.emit("scene-transition-complete", "Demo");
    });

    logger.game.debug("[CLEANUP] Starting scene transition (1000ms wipe)");
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
   * Clean up event listeners when destroying
   */
  destroy() {
    EventBus.off("game-phase-changed");
    EventBus.off("scene-transition-complete");
    EventBus.off("blockchain-state-update");
    logger.game.debug("[SceneManager] 🗑️ Destroyed");
  }
}
