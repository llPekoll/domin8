import { Scene } from "phaser";

export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    // Load monke assets early so it appears immediately in Preloader
    this.load.setPath("assets");
    this.load.atlas("monke-loader", "characters/monke.png", "characters/monke.json");
  }

  create() {
    this.scene.start("Preloader");
  }
}
