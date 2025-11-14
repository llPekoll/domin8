import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { WinnerCharacterPreview } from "../game/scenes/WinnerCharacterPreview";
import { useAssets } from "../contexts/AssetsContext";

interface WinnerCharacterPreviewSceneProps {
  characterName?: string;
  width?: number;
  height?: number;
}

export const WinnerCharacterPreviewScene: React.FC<WinnerCharacterPreviewSceneProps> = ({
  characterName,
  width = 64,
  height = 64,
}) => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<WinnerCharacterPreview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Get characters from assets context
  const { characters } = useAssets();

  useEffect(() => {
    if (!containerRef.current) return;

    // Create a minimal Phaser game instance for character preview
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      scene: WinnerCharacterPreview,
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

    // Get reference to the scene
    gameRef.current.events.once("ready", () => {
      sceneRef.current = gameRef.current?.scene.getScene(
        "WinnerCharacterPreview"
      ) as WinnerCharacterPreview;
      console.log("[WinnerCharacterPreviewScene] ✅ Phaser scene ready");
      setIsReady(true);
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [width, height]);

  // Display character when characterName changes
  useEffect(() => {
    if (!isReady || !sceneRef.current || !characterName || !characters || characters.length === 0) {
      return;
    }

    // Find character data
    const characterData = characters.find(
      (char: any) => char.name.toLowerCase() === characterName.toLowerCase()
    );

    if (!characterData) {
      return;
    }

    const characterKey = characterData.name.toLowerCase().replace(/\s+/g, "-");
    const scene = sceneRef.current;

    // Check if character assets are already loaded
    if (scene.textures.exists(characterKey)) {
      // Assets already loaded, display character
      scene.displayWinningCharacter(characterKey);
    } else {
      // Need to load character assets
      const jsonPath = characterData.assetPath.replace(".png", ".json");

      scene.load.atlas(characterKey, `assets/${characterData.assetPath}`, `assets/${jsonPath}`);
      // Also load JSON separately for accessing frameTags
      scene.load.json(`${characterKey}-json`, `assets/${jsonPath}`);

      scene.load.once("complete", () => {
        // Get the JSON data to extract frameTags
        const jsonData = scene.cache.json.get(`${characterKey}-json`);

        if (jsonData && jsonData.meta && jsonData.meta.frameTags) {
          const frameTags = jsonData.meta.frameTags;

          // Determine frame naming convention
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

          // Create animations for win and idle (fallback)
          const shouldLoop = (animName: string) => ["idle", "win", "run"].includes(animName);

          frameTags.forEach((tag: any) => {
            const animName = tag.name.toLowerCase();
            const animKey = `${characterKey}-${animName}`;

            if (!scene.anims.exists(animKey)) {
              scene.anims.create({
                key: animKey,
                frames: scene.anims.generateFrameNames(characterKey, {
                  prefix: prefix,
                  suffix: suffix,
                  start: tag.from,
                  end: tag.to,
                }),
                frameRate: 10,
                repeat: shouldLoop(animName) ? -1 : 0,
              });
            }
          });
        }

        // Display the character
        scene.displayWinningCharacter(characterKey);
      });

      scene.load.start();
    }
  }, [isReady, characterName, characters]);

  return (
    <div
      ref={containerRef}
      className="winner-character-preview-container -mt-10 -ml-10"
      style={{
        width,
        height,
      }}
    />
  );
};
