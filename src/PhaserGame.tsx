import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import StartGame, { setCharactersData, setAllMapsData, setDemoMapData } from "./game/main";
import { EventBus } from "./game/EventBus";
import { useAssets } from "./contexts/AssetsContext";
import { GlobalGameStateManager } from "./game/managers/GlobalGameStateManager";
import { useSocket, socketRequest } from "./lib/socket";
import { usePrivyWallet } from "./hooks/usePrivyWallet";

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
  const gameStateManager = useRef<GlobalGameStateManager | null>(null);
  const hasRecordedArenaView = useRef(false);

  // Fetch all data from assets context (shared across app)
  const { characters, maps: allMaps } = useAssets();

  // Get wallet connection status - only trigger presence bot if user is connected
  const { connected: isWalletConnected } = usePrivyWallet();

  // Presence bot: record when user views the arena via socket
  const { socket } = useSocket();
  const recordArenaView = useCallback(async () => {
    if (!socket) return;
    await socketRequest(socket, "record-arena-view");
  }, [socket]);

  // Select random map client-side for demo mode (only recalculate when map count changes)
  const demoMap = useMemo(() => {
    if (!allMaps || allMaps.length === 0) return null;
    return allMaps[Math.floor(Math.random() * allMaps.length)];
  }, [allMaps?.length]);

  // Check if all required data is loaded
  const isDataReady =
    characters && characters.length > 0 && allMaps && allMaps.length > 0 && demoMap;

  useLayoutEffect(() => {
    if (!isDataReady) {
      // Assets not ready yet, wait for them to load
      return;
    }

    if (game.current !== null) {
      // Game already initialized
      return;
    }

    // Pass characters data to Phaser
    setCharactersData(characters);

    // Pass ALL maps data to Phaser (so Preloader can load them all)
    setAllMapsData(allMaps);

    // Pass selected demo map
    setDemoMapData(demoMap);

    game.current = StartGame("game-container");

    // Expose game instance globally for modal components to access
    (window as any).phaserGame = game.current;

    // Initialize GlobalGameStateManager ONCE with Phaser game lifecycle
    if (game.current) {
      gameStateManager.current = new GlobalGameStateManager(game.current);
    }

    if (typeof ref === "function") {
      ref({ game: game.current, scene: null });
    } else if (ref) {
      ref.current = { game: game.current, scene: null };
    }

    return () => {
      // Clean up global reference
      (window as any).phaserGame = undefined;

      // Cleanup GlobalGameStateManager before destroying game
      if (gameStateManager.current) {
        gameStateManager.current.destroy();
        gameStateManager.current = null;
      }

      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, [ref, isDataReady, characters, allMaps, demoMap]);

  // Presence bot: record arena view when user connects (triggers 5s delayed bot spawn on backend)
  // This effect runs when: data is ready (game initialized) AND user wallet is connected
  useEffect(() => {
    if (!hasRecordedArenaView.current && isWalletConnected && isDataReady) {
      hasRecordedArenaView.current = true;
      recordArenaView().catch((err) => {
        console.error("[PhaserGame] Failed to record arena view:", err);
      });
      console.log("👀 [PhaserGame] Arena view recorded for presence bot (user connected)");
    }
  }, [isWalletConnected, isDataReady, recordArenaView]);

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

      // Pass characters data to Game scene when it's ready
      if (scene_instance.scene.key === "Game" && characters) {
        (scene_instance as any).setCharacters?.(characters);
      }
    });
    return () => {
      EventBus.removeListener("current-scene-ready");
    };
  }, [currentActiveScene, ref, characters]);

  // Update characters in Game scene when they change
  useEffect(() => {
    if (!game.current || !characters) return;

    const gameScene = game.current.scene.getScene("Game");
    if (gameScene && gameScene.scene.isActive()) {
      (gameScene as any).setCharacters?.(characters);
    }
  }, [characters]);

  // Show loading state while assets are being fetched
  if (!isDataReady) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="text-white text-2xl mb-4">Loading...</div>
          <div className="text-gray-400 text-sm">Preparing game assets</div>
        </div>
      </div>
    );
  }

  return <div id="game-container" className="w-full h-full"></div>;
});
