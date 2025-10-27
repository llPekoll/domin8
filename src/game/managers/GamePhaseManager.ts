import { Scene } from "phaser";
import { PlayerManager } from "./PlayerManager";
import { AnimationManager } from "./AnimationManager";

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
  private hasWinner: boolean = false;

  constructor(scene: Scene, playerManager: PlayerManager, animationManager: AnimationManager) {
    this.scene = scene;
    this.playerManager = playerManager;
    this.animationManager = animationManager;
  }

  handleGamePhase(gameState: any) {
    if (!gameState) return;

    const participants = gameState.participants || [];

    // Check if phase changed
    const phaseChanged = this.currentPhase !== gameState.status;
    this.currentPhase = gameState.status;

    console.log(`[GamePhaseManager] Phase: ${gameState.status}, Changed: ${phaseChanged}`);

    // Update participants with latest data from backend
    if (gameState.status !== "waiting") {
      this.playerManager.updateParticipants(participants);
    }

    // Update hasWinner flag
    this.hasWinner = !!gameState.winnerId;

    // Handle blockchain-driven phases
    switch (gameState.status) {
      case "waiting":
        this.handleWaitingPhase(participants, gameState.map);
        break;
      case "awaitingWinnerRandomness":
        this.handleAwaitingWinnerRandomness(phaseChanged);
        break;
      case "finished":
        this.handleFinishedPhase(gameState, phaseChanged);
        break;
      default:
        console.warn(`[GamePhaseManager] Unknown phase: ${gameState.status}`);
    }
  }

  private handleWaitingPhase(participants: any[], mapData: any) {
    // Clear previous game participants if this is a fresh game
    if (participants.length === 0) {
      this.playerManager.clearParticipants();
    }

    // Reset winner flag for new game
    this.hasWinner = false;

    // Spawn participants as they join
    this.playerManager.updateParticipantsInWaiting(participants, mapData);
  }

  private handleAwaitingWinnerRandomness(phaseChanged: boolean) {
    if (phaseChanged) {
      console.log("[GamePhaseManager] Betting closed, VRF requested");

      // Move all participants to center for battle
      this.playerManager.moveParticipantsToCenter();

      // VRF dialog shown by React UI (BlockchainRandomnessDialog)
      // Battle animations play while waiting for VRF response (3-8 seconds)
      // Handle if vrf fails or is delayed (show a dialog, done in App.tsx)
    }
  }

  private handleFinishedPhase(gameState: any, phaseChanged: boolean) {
    if (phaseChanged) {
      console.log("[GamePhaseManager] Game finished - showing winner");

      // Verify winner exists
      const hasWinner = !!gameState.winnerId;
      if (!hasWinner) {
        console.log("⚠️ Cannot show results - no winner determined");
        return;
      }

      // Explode eliminated participants, winner stays in center
      const participants = this.playerManager.getParticipants();
      this.animationManager.explodeParticipantsOutward(participants);

      // Show winner celebration after explosions
      this.scene.time.delayedCall(1000, () => {
        const winnerParticipant = this.playerManager.showResults(gameState);
        if (winnerParticipant) {
          const winner = gameState.participants?.find((p: any) => p._id === gameState.winnerId);
          if (winner) {
            this.animationManager.addWinnerCelebration(winnerParticipant, winner);
          }
        }
      });

      // Clean up for next game after celebration (50 sec for now testing)
      this.scene.time.delayedCall(50000, () => {
        this.handleGameCleanup();
      });
    }
  }

  private handleGameCleanup() {
    console.log("[GamePhaseManager] Cleaning up finished game");

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
    this.hasWinner = false;
    this.scene.tweens.killAll();
    this.scene.time.removeAllEvents();
    this.playerManager.clearParticipants();
  }
}
