import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { EventBus } from "../../game/EventBus";
import { logger } from "../../lib/logger";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAssets } from "../../contexts/AssetsContext";
import type { Character } from "../../types/character";
import Phaser from "phaser";
import { OneVOneBoot } from "../../game/scenes/OneVOneBoot";
import { OneVOnePreloader } from "../../game/scenes/OneVOnePreloader";
import { OneVOneScene } from "../../game/scenes/OneVOneScene";
import { setCharactersData, setAllMapsData, STAGE_WIDTH, STAGE_HEIGHT } from "../../game/main";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2; // 0 = Open, 1 = Awaiting VRF, 2 = Resolved
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
  isPrivate?: boolean;
}

interface OneVOneArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  lobby: LobbyData | null;
  selectedCharacter?: Character | null; // Optional - can be used for future features
  isCreator: boolean; // true = Player A (created lobby), false = Player B (joined)
  onFightComplete?: () => void;
  onDoubleDown?: (amount: number) => void;
}

type ArenaState = "waiting" | "opponent-joining" | "vrf-pending" | "fighting" | "results";

export function OneVOneArenaModal({
  isOpen,
  onClose,
  lobby,
  isCreator,
  onFightComplete,
  onDoubleDown,
}: OneVOneArenaModalProps) {
  // selectedCharacter can be used for future character-specific features
  const { publicKey } = usePrivyWallet();
  const { characters, maps } = useAssets();
  const [arenaState, setArenaState] = useState<ArenaState>("waiting");
  const [fightResult, setFightResult] = useState<{ winner: string; isUserWinner: boolean } | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const sceneInitialized = useRef(false);
  const previousLobbyStatus = useRef<number | null>(null);
  const modalGameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  // Callback ref to detect when container is mounted
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    modalGameContainerRef.current = node;
    if (node) {
      console.log("[ArenaModal] Container ref attached:", node);
      setContainerReady(true);
    } else {
      setContainerReady(false);
    }
  }, []);

  // Get the OneVOne scene from the modal's game instance
  const getOneVOneScene = useCallback(() => {
    const game = gameInstanceRef.current;
    if (!game || !game.scene) return null;
    return game.scene.getScene("OneVOne") as any;
  }, []);

  // Create dedicated Phaser game instance for modal
  useEffect(() => {
    if (!isOpen || !containerReady || !modalGameContainerRef.current || !characters || !maps)     return;
    
    // Don't create if already exists
    if (gameInstanceRef.current)       return;

    logger.game.info("[ArenaModal] Creating dedicated Phaser game instance", {
      hasCharacters: characters.length,
      hasMaps: maps.length,
    });

    // Set global data for Preloader
    setCharactersData(characters);
    setAllMapsData(maps);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      transparent: true,
      parent: modalGameContainerRef.current,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
      },
      render: {
        antialiasGL: false,
        pixelArt: true,
      },
      audio: {
        disableWebAudio: false,
        noAudio: false,
      },
      scene: [OneVOneBoot, OneVOnePreloader, OneVOneScene],
    };

    gameInstanceRef.current = new Phaser.Game(config);

    // Listen for scene ready (OneVOnePreloader starts OneVOne directly)
    const handleSceneReady = (scene: Phaser.Scene) => {
      logger.game.info("[ArenaModal] Scene ready:", scene.scene.key);
      if (scene.scene.key === "OneVOne") {
        logger.game.info("[ArenaModal] OneVOne scene ready - setting gameReady=true");
        setGameReady(true);
      }
    };
    EventBus.on("current-scene-ready", handleSceneReady);

    return () => {
      EventBus.off("current-scene-ready", handleSceneReady);
    };
  }, [isOpen, containerReady, characters, maps]);

  // Cleanup game instance when modal closes
  useEffect(() => {
    if (!isOpen && gameInstanceRef.current) {
      logger.game.info("[ArenaModal] Destroying Phaser game instance");
      gameInstanceRef.current.destroy(true);
      gameInstanceRef.current = null;
      setGameReady(false);
      setContainerReady(false);
      sceneInitialized.current = false;
      previousLobbyStatus.current = null;
      setArenaState("waiting");
      setFightResult(null);
    }
  }, [isOpen]);

  // Spawn characters when game is ready and lobby data is available
  useEffect(() => {
    if (!isOpen || !lobby || !gameReady) return;

    const oneVOneScene = getOneVOneScene();
    if (!oneVOneScene || sceneInitialized.current) return;

    sceneInitialized.current = true;
    logger.game.info("[ArenaModal] Spawning Player A character", {
      characterId: lobby.characterA,
      isCreator,
    });

    // Spawn Player A's character
    if (typeof oneVOneScene.spawnSingleCharacter === "function") {
      oneVOneScene.spawnSingleCharacter({
        playerId: lobby.playerA,
        characterId: lobby.characterA,
        position: "left",
        displayName: isCreator ? "You" : "Opponent",
      });
    }

    // If Player B exists, also spawn them
    if (lobby.playerB && lobby.characterB !== undefined) {
      logger.game.info("[ArenaModal] Spawning Player B character", {
        characterId: lobby.characterB,
      });
      setTimeout(() => {
        if (typeof oneVOneScene.spawnSingleCharacter === "function") {
          oneVOneScene.spawnSingleCharacter({
            playerId: lobby.playerB!,
            characterId: lobby.characterB!,
            position: "right",
            displayName: !isCreator ? "You" : "Opponent",
          });
        }
      }, 500);
    }
  }, [isOpen, lobby, gameReady, isCreator, getOneVOneScene]);

  // Watch for lobby state changes (real-time updates from Convex)
  useEffect(() => {
    if (!isOpen || !lobby) return;

    // Track status changes
    if (previousLobbyStatus.current !== lobby.status) {
      logger.game.info("[ArenaModal] Lobby status changed", {
        from: previousLobbyStatus.current,
        to: lobby.status,
        lobbyId: lobby.lobbyId,
      });
      previousLobbyStatus.current = lobby.status;

      // Update arena state based on lobby status
      if (lobby.status === 0) {
        // Open - waiting for opponent
        if (lobby.playerB) {
          setArenaState("opponent-joining");
          
          // If Player B just joined, spawn their character
          if (lobby.characterB !== undefined && sceneInitialized.current) {
            const scene = getOneVOneScene();
            if (scene && typeof scene.spawnSingleCharacter === "function") {
              logger.game.info("[ArenaModal] Player B joined - spawning character");
              scene.spawnSingleCharacter({
                playerId: lobby.playerB,
                characterId: lobby.characterB,
                position: "right",
                displayName: !isCreator ? "You" : "Opponent",
              });
            }
          }
        } else {
          setArenaState("waiting");
        }
      } else if (lobby.status === 1) {
        // Awaiting VRF
        setArenaState("vrf-pending");
      } else if (lobby.status === 2 && lobby.winner) {
        // Resolved - start fight animation
        setArenaState("fighting");
        
        const scene = getOneVOneScene();
        if (scene && typeof scene.startFightAnimation === "function") {
          logger.game.info("[ArenaModal] Starting fight animation", {
            winner: lobby.winner,
          });
          scene.startFightAnimation({
            lobbyId: lobby.lobbyId,
            playerA: lobby.playerA,
            playerB: lobby.playerB || "",
            characterA: lobby.characterA,
            characterB: lobby.characterB || 0,
            winner: lobby.winner,
            mapId: lobby.mapId,
          });
        }
      }
    }
  }, [isOpen, lobby, isCreator, getOneVOneScene]);

  // Listen for fight completion event from Phaser
  useEffect(() => {
    if (!isOpen) return;

    const handleFightComplete = () => {
      logger.game.info("[ArenaModal] Fight animation complete");
      
      if (lobby?.winner && publicKey) {
        const isUserWinner = lobby.winner === publicKey.toString();
        setFightResult({
          winner: lobby.winner,
          isUserWinner,
        });
        setArenaState("results");

        // If user lost, auto-close after delay
        if (!isUserWinner) {
          setTimeout(() => {
            onFightComplete?.();
            onClose();
          }, 3000);
        }
      }
    };

    EventBus.on("1v1-complete", handleFightComplete);

    return () => {
      EventBus.off("1v1-complete", handleFightComplete);
    };
  }, [isOpen, lobby, publicKey, onFightComplete, onClose]);

  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  const prizeAmount = lobby ? lobby.amount * 2 * 0.98 : 0;

  const handleDoubleDownClick = () => {
    if (onDoubleDown && prizeAmount > 0) {
      onDoubleDown(prizeAmount);
      onClose();
    }
  };

  const handleCollectAndLeave = () => {
    onFightComplete?.();
    onClose();
  };

  // Determine the status display text
  const getStatusDisplay = () => {
    switch (arenaState) {
      case "waiting":
        return {
          title: "Waiting for Opponent",
          subtitle: "Your character has entered the arena!",
          showSpinner: true,
        };
      case "opponent-joining":
        return {
          title: "Opponent Joining",
          subtitle: "Get ready to fight!",
          showSpinner: true,
        };
      case "vrf-pending":
        return {
          title: "Generating Randomness",
          subtitle: "Oracle is determining the winner...",
          showSpinner: true,
        };
      case "fighting":
        return {
          title: "⚔️ FIGHT!",
          subtitle: "",
          showSpinner: false,
        };
      case "results":
        return {
          title: fightResult?.isUserWinner ? "🎉 VICTORY!" : "💀 DEFEAT",
          subtitle: fightResult?.isUserWinner
            ? `You won ${formatAmount(prizeAmount)} SOL!`
            : "Better luck next time!",
          showSpinner: false,
        };
      default:
        return { title: "", subtitle: "", showSpinner: false };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      logger.game.info("[ArenaModal] Modal state:", {
        isOpen,
        lobby: lobby ? { lobbyId: lobby.lobbyId, amount: lobby.amount, playerA: lobby.playerA } : null,
        gameReady,
        arenaState,
        hasCharacters: !!characters?.length,
        hasMaps: !!maps?.length,
      });
    }
  }, [isOpen, lobby, gameReady, arenaState, characters, maps]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-black border-2 border-indigo-500/30 text-white sm:max-w-4xl p-0 overflow-hidden"
        showCloseButton={arenaState === "waiting" || arenaState === "results"}
      >
        {/* Arena Header */}
        <DialogHeader className="p-4 pr-12 bg-gradient-to-r from-indigo-900/90 to-purple-900/90 border-b border-indigo-500/30/50">
          <DialogTitle className="text-xl font-bold text-indigo-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Lobby #{lobby?.lobbyId ?? "..."}
            </span>
            <span className="text-yellow-400 font-mono text-lg">
              {lobby ? formatAmount(lobby.amount) : "..."} SOL
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Phaser Game Container - Canvas will be rendered here */}
        <div 
          ref={containerRefCallback}
          className="relative w-full aspect-video bg-gray-900 flex items-center justify-center overflow-hidden [&>canvas]:max-w-full [&>canvas]:max-h-full [&>canvas]:object-contain"
        >
          {/* Loading indicator while Phaser initializes */}
          {!gameReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-5">
              <div className="animate-spin w-10 h-10 border-4 border-indigo-500/30 border-t-transparent rounded-full mb-4"></div>
              <p className="text-gray-400 text-sm">Loading arena...</p>
            </div>
          )}
          
          {/* Status Banner - Small overlay at top, doesn't block the arena view */}
          {gameReady && (arenaState === "waiting" || arenaState === "vrf-pending" || arenaState === "opponent-joining") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="text-center bg-black/70 px-6 py-3 rounded-lg border border-indigo-500/30/50">
                <div className="flex items-center gap-3">
                  {statusDisplay.showSpinner && (
                    <div className="animate-spin w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-white">{statusDisplay.title}</h2>
                    <p className="text-gray-300 text-sm">{statusDisplay.subtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fight Banner */}
          {arenaState === "fighting" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <h2 className="text-4xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">
                {statusDisplay.title}
              </h2>
            </div>
          )}
        </div>

        {/* Results Actions (only show when fight is complete and user won) */}
        {arenaState === "results" && fightResult && (
          <div className="p-6 bg-gray-900/95 border-t border-indigo-500/30/50">
            <div className="text-center mb-4">
              <h2
                className={`text-3xl font-black mb-2 ${
                  fightResult.isUserWinner
                    ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]"
                    : "text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                }`}
              >
                {statusDisplay.title}
              </h2>
              <p className="text-gray-300">{statusDisplay.subtitle}</p>
            </div>

            {fightResult.isUserWinner ? (
              <div className="space-y-3 max-w-sm mx-auto">
                <button
                  onClick={handleDoubleDownClick}
                  className="w-full py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold rounded-lg transform hover:scale-105 transition-all shadow-lg"
                >
                  DOUBLE DOWN! (Bet {formatAmount(prizeAmount)} SOL)
                </button>
                <button
                  onClick={handleCollectAndLeave}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-lg transition-colors"
                >
                  Collect & Leave
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-4">Returning to lobby list...</p>
              </div>
            )}
          </div>
        )}

        {/* Lobby Info Footer (show during waiting/pending states) */}
        {(arenaState === "waiting" || arenaState === "opponent-joining" || arenaState === "vrf-pending") && (
          <div className="p-4 bg-gray-900/95 border-t border-indigo-500/30/30">
            <div className="flex justify-between items-center text-sm">
              <div>
                <span className="text-gray-400">Player A: </span>
                <span className="text-indigo-300 font-mono">
                  {lobby?.playerA ? `${lobby.playerA.slice(0, 4)}...${lobby.playerA.slice(-4)}` : "Loading..."}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Player B: </span>
                <span className="text-indigo-300 font-mono">
                  {lobby?.playerB ? `${lobby.playerB.slice(0, 4)}...${lobby.playerB.slice(-4)}` : "Waiting..."}
                </span>
              </div>
            </div>
            
            {/* Close button for creator during waiting */}
            {arenaState === "waiting" && isCreator && (
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500 mb-2">
                  You can close this dialog and browse other lobbies while waiting.
                </p>
                <button
                  onClick={onClose}
                  className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                >
                  Browse Other Lobbies
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
