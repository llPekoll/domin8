import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { DemoScene } from "./scenes/DemoScene";
import { AUTO, Game } from "phaser";
import { Preloader } from "./scenes/Preloader";

// Game stage dimensions (used for fullscreen effects and scaling)
export const STAGE_WIDTH = 396;
export const STAGE_HEIGHT = 180;

// Global storage for current game's map data
export let currentMapData: any = null;
// Global storage for characters data
export let charactersData: any[] = [];
// Global storage for all active maps (loaded in Preloader)
export let allMapsData: any[] = [];
// Global storage for demo mode map (selected from allMapsData)
export let demoMapData: any = null;

export const setCurrentMapData = (map: any) => {
  currentMapData = map;
};

export const setCharactersData = (characters: any[]) => {
  charactersData = characters;
};

export const setAllMapsData = (maps: any[]) => {
  allMapsData = maps;
};

export const setDemoMapData = (map: any) => {
  demoMapData = map;
};

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  transparent: true,
  parent: "game-container",
  pixelArt: true, // Enable pixel-perfect rendering globally
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialiasGL: false, // Disable WebGL antialiasing for crisp pixels
    pixelArt: true, // Redundant but explicit - ensures crisp pixel art
  },
  audio: {
    disableWebAudio: false, // Use Web Audio API (best quality)
    noAudio: false, // Enable audio
  },
  scene: [Boot, Preloader, DemoScene, MainGame],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
