import { BackgroundConfig } from "./types";

/**
 * Background 2 - Animated Arena (Animated + Clickable)
 */
export const bg2: BackgroundConfig = {
  id: 2,
  name: "Animated Arena",
  textureKey: "animated_arena",
  assetPath: "maps/animated_arena.png", // Will also load .json automatically
  type: "animated",
  animations: {
    idle: {
      prefix: "background ",
      suffix: ".aseprite",
      start: 0,
      end: 20,
      frameRate: 10,
    },
  },
  clickable: {
    enabled: true,
    action: "url",
    url: "https://example.com",
  },
};
