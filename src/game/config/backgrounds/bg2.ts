import { BackgroundConfig } from "./types";

/**
 * Background 2 - Secte Arena (Animated)
 */
export const bg2: BackgroundConfig = {
  id: 2,
  name: "Secte Arena",
  textureKey: "bg_secte_animated",
  assetPath: "maps/secte/bg.png", // Will also load bg.json automatically
  type: "animated",
  animations: {
    idle: {
      prefix: "bg ",
      suffix: ".aseprite",
      start: 0,
      end: 46,
      frameRate: 10,
    },
  },
};
