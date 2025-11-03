import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import StartGame, { setCharactersData, setDemoMapData } from "./game/main";
import { EventBus } from "./game/EventBus";

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame(
  { currentActiveScene },
  ref
) {
  const game = useRef<Phaser.Game | null>(null);

  // Fetch data for demo mode
  const characters = useQuery(api.characters.getActiveCharacters);
  const allMaps = useQuery(api.maps.getAllActiveMaps);

  // Select random map client-side (only recalculate when map count changes)
  const demoMap = useMemo(() => {
    if (!allMaps || allMaps.length === 0) return null;
    return allMaps[Math.floor(Math.random() * allMaps.length)];
  }, [allMaps?.length]);

  // Check if all required data is loaded
  const isDataReady = characters && characters.length > 0 && demoMap;

  useLayoutEffect(() => {
    if (game.current === null && isDataReady) {
      // TODO: Pass current game's map data when Solana integration is complete
      // For now in demo mode, only use demoMap

      // Pass characters data to Phaser
      setCharactersData(characters);

      // Pass single demo map for demo mode
      setDemoMapData(demoMap);

      game.current = StartGame("game-container");

      if (typeof ref === "function") {
        ref({ game: game.current, scene: null });
      } else if (ref) {
        ref.current = { game: game.current, scene: null };
      }
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, [ref, isDataReady, characters, demoMap]);

  useEffect(() => {
    EventBus.on("current-scene-ready", (scene_instance: Phaser.Scene) => {
      if (currentActiveScene && typeof currentActiveScene === "function") {
        currentActiveScene(scene_instance);
      }

      if (typeof ref === "function") {
        ref({ game: game.current, scene: scene_instance });
      } else if (ref) {
        ref.current = { game: game.current, scene: scene_instance };
      }
    });
    return () => {
      EventBus.removeListener("current-scene-ready");
    };
  }, [currentActiveScene, ref]);

  return <div id="game-container" className="w-full h-full"></div>;
});
