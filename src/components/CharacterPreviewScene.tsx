import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CharacterPreview } from "../game/scenes/CharacterPreview";
import { charactersData } from "../game/main";

interface CharacterPreviewSceneProps {
  characterId?: string;
  characterName?: string;
  isSpecial?: boolean;
  width?: number;
  height?: number;
}

export const CharacterPreviewScene: React.FC<CharacterPreviewSceneProps> = ({
  characterId,
  characterName,
  isSpecial,
  width = 140,
  height = 140,
}) => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<CharacterPreview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create a minimal Phaser game instance for character preview
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      scene: CharacterPreview,
      pixelArt: true,
      transparent: true,
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    // Get reference to the scene and load initial character if provided
    gameRef.current.events.once("ready", () => {
      sceneRef.current = gameRef.current?.scene.getScene("CharacterPreview") as CharacterPreview;

      // Load initial character if provided
      if (sceneRef.current && characterId && characterName) {
        const characterData = charactersData.find((char) => char._id === characterId);
        if (characterData) {
          const characterKey = characterData.name.toLowerCase().replace(/\s+/g, "-");

          // Check if character assets are already loaded
          if (sceneRef.current.textures.exists(characterKey)) {
            // Assets already loaded, display character
            sceneRef.current.displayCharacter(characterKey);
          } else {
            // Load character assets
            const jsonPath = characterData.assetPath.replace(".png", ".json");

            sceneRef.current.load.atlas(
              characterKey,
              `assets/${characterData.assetPath}`,
              `assets/${jsonPath}`
            );
            // Also load JSON separately for accessing frameTags
            sceneRef.current.load.json(`${characterKey}-json`, `assets/${jsonPath}`);

            sceneRef.current.load.once("complete", () => {
              // Get the JSON data to extract frameTags
              const jsonData = sceneRef.current!.cache.json.get(`${characterKey}-json`);

              if (jsonData && jsonData.meta && jsonData.meta.frameTags) {
                const frameTags = jsonData.meta.frameTags;

                // Find the idle animation from frameTags
                const idleTag = frameTags.find((tag: any) => tag.name.toLowerCase() === "idle");

                if (idleTag) {
                  // Extract prefix and suffix from first frame
                  const frames = jsonData.frames || [];
                  const firstFrameName = frames[0]?.filename || "";
                  let prefix = "";
                  let suffix = "";

                  if (firstFrameName.includes(".aseprite")) {
                    suffix = ".aseprite";
                    prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
                  } else if (firstFrameName.includes(".ase")) {
                    suffix = ".ase";
                    prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
                  }

                  sceneRef.current!.anims.create({
                    key: `${characterKey}-idle`,
                    frames: sceneRef.current!.anims.generateFrameNames(characterKey, {
                      prefix: prefix,
                      suffix: suffix,
                      start: idleTag.from,
                      end: idleTag.to,
                    }),
                    frameRate: 10,
                    repeat: -1,
                  });
                }
              }

              // Display the character
              sceneRef.current!.displayCharacter(characterKey);
            });

            sceneRef.current.load.start();
          }
        }
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [width, height, characterId, characterName]);

  // Load character assets and display character when character changes
  useEffect(() => {
    if (!sceneRef.current || !characterId || !characterName) {
      return;
    }

    // Find character data
    const characterData = charactersData.find((char) => char._id === characterId);
    if (!characterData) return;

    const characterKey = characterData.name.toLowerCase().replace(/\s+/g, "-");

    // Check if character assets are already loaded
    const scene = sceneRef.current;
    if (scene.textures.exists(characterKey)) {
      // Assets already loaded, display character
      scene.displayCharacter(characterKey);
    } else {
      // Load character assets
      const jsonPath = characterData.assetPath.replace(".png", ".json");

      scene.load.atlas(characterKey, `assets/${characterData.assetPath}`, `assets/${jsonPath}`);
      // Also load JSON separately for accessing frameTags
      scene.load.json(`${characterKey}-json`, `assets/${jsonPath}`);

      scene.load.once("complete", () => {
        // Get the JSON data to extract frameTags
        const jsonData = scene.cache.json.get(`${characterKey}-json`);

        if (jsonData && jsonData.meta && jsonData.meta.frameTags) {
          const frameTags = jsonData.meta.frameTags;

          // Find the idle animation from frameTags
          const idleTag = frameTags.find((tag: any) => tag.name.toLowerCase() === "idle");

          if (idleTag) {
            // Extract prefix and suffix from first frame
            const frames = jsonData.frames || [];
            const firstFrameName = frames[0]?.filename || "";
            let prefix = "";
            let suffix = "";

            if (firstFrameName.includes(".aseprite")) {
              suffix = ".aseprite";
              prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
            } else if (firstFrameName.includes(".ase")) {
              suffix = ".ase";
              prefix = firstFrameName.substring(0, firstFrameName.lastIndexOf(" ")) + " ";
            }

            scene.anims.create({
              key: `${characterKey}-idle`,
              frames: scene.anims.generateFrameNames(characterKey, {
                prefix: prefix,
                suffix: suffix,
                start: idleTag.from,
                end: idleTag.to,
              }),
              frameRate: 10,
              repeat: -1,
            });
          }
        }

        // Display the character
        scene.displayCharacter(characterKey);
      });

      scene.load.start();
    }
  }, [characterId, characterName]);

  return (
    <div
      ref={containerRef}
      className="character-preview-container"
      style={{
        width,
        height,
      }}
    />
  );
};
