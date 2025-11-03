import { Scene } from "phaser";
import { PlayerManager } from "./PlayerManager";
import { AnimationManager } from "./AnimationManager";
import { logger } from "../../lib/logger";

/**
 * Game Phase Manager - Simplified to match blockchain states
 *
 * The frontend now mirrors blockchain states exactly:
 * - waiting: Players can bet (30 seconds)
 * - awaitingWinnerRandomness: VRF in progress, battle animations
 * - finished: Winner announced, celebration, prepare for next game
 *
 * No more complex time-based phase calculations that drift out of sync!
 */
export class GamePhaseManager {
  private scene: Scene;
  private playerManager: PlayerManager;
  private animationManager: AnimationManager;
  private currentPhase: string = "";

  constructor(scene: Scene, playerManager: PlayerManager, animationManager: AnimationManager) {
    this.scene = scene;
    this.playerManager = playerManager;
    this.animationManager = animationManager;
  }

  handleGamePhase(gameState: any) {
    if (!gameState) return;

    // Detect actual phase based on blockchain status
    const status = gameState.status;
    const hasWinner = !!gameState.winnerId || !!gameState.winner;
    const isWaiting = status === "Waiting" || status === 0 || status === "waiting";
    const isFinished = status === "Finished" || status === 1 || status === "finished";
    const isVRFPhase = isFinished && !hasWinner; // Game finished but no winner yet
    const isCelebration = isFinished && hasWinner; // Winner determined

    // Determine current phase string for comparison
    let currentPhaseString = "";
    if (isWaiting) {
      currentPhaseString = "waiting";
    } else if (isVRFPhase) {
      currentPhaseString = "vrfPhase";
    } else if (isCelebration) {
      currentPhaseString = "celebration";
    }

    // Check if phase changed
    const phaseChanged = this.currentPhase !== currentPhaseString;
    this.currentPhase = currentPhaseString;

    logger.game.debug(`[GamePhaseManager] Phase detection:`, {
      blockchainStatus: status,
      hasWinner,
      detectedPhase: currentPhaseString,
      phaseChanged,
    });

    // Handle blockchain-driven phases
    // NOTE: Participant spawning is handled by Game.ts from gameState.bets
    // GamePhaseManager only handles phase transitions and animations
    if (isWaiting) {
      this.handleWaitingPhase();
    } else if (isVRFPhase) {
      this.handleVRFPhase(phaseChanged);
    } else if (isCelebration) {
      this.handleFinishedPhase(gameState, phaseChanged);
    }
  }

  private handleWaitingPhase() {
    // Nothing to do during waiting phase
    // Characters spawn automatically via Game.ts updateGameState()
    // Just wait for phase to change
  }

  private handleVRFPhase(phaseChanged: boolean) {
    if (phaseChanged) {
      logger.game.debug("[GamePhaseManager] 🎲 VRF Phase - betting closed, awaiting randomness");

      // Move all participants to center for battle
      this.playerManager.moveParticipantsToCenter();

      // VRF overlay shown by UIManager (DETERMINING WINNER... popup)
      // Demo-style countdown shown at bottom
      // Battle animations play in background (3-8 seconds)
    }
  }

  private handleFinishedPhase(gameState: any, phaseChanged: boolean) {
    // Calculate celebration timing based on endDate
    const endDate = gameState.endDate || gameState.endTimestamp;
    const now = Date.now() / 1000; // Convert to seconds
    const timeSinceGameEnd = now - (endDate || 0);
    const celebrationDuration = 15; // 15 seconds
    const timeRemainingInCelebration = Math.max(0, celebrationDuration - timeSinceGameEnd);

    logger.game.debug("[GamePhaseManager] Finished phase timing:", {
      endDate,
      now,
      timeSinceGameEnd: timeSinceGameEnd.toFixed(1),
      timeRemainingInCelebration: timeRemainingInCelebration.toFixed(1),
      phaseChanged,
      hasWinner: !!gameState.winner,
    });

    // Late joiner: If joining during celebration period, show winner immediately
    if (!phaseChanged && timeRemainingInCelebration > 0) {
      logger.game.debug("[GamePhaseManager] 🎉 Late joiner detected! Showing winner celebration immediately");

      // Check if we already have participants (celebration already running)
      const participants = this.playerManager.getParticipants();
      if (participants.length === 0) {
        logger.game.debug("[GamePhaseManager] Late joiner - participants will spawn via Game.ts");

        // Schedule cleanup for remaining time (participants spawn via Game.ts)
        const cleanupDelay = timeRemainingInCelebration * 1000; // Convert to ms
        this.scene.time.delayedCall(cleanupDelay, () => {
          this.handleGameCleanup();
        });
      }
      return;
    }

    // Normal phase change: just entered finished phase
    if (phaseChanged) {
      logger.game.debug("[GamePhaseManager] Game finished - showing winner");

      // Verify winner exists (blockchain uses 'winner' field, not 'winnerId')
      const hasWinner = !!gameState.winner;
      if (!hasWinner) {
        logger.game.debug("⚠️ Cannot show results - no winner determined");
        return;
      }

      // Get winner wallet address
      const winnerAddress = typeof gameState.winner === 'string'
        ? gameState.winner
        : gameState.winner?.toBase58?.();

      logger.game.debug("[GamePhaseManager] Winner address:", winnerAddress);

      // Explode eliminated participants, winner stays in center
      const participants = this.playerManager.getParticipants();
      this.animationManager.explodeParticipantsOutward(participants);

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
            _id: winnerParticipant._id,
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

      // Clean up after 15 seconds celebration period
      this.scene.time.delayedCall(15000, () => {
        this.handleGameCleanup();
      });
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

    // Clear participants after fade
    this.scene.time.delayedCall(2000, () => {
      this.playerManager.clearParticipants();
    });
  }

  // Helper method to get current phase
  getCurrentPhase(): string {
    return this.currentPhase;
  }

  // Reset manager state for new game
  reset() {
    this.currentPhase = "";
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();
    this.playerManager.clearParticipants();
  }
}
