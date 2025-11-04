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
  IDLE = "idle",              // No game, show demo
  WAITING = "waiting",         // Accepting bets (blockchain status = 0)
  VRF_PENDING = "vrf_pending", // Countdown ended, waiting for winner determination
  CELEBRATING = "celebrating", // Winner determined, 15s celebration
  CLEANUP = "cleanup"          // Fading out, preparing for next game
}

export class GamePhaseManager {
  private scene: Scene;
  private playerManager: PlayerManager;
  private animationManager: AnimationManager;
  private currentPhase: GamePhase = GamePhase.IDLE;
  private celebrationStartTime: number = 0;
  private readonly CELEBRATION_DURATION = 15000; // 15 seconds
  private vrfCheckCounter: number = 0; // Counter for throttling VRF phase logs

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

    console.log(`📢 [GamePhaseManager] Phase transition: ${this.currentPhase} → ${newPhase}`);
    console.log(`   Emitting 'game-phase-changed' event with phase: ${newPhase}`);
    logger.game.debug(`[GamePhaseManager] Phase transition: ${this.currentPhase} → ${newPhase}`);
    this.currentPhase = newPhase;

    // Emit event for SceneManager to listen
    EventBus.emit("game-phase-changed", newPhase);
    console.log(`   ✅ Event emitted`);
  }

  handleGamePhase(gameState: any) {
    if (!gameState) {
      this.setPhase(GamePhase.IDLE);
      return;
    }

    // Detect blockchain state
    const status = gameState.status;

    // Check for winner - winner field from blockchain (PublicKey or string)
    // Must match UIManager logic to stay in sync
    let hasWinner = false;
    if (gameState.winner) {
      // Check if winner is actually set (not null PublicKey, empty string, or system program)
      const winnerStr = typeof gameState.winner === 'string'
        ? gameState.winner
        : gameState.winner.toBase58?.();
      hasWinner = !!winnerStr &&
                  winnerStr !== '11111111111111111111111111111111' && // Not null address
                  winnerStr !== 'SystemProgram11111111111111111111111111111'; // Not system program
    }

    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";

    // Extra detailed logging for debugging
    if (this.currentPhase === GamePhase.VRF_PENDING) {
      const winnerStr = typeof gameState.winner === 'string'
        ? gameState.winner
        : gameState.winner?.toBase58?.();

      console.log("🎲 [GamePhaseManager] VRF Phase - checking winner:", {
        status: status,
        statusType: typeof status,
        winner: gameState.winner,
        winnerType: typeof gameState.winner,
        winnerString: winnerStr,
        hasWinner: hasWinner,
        isNullAddress: winnerStr === '11111111111111111111111111111111',
        isSystemProgram: winnerStr === 'SystemProgram11111111111111111111111111111',
      });
    }

    logger.game.debug(`[GamePhaseManager] State check:`, {
      blockchainStatus: status,
      hasWinner,
      currentPhase: this.currentPhase,
    });

    // State machine transitions
    switch (this.currentPhase) {
      case GamePhase.IDLE:
        // Demo mode → Real game starts
        if (isWaiting) {
          this.setPhase(GamePhase.WAITING);
        }
        break;

      case GamePhase.WAITING:
        // Waiting for countdown → VRF triggered by UIManager countdown = 0
        // UIManager will emit event to trigger VRF_PENDING phase
        // Don't check blockchain status here, it changes too fast
        break;

      case GamePhase.VRF_PENDING:
        // Waiting for winner → Celebration starts
        // Only log occasionally (every 60 frames = 1 second at 60fps)
        if (!this.vrfCheckCounter) this.vrfCheckCounter = 0;
        this.vrfCheckCounter++;

        if (this.vrfCheckCounter % 60 === 0 || hasWinner) {
          logger.game.debug("[GamePhaseManager] 🎲 VRF_PENDING - checking for winner", {
            hasWinner,
            winnerId: gameState.winnerId,
            winner: gameState.winner,
            status: gameState.status,
            checkCount: this.vrfCheckCounter,
          });
        }

        if (hasWinner) {
          logger.game.debug("=".repeat(60));
          logger.game.debug("[GamePhaseManager] ✅ Winner detected! Transitioning to CELEBRATING");
          logger.game.debug("=".repeat(60));
          this.setPhase(GamePhase.CELEBRATING);
          this.celebrationStartTime = Date.now();
          this.vrfCheckCounter = 0; // Reset counter
          this.handleCelebrationStart(gameState);
        }
        break;

      case GamePhase.CELEBRATING: {
        // Check if 15 seconds elapsed
        const celebrationElapsed = Date.now() - this.celebrationStartTime;
        if (celebrationElapsed >= this.CELEBRATION_DURATION) {
          logger.game.debug("[GamePhaseManager] 🎉 Celebration complete, starting cleanup");
          this.setPhase(GamePhase.CLEANUP);
          this.handleGameCleanup();
        }
        break;
      }

      case GamePhase.CLEANUP:
        // Cleanup complete, return to idle
        // This phase is brief (2 seconds), automatic transition
        break;
    }

    // Handle phase-specific animations
    // NOTE: Participant spawning handled by Game.ts from gameState.bets
    if (this.currentPhase === GamePhase.WAITING) {
      this.handleWaitingPhase();
    }
  }

  // Called by UIManager when countdown reaches 0
  triggerVRFPhase() {
    logger.game.debug("[GamePhaseManager] 🎲 triggerVRFPhase called", {
      currentPhase: this.currentPhase,
      willTransition: this.currentPhase === GamePhase.WAITING,
    });

    if (this.currentPhase === GamePhase.WAITING) {
      logger.game.debug("[GamePhaseManager] ✅ Countdown ended, entering VRF phase");
      this.setPhase(GamePhase.VRF_PENDING);

      // Move participants to center for battle
      const participantsMap = this.playerManager.getParticipants();
      logger.game.debug("[GamePhaseManager] Moving participants to center", {
        participantCount: participantsMap.size,
      });
      this.playerManager.moveParticipantsToCenter();

      // UIManager shows VRF overlay automatically
      logger.game.debug("[GamePhaseManager] VRF phase setup complete, waiting for winner...");
    } else {
      logger.game.warn("[GamePhaseManager] ⚠️ triggerVRFPhase called but not in WAITING phase!");
    }
  }

  private handleWaitingPhase() {
    // Nothing to do during waiting phase
    // Characters spawn automatically via Game.ts updateGameState()
    // Just wait for countdown to reach 0
  }

  private handleCelebrationStart(gameState: any) {
    logger.game.debug("=".repeat(60));
    logger.game.debug("[GamePhaseManager] 🎉 Starting celebration phase");
    logger.game.debug("=".repeat(60));

    // Verify winner exists (blockchain uses 'winner' field, not 'winnerId')
    const hasWinner = !!gameState.winner;
    logger.game.debug("[GamePhaseManager] Winner check:", {
      hasWinner,
      winner: gameState.winner,
      winnerId: gameState.winnerId,
      winnerType: typeof gameState.winner,
    });

    if (!hasWinner) {
      logger.game.warn("⚠️ Cannot show results - no winner determined");
      this.setPhase(GamePhase.CLEANUP);
      this.handleGameCleanup();
      return;
    }

    // Get winner wallet address
    const winnerAddress = typeof gameState.winner === 'string'
      ? gameState.winner
      : gameState.winner?.toBase58?.();

    logger.game.debug("[GamePhaseManager] Winner address:", winnerAddress);
    logger.game.debug("[GamePhaseManager] About to explode participants...");

    // Explode eliminated participants, winner stays in center
    const participantsMap = this.playerManager.getParticipants();
    const participants = Array.from(participantsMap.values());
    this.animationManager.explodeParticipantsOutward(participantsMap);

    // Show winner celebration after explosions
    this.scene.time.delayedCall(1000, () => {
      // Find winner participant by wallet address
      const winnerParticipant = participants.find(p =>
        p.playerId === winnerAddress
      );

      if (winnerParticipant) {
        logger.game.debug("[GamePhaseManager] Found winner participant, showing celebration");
        // Create winner object for animation
        const winner = {
          _id: winnerParticipant.id,
          playerId: winnerParticipant.playerId,
          displayName: winnerParticipant.displayName,
          betAmount: winnerParticipant.betAmount,
        };
        this.animationManager.addWinnerCelebration(winnerParticipant, winner);
      } else {
        logger.game.warn("[GamePhaseManager] Winner participant not found!", {
          winnerAddress,
          participantIds: participants.map(p => p.playerId),
        });
      }
    });

    // Note: 15-second celebration duration managed by handleGamePhase() switch statement
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
    });
  }

  // Reset manager state for new game
  reset() {
    this.setPhase(GamePhase.IDLE);
    this.celebrationStartTime = 0;
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();
    this.playerManager.clearParticipants();
  }
}
