import { BackgroundConfig } from "./types";

/**
 * Background 2 - Secte Arena (Animated with Cat Overlay)
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
      end: 9,
      frameRate: 10,
      repeat: -1, // Loop forever
    },
  },
  overlays: [
    {
      textureKey: "secte_cat",
      assetPath: "maps/secte/cat.png",
      animations: {
        idle: {
          prefix: "cat ",
          suffix: ".aseprite",
          start: 0,
          end: 39,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "cat ",
          suffix: ".aseprite",
          start: 40,
          end: 46,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_statue",
      assetPath: "maps/secte/statue.png",
      animations: {
        idle: {
          prefix: "statue ",
          suffix: ".aseprite",
          start: 0,
          end: 39,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "statue ",
          suffix: ".aseprite",
          start: 40,
          end: 46,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_flame",
      assetPath: "maps/secte/flame.png",
      animations: {
        idle: {
          prefix: "flame ",
          suffix: ".aseprite",
          start: 0,
          end: 9,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "flame ",
          suffix: ".aseprite",
          start: 10,
          end: 17,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_skull",
      assetPath: "maps/secte/skull.png",
      animations: {
        idle: {
          prefix: "skull ",
          suffix: ".aseprite",
          start: 0,
          end: 39,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "skull ",
          suffix: ".aseprite",
          start: 40,
          end: 46,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_flame_l",
      assetPath: "maps/secte/flame-l.png",
      animations: {
        idle: {
          prefix: "flame-l ",
          suffix: ".aseprite",
          start: 0,
          end: 9,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "flame-l ",
          suffix: ".aseprite",
          start: 10,
          end: 17,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_statue_l",
      assetPath: "maps/secte/statue-l.png",
      animations: {
        idle: {
          prefix: "statue-l ",
          suffix: ".aseprite",
          start: 0,
          end: 39,
          frameRate: 10,
          repeat: -1, // Loop forever
        },
        click: {
          prefix: "statue-l ",
          suffix: ".aseprite",
          start: 40,
          end: 46,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
    {
      textureKey: "secte_stone",
      assetPath: "maps/secte/stone.png",
      animations: {
        idle: {
          prefix: "stone ",
          suffix: ".aseprite",
          start: 0,
          end: 0,
          frameRate: 10,
          repeat: -1, // Static frame (frame 0 only)
        },
        click: {
          prefix: "stone ",
          suffix: ".aseprite",
          start: 1,
          end: 7,
          frameRate: 10,
          repeat: 0, // Play once
        },
      },
      clickable: true,
      depth: 1, // Above background
    },
  ],
};
