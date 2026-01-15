import { Scene } from "phaser";

/**
 * OneVOneBoot - Boot scene for 1v1 modal
 * Starts OneVOnePreloader instead of the main Preloader
 */
export class OneVOneBoot extends Scene {
  constructor() {
    super("OneVOneBoot");
  }

  preload() {
    console.log("[OneVOneBoot] preload called");
  }

  create() {
    console.log("[OneVOneBoot] create called - starting OneVOnePreloader");
    // Start the 1v1 preloader (not the main Preloader)
    this.scene.start("OneVOnePreloader");
  }
}
