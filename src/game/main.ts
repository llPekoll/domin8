import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { DemoScene } from "./scenes/DemoScene";
import { OneVOneScene } from "./scenes/OneVOneScene";
import { MapCarousel } from "./scenes/MapCarousel";
import { AUTO, Game } from "phaser";
import { Preloader } from "./scenes/Preloader";

// Game status constants (matching smart contract constants.rs)
export const GAME_STATUS = {
  OPEN: 0,    // First bet placed, countdown started - show Game with bets
  CLOSED: 1,  // Game ended, winner selected - show celebration then Demo
  WAITING: 2, // Game created by backend, no bets yet - show "Insert Coin"
} as const;

// Game stage dimensions (used for fullscreen effects and scaling)
// Base resolution: 396x180
// Scale factor: Multiply base resolution to adjust overall game size
export const RESOLUTION_SCALE = 3; // Change this to scale the entire game (1 = 396x180, 2 = 792x360, 3 = 1188x540, etc.)
export const STAGE_WIDTH = 396 * RESOLUTION_SCALE;
export const STAGE_HEIGHT = 180 * RESOLUTION_SCALE;

// Global storage for current game's map data
export let currentMapData: any = null;
// Global storage for characters data
export let charactersData: any[] = [];
// Global storage for all active maps (loaded in Preloader)
export let allMapsData: any[] = [];
// Global storage for demo mode map (selected from allMapsData)
export let demoMapData: any = null;
// Global storage for active game state from blockchain (useActiveGame)
export let activeGameData: any = null;
// Global storage for current user's wallet address
export let currentUserWallet: string | null = null;

// Flag to track if blockchain data has been loaded (or timed out)
export let blockchainDataReady: boolean = false;

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

export const setActiveGameData = (gameData: any) => {
  activeGameData = gameData;
  blockchainDataReady = true; // Mark blockchain as loaded
};

export const setBlockchainDataReady = (ready: boolean) => {
  blockchainDataReady = ready;
};

export const setCurrentUserWallet = (wallet: string | null) => {
  currentUserWallet = wallet;
};

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  transparent: true,
  parent: "game-container",
  pixelArt: true, // Enable pixel-perfect rendering globally
  scale: {
    mode: Phaser.Scale.FIT, // Scale to fit container while maintaining aspect ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: STAGE_WIDTH, // Native resolution width
    height: STAGE_HEIGHT, // Native resolution height
  },
  render: {
    antialiasGL: false, // Disable WebGL antialiasing for crisp pixels
    pixelArt: true, // Redundant but explicit - ensures crisp pixel art
  },
  audio: {
    disableWebAudio: false, // Use Web Audio API (best quality)
    noAudio: false, // Enable audio
  },
  scene: [Boot, Preloader, MapCarousel, DemoScene, OneVOneScene, MainGame],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
