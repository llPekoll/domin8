import { BackgroundConfig } from "./types";

/**
 * Background 1 - Arena Classic (Animated)
 */
export const bg1: BackgroundConfig = {
  id: 1,
  name: "Arena Classic",
  textureKey: "bg_arena_classic_animated", // Unique key to avoid conflict with old system
  assetPath: "maps/classic/Arena.png", // Also loads Arena.json
  type: "animated",
  animations: {
    idle: {
      prefix: "Arena ",
      suffix: ".ase",
      start: 0,
      end: 5,
      frameRate: 5, // 200ms per frame = 5 fps
    },
  },
};
