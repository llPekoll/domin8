import { Scene } from "phaser";
import { PlayerManager } from "./PlayerManager";
import { AnimationManager } from "./AnimationManager";
import { logger } from "../../lib/logger";
import { EventBus } from "../EventBus";

/**
 * Game Phase Manager - State Machine
 *
 * Manages game phases with proper state tracking to prevent scene switching
 * during critical moments (VRF waiting, celebration, etc.)
 */

export enum GamePhase {
  IDLE = "idle", // No game, show demo
  WAITING = "waiting", // Accepting bets (blockchain status = 0)
  VRF_PENDING = "vrf_pending", // Countdown ended, waiting for winner determination
  CELEBRATING = "celebrating", // Winner determined, 15s celebration
  FIGHTING = "fighting", // Winner determined, 15s celebration
  CLEANUP = "cleanup", // Fading out, preparing for next game
}

export class GamePhaseManager {
  private scene: Scene;
  private playerManager: PlayerManager;
  private animationManager: AnimationManager;
  private currentPhase: GamePhase = GamePhase.IDLE;
  private celebrationStartTime: number = 0;
  private readonly CELEBRATION_DURATION = 15000; // 15 seconds
  private vrfCheckCounter: number = 0; // Counter for throttling VRF phase logs
  private battleSequenceStarted: boolean = false; // Track if battle sequence has been triggered
  private resultsSequenceStarted: boolean = false; // Track if results sequence has been triggered
  private lastCountdownSeconds: number = -1; // Track countdown to detect when it reaches 0

  constructor(scene: Scene, playerManager: PlayerManager, animationManager: AnimationManager) {
    this.scene = scene;
    this.playerManager = playerManager;
    this.animationManager = animationManager;
  }

  getCurrentPhase(): GamePhase {
    return this.currentPhase;
  }

  private setPhase(newPhase: GamePhase) {
    if (this.currentPhase === newPhase) return;

    logger.game.debug(`[GamePhaseManager] Phase transition: ${this.currentPhase} → ${newPhase}`);

    const oldPhase = this.currentPhase;
    this.currentPhase = newPhase;

    // Reset phase-specific state when leaving phases
    if (oldPhase === GamePhase.VRF_PENDING) {
      this.vrfCheckCounter = 0;
    }
    if (oldPhase === GamePhase.FIGHTING) {
      this.battleSequenceStarted = false;
    }
    if (oldPhase === GamePhase.CELEBRATING) {
      this.resultsSequenceStarted = false;
      this.celebrationStartTime = 0;
    }

    // Emit event for SceneManager and UIManager to listen
    EventBus.emit("game-phase-changed", newPhase);
  }

  /**
   * Trigger VRF phase when countdown reaches 0
   * Called internally by handleGamePhase()
   */
  private triggerVRFPhase() {
    logger.game.debug("[GamePhaseManager] 🎲 Triggering VRF_PENDING phase (countdown ended)");
    if (this.currentPhase === GamePhase.WAITING) {
      this.setPhase(GamePhase.VRF_PENDING);
    } else {
      logger.game.warn(
        "[GamePhaseManager] ⚠️ triggerVRFPhase called but not in WAITING phase:",
        this.currentPhase
      );
    }
  }

  handleGamePhase(gameState: any) {
    if (!gameState) {
      this.setPhase(GamePhase.IDLE);
      this.lastCountdownSeconds = -1;
      return;
    }

    // Detect blockchain state
    const status = gameState.status;

    // Check for winner - winner field from blockchain (PublicKey or string)
    let hasWinner = false;
    if (gameState.winner) {
      // Check if winner is actually set (not null PublicKey, empty string, or system program)
      const winnerStr =
        typeof gameState.winner === "string" ? gameState.winner : gameState.winner.toBase58?.();
      hasWinner =
        !!winnerStr &&
        winnerStr !== "11111111111111111111111111111111" && // Not null address
        winnerStr !== "SystemProgram11111111111111111111111111111"; // Not system program
    }

    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";

    // Get countdown info
    const endTimestamp = gameState.endTimestamp || gameState.endDate;
    let countdownSeconds = 0;
    let gameHasEnded = false;

    if (endTimestamp && endTimestamp !== 0) {
      const endTimestampMs = endTimestamp > 10000000000 ? endTimestamp : endTimestamp * 1000;
      const currentTime = Date.now();
      const timeRemaining = Math.max(0, endTimestampMs - currentTime);
      countdownSeconds = Math.ceil(timeRemaining / 1000);
      gameHasEnded = currentTime >= endTimestampMs;
    }

    // Detect countdown ending (transition from >0 to 0)
    if (countdownSeconds === 0 && this.lastCountdownSeconds > 0) {
      logger.game.debug("=".repeat(60));
      logger.game.debug("[GamePhaseManager] ⏰ COUNTDOWN REACHED 0! Triggering VRF phase");
      logger.game.debug("=".repeat(60));
      this.triggerVRFPhase();
    }
    this.lastCountdownSeconds = countdownSeconds;

    // Detect VRF phase from blockchain state (e.g., after page refresh)
    // VRF phase = game ended, still waiting status, no winner yet
    const isInVRFPhase = gameHasEnded && isWaiting && !hasWinner;
    if (isInVRFPhase && this.currentPhase === GamePhase.WAITING) {
      logger.game.debug(
        "[GamePhaseManager] 🔄 Detected VRF phase from blockchain (e.g., after refresh)"
      );
      this.triggerVRFPhase();
    }

    // State machine transitions
    switch (this.currentPhase) {
      case GamePhase.IDLE:
        // Demo mode → Real game starts
        if (isWaiting) {
          logger.game.debug("[GamePhaseManager] 🎮 Real game starting, stopping demo");
          EventBus.emit("game-started"); // Stop demo mode
          this.setPhase(GamePhase.WAITING);
        }
        break;

      case GamePhase.WAITING:
        break;

      case GamePhase.VRF_PENDING:
        // Wait for winner to be determined by blockchain VRF
        // When winner is detected, transition to FIGHTING phase
        if (hasWinner) {
          logger.game.debug(
            "[GamePhaseManager] 🎯 Winner determined! Transitioning to FIGHTING phase"
          );
          this.setPhase(GamePhase.FIGHTING);
        } else {
          // Throttle VRF pending logs (only show every 60 checks to reduce spam)
          this.vrfCheckCounter++;
          if (this.vrfCheckCounter % 60 === 0) {
            logger.game.debug(
              "[GamePhaseManager] ⏳ Still waiting for VRF winner determination..."
            );
          }
        }
        break;

      case GamePhase.FIGHTING:
        {
          // Start battle sequence once
          if (!this.battleSequenceStarted) {
            const participantsMap = this.playerManager.getParticipants();
            if (participantsMap.size > 0) {
              logger.game.debug("[GamePhaseManager] ⚔️ Starting battle phase sequence");
              this.animationManager.startBattlePhaseSequence(this.playerManager);
              this.battleSequenceStarted = true;

              // Transition to CELEBRATING phase after battle animations complete
              // Battle sequence: moveToCenter (instant) + explosions start after 500ms
              // Total battle duration from DEMO_TIMINGS.ARENA_PHASE_DURATION = 3000ms
              this.scene.time.delayedCall(3000, () => {
                logger.game.debug("[GamePhaseManager] ⚔️ Battle complete, starting celebration");
                this.setPhase(GamePhase.CELEBRATING);
              });
            } else {
              logger.game.warn(
                "[GamePhaseManager] ⚠️ No participants for battle, skipping to celebration"
              );
              this.setPhase(GamePhase.CELEBRATING);
            }
          }
        }
        break;

      case GamePhase.CELEBRATING: {
        // Initialize celebration and start results sequence once
        if (!this.resultsSequenceStarted && hasWinner) {
          logger.game.debug("[GamePhaseManager] 🎉 Starting celebration phase with winner");
          this.celebrationStartTime = Date.now();

          // Find winner participant data
          const participants = Array.from(this.playerManager.getParticipants().values());
          const winnerStr =
            typeof gameState.winner === "string" ? gameState.winner : gameState.winner.toBase58?.();

          const winner = participants.find((p) => p.id === winnerStr || p.playerId === winnerStr);

          if (winner) {
            this.animationManager.startResultsPhaseSequence(this.playerManager, winner);
            this.resultsSequenceStarted = true;
          } else {
            logger.game.warn("[GamePhaseManager] ⚠️ Winner not found in participants:", winnerStr);
          }
        }

        // Check if 15 seconds elapsed (only if celebration has started)
        if (this.celebrationStartTime > 0) {
          const celebrationElapsed = Date.now() - this.celebrationStartTime;
          if (celebrationElapsed >= this.CELEBRATION_DURATION) {
            logger.game.debug("[GamePhaseManager] 🎉 Celebration complete, starting cleanup");
            this.setPhase(GamePhase.CLEANUP);
            this.handleGameCleanup();
          }
        }
        break;
      }

      case GamePhase.CLEANUP:
        break;
    }
  }

  private handleGameCleanup() {
    logger.game.debug("[GamePhaseManager] Cleaning up finished game");

    // Clear all effects and reset state
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();

    // Fade out all participants
    this.playerManager.getParticipants().forEach((participant) => {
      this.scene.tweens.add({
        targets: participant.container,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          participant.container.destroy();
        },
      });
    });

    // Clear participants and return to IDLE after fade
    this.scene.time.delayedCall(2000, () => {
      this.playerManager.clearParticipants();
      this.setPhase(GamePhase.IDLE);
      logger.game.debug("[GamePhaseManager] ✅ Cleanup complete, returning to IDLE");

      // Emit event to notify other systems (e.g., DemoScene) that we're back to IDLE
      EventBus.emit("game-ended");
    });
  }

  /**
   * Reset manager state for new game or scene restart
   * Note: Most state is auto-reset by setPhase() transitions
   */
  reset() {
    // Transition to IDLE (this auto-resets all phase-specific state via setPhase)
    this.setPhase(GamePhase.IDLE);

    // Reset countdown tracker
    this.lastCountdownSeconds = -1;

    // Clean up scene state
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();
    this.playerManager.clearParticipants();
  }
}
