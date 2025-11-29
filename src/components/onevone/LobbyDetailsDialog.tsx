import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { EventBus } from "../../game/EventBus";
import { logger } from "../../lib/logger";
import { useAssets } from "../../contexts/AssetsContext";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import type { Character } from "../../types/character";
import Phaser from "phaser";
import { OneVOneBoot } from "../../game/scenes/OneVOneBoot";
import { OneVOnePreloader } from "../../game/scenes/OneVOnePreloader";
import { OneVOneScene } from "../../game/scenes/OneVOneScene";
import { setCharactersData, setAllMapsData, STAGE_WIDTH, STAGE_HEIGHT } from "../../game/main";
import { LogIn } from "lucide-react";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda?: string;
  shareToken: string;
  playerA: string;
  amount: number;
  characterA: number;
  mapId: number;
  status: 0 | 1 | 2;
  isPrivate?: boolean;
}

interface LobbyDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lobby: LobbyData | null;
  currentPlayerWallet: string;
  selectedCharacter: Character | null;
  onJoin: (lobbyId: number) => void | Promise<void>;
  onCancel: (lobbyId: number) => void;
}

export function LobbyDetailsDialog({ 
  isOpen, 
  onClose, 
  lobby, 
  currentPlayerWallet,
  selectedCharacter,
  onJoin, 
  onCancel 
}: LobbyDetailsDialogProps) {
  const { characters, maps } = useAssets();
  const { connected } = usePrivyWallet();
  const { login, ready } = usePrivy();
  const [gameReady, setGameReady] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const sceneInitialized = useRef(false);
  const modalGameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  const isCreator = lobby?.playerA === currentPlayerWallet;

  // Callback ref to detect when container is mounted
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    modalGameContainerRef.current = node;
    if (node) {
      logger.game.debug("[LobbyDetails] Container ref attached");
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
    if (!isOpen || !containerReady || !modalGameContainerRef.current || !characters || !maps) return;
    
    // Don't create if already exists
    if (gameInstanceRef.current) return;

    logger.game.info("[LobbyDetails] Creating dedicated Phaser game instance", {
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
      logger.game.info("[LobbyDetails] Scene ready:", scene.scene.key);
      if (scene.scene.key === "OneVOne") {
        logger.game.info("[LobbyDetails] OneVOne scene ready - setting gameReady=true");
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
      logger.game.info("[LobbyDetails] Destroying Phaser game instance");
      gameInstanceRef.current.destroy(true);
      gameInstanceRef.current = null;
      setGameReady(false);
      setContainerReady(false);
      sceneInitialized.current = false;
    }
  }, [isOpen]);

  // Spawn Player A's character when game is ready and lobby data is available
  useEffect(() => {
    if (!isOpen || !lobby || !gameReady) return;

    const oneVOneScene = getOneVOneScene();
    if (!oneVOneScene || sceneInitialized.current) return;

    sceneInitialized.current = true;
    logger.game.info("[LobbyDetails] Spawning Player A character", {
      characterId: lobby.characterA,
      isCreator,
    });

    // Spawn Player A's character
    if (typeof oneVOneScene.spawnSingleCharacter === "function") {
      oneVOneScene.spawnSingleCharacter({
        playerId: lobby.playerA,
        characterId: lobby.characterA,
        position: "left",
        displayName: isCreator ? "You" : "Challenger",
      });
    }
  }, [isOpen, lobby, gameReady, isCreator, getOneVOneScene]);

  // Copy share link to clipboard
  const handleCopyShareLink = useCallback(async () => {
    if (!lobby) return;
    const shareUrl = `${window.location.origin}/1v1?join=${lobby.shareToken}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  }, [lobby]);

  // Get character name from characterA id
  const characterName = characters?.find((c: Character) => c.id === lobby?.characterA)?.name || `Character #${lobby?.characterA}`;

  // Helper function to format lamports to SOL
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  // Early return AFTER all hooks are called
  if (!lobby) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-black border-2 border-indigo-500/30 text-white sm:max-w-3xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-3 pr-12 bg-gradient-to-r from-indigo-900/90 to-purple-900/90 border-b border-indigo-500/30/50">
          <DialogTitle className="text-lg font-bold text-indigo-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {lobby.isPrivate && <span title="Private Lobby">🔒</span>}
              Lobby #{lobby.lobbyId}
              {/* Share Button */}
              <button
                onClick={handleCopyShareLink}
                className="ml-2 p-1 hover:bg-indigo-700/50 rounded transition-colors"
                title="Copy share link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300 hover:text-white">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </button>
            </span>
            <span className="text-yellow-400 font-mono">
              {formatAmount(lobby.amount)} SOL
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Phaser Game Container - Shows Player A's character */}
        <div 
          ref={containerRefCallback}
          className="relative w-full aspect-[16/9] max-h-[50vh] bg-gray-900 flex items-center justify-center overflow-hidden [&>canvas]:max-w-full [&>canvas]:max-h-full [&>canvas]:object-contain"
        >
          {/* Loading indicator while Phaser initializes */}
          {!gameReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-5">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-500/30 border-t-transparent rounded-full mb-2"></div>
              <p className="text-gray-400 text-sm">Loading arena...</p>
            </div>
          )}
          
          {/* Status Banner */}
          {gameReady && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="text-center bg-black/70 px-4 py-2 rounded-lg border border-indigo-500/30/50">
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      {isCreator ? "Waiting for Opponent" : "Ready to Battle!"}
                    </h2>
                    <p className="text-gray-300 text-xs">
                      {isCreator ? "Your character is waiting in the arena" : "Join this lobby to fight!"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lobby Info Footer - Compact */}
        <div className="p-3 bg-gray-900/95 border-t border-indigo-500/30/30">
          <div className="flex gap-3 mb-3">
            <div className="flex-1 bg-black/50 p-2 rounded-lg border border-indigo-500/30/30">
              <p className="text-xs text-gray-400">Challenger</p>
              <p className="text-xs font-mono text-indigo-300 truncate">{lobby.playerA}</p>
            </div>
            <div className="bg-black/50 px-4 py-2 rounded-lg border border-indigo-500/30/30 text-center">
              <p className="text-xs text-gray-400">Character</p>
              <p className="text-sm font-semibold text-indigo-200">{characterName}</p>
            </div>
            <div className="bg-black/50 px-4 py-2 rounded-lg border border-indigo-500/30/30 text-center">
              <p className="text-xs text-gray-400">Bet</p>
              <p className="text-sm font-bold text-yellow-400">{formatAmount(lobby.amount)} SOL</p>
            </div>
          </div>

          {/* Action Buttons */}
          {isCreator ? (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-semibold rounded-lg transition-colors"
              >
                Browse Other Lobbies
              </button>
              <button
                onClick={() => onCancel(lobby.lobbyId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Cancel Lobby
              </button>
            </div>
          ) : !connected ? (
            /* User is not logged in - show connect wallet button */
            <div>
              <p className="text-xs text-yellow-400 text-center mb-2">
                ⚠️ Connect your wallet to join this battle
              </p>
              <button
                onClick={login}
                disabled={!ready}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
              >
                <LogIn className="h-4 w-4" />
                Connect Wallet to Join
              </button>
            </div>
          ) : (
            <div>
              {!selectedCharacter && (
                <p className="text-xs text-yellow-400 text-center mb-2">
                  ⚠️ Select a character before joining
                </p>
              )}
              <button
                onClick={() => onJoin(lobby.lobbyId)}
                disabled={!selectedCharacter}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-900/20"
              >
                Join Battle ({formatAmount(lobby.amount)} SOL)
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
