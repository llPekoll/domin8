import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { useEffect, useState } from "react";
import { EventBus } from "../game/EventBus";
import { SoundManager } from "../game/managers/SoundManager";

export function SoundControl() {
  const [volume, setVolume] = useState(() => {
    // Load volume preference from SoundManager
    SoundManager.initialize();
    return SoundManager.getGlobalVolume();
  });
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);

  // Listen for scene changes to get the game instance
  useEffect(() => {
    const handleSceneReady = (scene: Phaser.Scene) => {
      // Get the game instance from the scene
      if (scene?.game) {
        setGameInstance(scene.game);

        // Apply volume state via SoundManager
        SoundManager.updateAllSoundsVolume(scene);
      }
    };

    EventBus.on("current-scene-ready", handleSceneReady);

    return () => {
      EventBus.off("current-scene-ready", handleSceneReady);
    };
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const previousVolume = volume;
    setVolume(newVolume);

    // Update SoundManager (handles localStorage automatically and updates battleMusic volume)
    SoundManager.setGlobalVolume(newVolume);

    // Update mute state based on volume (0 = muted)
    const isMuted = newVolume === 0;
    const wasUnmuting = previousVolume === 0 && newVolume > 0;

    SoundManager.setMuted(isMuted);

    // Apply volume to the game's global sound manager
    if (gameInstance?.sound) {
      gameInstance.sound.volume = newVolume;
      gameInstance.sound.mute = isMuted;

      // Emit event so scenes can react to volume changes
      EventBus.emit("sound-volume-changed", newVolume);

      // If we just unmuted, emit the unmute event
      if (wasUnmuting) {
        EventBus.emit("sound-mute-changed", false);
      }
    }
  };

  // Determine which icon to show based on volume level
  const getVolumeIcon = () => {
    if (volume === 0) {
      return <VolumeX className="h-5 w-5" />;
    } else if (volume < 0.5) {
      return <Volume1 className="h-5 w-5" />;
    } else {
      return <Volume2 className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex items-center gap-2 px-2">
      {/* Volume Icon */}
      <div className="text-gray-300">
        {getVolumeIcon()}
      </div>

      {/* Volume Slider */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleVolumeChange}
        className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
        title={`Volume: ${Math.round(volume * 100)}%`}
        style={{
          background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
        }}
      />
    </div>
  );
}
