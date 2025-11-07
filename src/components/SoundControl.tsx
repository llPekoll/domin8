import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { EventBus } from "../game/EventBus";
import { SoundManager } from "../game/managers/SoundManager";

export function SoundControl() {
  const [isMuted, setIsMuted] = useState(() => {
    // Load mute preference from SoundManager
    SoundManager.initialize();
    return SoundManager.isSoundMuted();
  });
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);

  // Listen for scene changes to get the game instance
  useEffect(() => {
    const handleSceneReady = (scene: Phaser.Scene) => {
      // Get the game instance from the scene
      if (scene?.game) {
        setGameInstance(scene.game);

        // Apply mute state via SoundManager
        SoundManager.applyMuteToScene(scene);
        SoundManager.updateAllSoundsVolume(scene);
      }
    };

    EventBus.on("current-scene-ready", handleSceneReady);

    return () => {
      EventBus.off("current-scene-ready", handleSceneReady);
    };
  }, []);

  const toggleSound = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    // Update SoundManager (handles localStorage automatically)
    SoundManager.setMuted(newMutedState);

    // Apply mute to the game's global sound manager
    if (gameInstance?.sound) {
      gameInstance.sound.mute = newMutedState;

      // Emit event so scenes can react to mute changes
      EventBus.emit("sound-mute-changed", newMutedState);
    }
  };

  return (
    <Button
      onClick={toggleSound}
      variant="ghost"
      className="text-gray-300 hover:text-white hover:bg-gray-800"
      title={isMuted ? "Unmute sound" : "Mute sound"}
    >
      {isMuted ? (
        <VolumeX className="h-5 w-5" />
      ) : (
        <Volume2 className="h-5 w-5" />
      )}
      
    </Button>
  );
}
