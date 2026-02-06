import Phaser from "phaser";
import { ChopBoot } from "./ChopBoot";
import { ChopGame } from "./ChopGame";

export { ChopBoot, ChopGame };

// Match original Timberman background: 1080x1775
// Aspect ratio: 0.608 (narrower/taller than flappy)
const BASE_WIDTH = 108;
const BASE_HEIGHT = 178;
export const CHOP_SCALE = 3;

export const CHOP_WIDTH = BASE_WIDTH * CHOP_SCALE;   // 324
export const CHOP_HEIGHT = BASE_HEIGHT * CHOP_SCALE; // 534

// Global state
let globalEventBus: Phaser.Events.EventEmitter | null = null;
let globalBranchPattern: string[] | undefined = undefined;
let globalHighScore: number = 0;

// Callback for server-validated chops (solo mode anti-cheat)
export type ChopCallback = (side: "l" | "r", timestamp: number) => Promise<{
  success: boolean;
  died?: boolean;
  score?: number;
  nextBranches?: string[];
  error?: string;
}>;
let globalChopCallback: ChopCallback | undefined = undefined;

export function setChopCallback(callback: ChopCallback | undefined): void {
  globalChopCallback = callback;
}

export function getChopCallback(): ChopCallback | undefined {
  return globalChopCallback;
}

export function setChopHighScore(score: number): void {
  globalHighScore = score;
  // Also emit event if game is running
  if (globalEventBus) {
    globalEventBus.emit("chop:highscore", score);
  }
}

export function getChopHighScore(): number {
  return globalHighScore;
}

export function getChopEventBus(): Phaser.Events.EventEmitter {
  if (!globalEventBus) {
    globalEventBus = new Phaser.Events.EventEmitter();
  }
  return globalEventBus;
}

export function getChopBranchPattern(): string[] | undefined {
  return globalBranchPattern;
}

export function createChopGame(parent: HTMLElement, branchPattern?: string[]) {
  const events = new Phaser.Events.EventEmitter();
  globalEventBus = events;
  globalBranchPattern = branchPattern;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CHOP_WIDTH,
    height: CHOP_HEIGHT,
    backgroundColor: "#1a1a2e",
    transparent: true,
    pixelArt: true,
    antialias: false,
    render: {
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
      },
    },
    scene: [ChopBoot, ChopGame],
  });

  game.events.once("ready", () => {
    const canvas = game.canvas;
    if (canvas) {
      canvas.style.imageRendering = "pixelated";
    }
  });

  const destroy = () => {
    events.removeAllListeners();
    game.destroy(true);
    globalEventBus = null;
    globalBranchPattern = undefined;
    globalHighScore = 0;
    globalChopCallback = undefined;
  };

  return { game, events, destroy };
}
