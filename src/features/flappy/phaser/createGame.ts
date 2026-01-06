import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

export function createFlappyGame(parent: HTMLElement) {
  const events = new Phaser.Events.EventEmitter();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 480,
    height: 720,
    backgroundColor: "#050816",

    // Crisp rendering (future-proof for sprites)
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
    },

    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 900 },
        debug: false,
      },
    },

    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    // You already have your own event bus
    callbacks: {
      postBoot: () => {
        // optional hook if you want later
      },
    },
    scene: [new BootScene(events), new GameScene(events), new UIScene(events)],
    // @ts-expect-error Phaser supports this, typings may vary by version
    eventEmitter: false,
  });

  const destroy = () => {
    events.removeAllListeners();
    game.destroy(true);
  };

  return { game, events, destroy };
}
