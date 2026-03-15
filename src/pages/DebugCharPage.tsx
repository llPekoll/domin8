import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useAssets } from "../contexts/AssetsContext";
import { setCharactersData } from "../game/main";
import { DebugPreloader } from "../game/scenes/DebugPreloader";
import { DebugCharScene } from "../game/scenes/DebugCharScene";

export function DebugCharPage() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { characters } = useAssets();
  const [currentScale, setCurrentScale] = useState(1.0);

  // Sync characters to Phaser global state and initialize Phaser once characters are loaded
  useEffect(() => {
    if (!characters || characters.length === 0) {
      console.log("[DebugCharPage] Waiting for characters...");
      return;
    }
    if (!containerRef.current || gameRef.current) return;

    console.log("[DebugCharPage] Syncing characters:", characters.length);
    setCharactersData(characters);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1200,
      height: 800,
      parent: containerRef.current,
      backgroundColor: "#222222",
      pixelArt: true,
      scene: [DebugPreloader, DebugCharScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    // Start the debug scene after preloader
    gameRef.current.events.on("ready", () => {
      console.log("[DebugCharPage] Phaser ready");
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [characters]);

  const handleScaleUp = () => {
    const scene = gameRef.current?.scene.getScene("DebugCharScene") as DebugCharScene | undefined;
    if (scene) {
      scene.scaleAllCharacters(0.5);
      setCurrentScale(scene.getCurrentScale());
    }
  };

  const handleScaleDown = () => {
    const scene = gameRef.current?.scene.getScene("DebugCharScene") as DebugCharScene | undefined;
    if (scene) {
      scene.scaleAllCharacters(-0.5);
      setCurrentScale(scene.getCurrentScale());
    }
  };

  const handleReset = () => {
    const scene = gameRef.current?.scene.getScene("DebugCharScene") as DebugCharScene | undefined;
    if (scene) {
      scene.scaleAllCharacters(-scene.getCurrentScale() + 1.0);
      setCurrentScale(1.0);
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-4">Character Debug View</h1>

        <div className="flex gap-4 mb-4">
          <button
            onClick={handleScaleDown}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
          >
            - Scale Down
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors"
          >
            Reset (1.0x)
          </button>
          <button
            onClick={handleScaleUp}
            className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
          >
            + Scale Up (+1 SOL)
          </button>
          <div className="flex items-center px-4 bg-gray-800 rounded-lg">
            <span className="text-white font-mono">Scale: {currentScale.toFixed(2)}x</span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-2 mb-4">
          <p className="text-gray-400 text-sm">
            <span className="text-green-400">GREEN box</span> = Sprite bounds |
            <span className="text-cyan-400 ml-2">CYAN dot</span> = True feet position |
            <span className="text-pink-400 ml-2">MAGENTA dot/line</span> = Container origin (should align with cyan)
          </p>
        </div>

        <div
          ref={containerRef}
          className="w-full bg-black rounded-lg overflow-hidden"
          style={{ minHeight: "800px" }}
        />
      </div>
    </div>
  );
}
