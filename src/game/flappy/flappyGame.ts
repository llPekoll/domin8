import Phaser from "phaser";
import { BootScene } from "./bootScene";
import { GameScene } from "./gameScene";
import { UIScene } from "./UIScene";

// Base resolution matches bg_flappy.png aspect ratio (246x180 → ~1.37:1)
// For portrait mode, we flip to ~0.73:1 (height > width)
// Using 120x180 base for a tighter portrait feel
const BASE_WIDTH = 120;
const BASE_HEIGHT = 180;
export const FLAPPY_SCALE = 3;

// Export dimensions for use in scenes
export const FLAPPY_WIDTH = BASE_WIDTH * FLAPPY_SCALE;
export const FLAPPY_HEIGHT = BASE_HEIGHT * FLAPPY_SCALE;

export function createFlappyGame(parent: HTMLElement) {
  const events = new Phaser.Events.EventEmitter();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: FLAPPY_WIDTH,
    height: FLAPPY_HEIGHT,
    backgroundColor: "#050816",
    transparent: true,
    // Crisp pixel art rendering
    pixelArt: true,
    antialias: false,
    render: {
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
    },

    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 600 },
        // debug: true, // Temporarily enabled to see collision boxes
      },
    },

    // Scale to fit container while maintaining aspect ratio (like main game)
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    scene: [new BootScene(events), new GameScene(events), new UIScene(events)],
  });

  // Apply CSS for crisp pixel art scaling
  game.events.once("ready", () => {
    const canvas = game.canvas;
    if (canvas) {
      canvas.style.imageRendering = "pixelated";
    }
  });

  const destroy = () => {
    events.removeAllListeners();
    game.destroy(true);
  };

  return { game, events, destroy };
}
