import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { EventBus } from "../../game/EventBus";
import { logger } from "../../lib/logger";
import { useAssets } from "../../contexts/AssetsContext";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { usePlayerNames } from "../../contexts/PlayerNamesContext";
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
  playerB?: string;
  amount: number;
  characterA: number;
  characterB?: number;
  mapId: number;
  status: 0 | 1 | 2 | 3; // 0 = Open, 1 = Awaiting VRF, 2 = VRF Received, 3 = Resolved
  winner?: string;
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
  isJoining?: boolean;
  // Props for arena functionality (fight sequence)
  onFightComplete?: () => void;
  onDoubleDown?: (amount: number) => void;
}

type ArenaState = "preview" | "waiting" | "opponent-joining" | "vrf-pending" | "fighting" | "results";

export function LobbyDetailsDialog({ 
  isOpen, 
  onClose, 
  lobby, 
  currentPlayerWallet,
  selectedCharacter,
  onJoin, 
  onCancel,
  isJoining = false,
  onFightComplete,
  onDoubleDown,
}: LobbyDetailsDialogProps) {
  const { characters, maps } = useAssets();
  const { connected, publicKey } = usePrivyWallet();
  const { playerNames } = usePlayerNames();
  const { login, ready } = usePrivy();

  // Helper to get display name for a wallet address
  const getDisplayName = useCallback((walletAddress: string, isCurrentUser: boolean) => {
    if (isCurrentUser) return "You";
    const playerData = playerNames?.find((p: any) => p.walletAddress === walletAddress);
    return playerData?.displayName || `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [playerNames]);
  const [gameReady, setGameReady] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const [arenaState, setArenaState] = useState<ArenaState>("preview");
  const [fightResult, setFightResult] = useState<{ winner: string; isUserWinner: boolean } | null>(null);
  const sceneInitialized = useRef(false);
  const previousLobbyStatus = useRef<number | null>(null);
  const playerBSpawned = useRef(false);
  const fightStarted = useRef(false); // Track if fight animation has been triggered
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
      previousLobbyStatus.current = null;
      playerBSpawned.current = false;
      fightStarted.current = false;
      setArenaState("preview");
      setFightResult(null);
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
        displayName: getDisplayName(lobby.playerA, isCreator),
      });
    }

    // If Player B exists, also spawn them
    if (lobby.playerB && lobby.characterB !== undefined && !playerBSpawned.current) {
      logger.game.info("[LobbyDetails] Spawning Player B character", {
        characterId: lobby.characterB,
      });
      playerBSpawned.current = true;
      setTimeout(() => {
        if (typeof oneVOneScene.spawnSingleCharacter === "function") {
          oneVOneScene.spawnSingleCharacter({
            playerId: lobby.playerB!,
            characterId: lobby.characterB!,
            position: "right",
            displayName: getDisplayName(lobby.playerB!, !isCreator),
          });
        }
      }, 500);
    }

    // Set initial previousLobbyStatus to track changes from this point
    previousLobbyStatus.current = lobby.status;

    // Set initial arena state based on lobby status
    if (lobby.status === 0) {
      if (lobby.playerB) {
        setArenaState("opponent-joining");
      } else {
        setArenaState(isCreator ? "waiting" : "preview");
      }
    } else if (lobby.status === 1 || lobby.status === 2) {
      // Status 1 = Awaiting VRF, Status 2 = VRF Received (both show as pending)
      setArenaState("vrf-pending");
    } else if (lobby.status === 3 && lobby.winner) {
      // Status 3 = Resolved - need to start fight animation after characters spawn
      logger.game.info("[LobbyDetails] Lobby already resolved on open, scheduling fight animation", {
        winner: lobby.winner,
        hasPlayerB: !!lobby.playerB,
      });
      fightStarted.current = true;
      setArenaState("fighting");
      
      // Delay fight animation to allow Player B character to spawn and land
      // Player A spawns immediately, Player B spawns after 500ms, give extra time for landing animation
      const fightDelay = lobby.playerB && lobby.characterB !== undefined ? 1500 : 500;
      setTimeout(() => {
        const scene = getOneVOneScene();
        if (scene && typeof scene.startFightAnimation === "function") {
          logger.game.info("[LobbyDetails] Starting fight animation (initial load)", {
            winner: lobby.winner,
          });
          scene.startFightAnimation({
            lobbyId: lobby.lobbyId,
            playerA: lobby.playerA,
            playerB: lobby.playerB || "",
            characterA: lobby.characterA,
            characterB: lobby.characterB || 0,
            winner: lobby.winner!,
            mapId: lobby.mapId,
          });
        } else {
          logger.game.warn("[LobbyDetails] Scene not ready for initial fight animation");
        }
      }, fightDelay);
    }
  }, [isOpen, lobby, gameReady, isCreator, getOneVOneScene, getDisplayName]);

  // Watch for lobby state changes (real-time updates)
  useEffect(() => {
    if (!isOpen || !lobby || !sceneInitialized.current) return;

    // Skip if no previous status (initial load is handled by the spawn effect)
    if (previousLobbyStatus.current === null) return;

    // Track status changes
    if (previousLobbyStatus.current !== lobby.status) {
      logger.game.info("[LobbyDetails] Lobby status changed", {
        from: previousLobbyStatus.current,
        to: lobby.status,
        lobbyId: lobby.lobbyId,
        winner: lobby.winner,
        hasPlayerB: !!lobby.playerB,
      });
      previousLobbyStatus.current = lobby.status;

      // Update arena state based on lobby status
      if (lobby.status === 0) {
        // Open - waiting for opponent
        if (lobby.playerB) {
          setArenaState("opponent-joining");
          
          // If Player B just joined, spawn their character
          if (lobby.characterB !== undefined && !playerBSpawned.current) {
            const scene = getOneVOneScene();
            if (scene && typeof scene.spawnSingleCharacter === "function") {
              logger.game.info("[LobbyDetails] Player B joined - spawning character");
              playerBSpawned.current = true;
              scene.spawnSingleCharacter({
                playerId: lobby.playerB,
                characterId: lobby.characterB,
                position: "right",
                displayName: getDisplayName(lobby.playerB, !isCreator),
              });
            }
          }
        } else {
          setArenaState(isCreator ? "waiting" : "preview");
        }
      } else if (lobby.status === 1 || lobby.status === 2) {
        // Status 1 = Awaiting VRF, Status 2 = VRF Received - spawn Player B if not already spawned
        if (lobby.playerB && lobby.characterB !== undefined && !playerBSpawned.current) {
          const scene = getOneVOneScene();
          if (scene && typeof scene.spawnSingleCharacter === "function") {
            logger.game.info("[LobbyDetails] VRF pending/received - spawning Player B character");
            playerBSpawned.current = true;
            scene.spawnSingleCharacter({
              playerId: lobby.playerB,
              characterId: lobby.characterB,
              position: "right",
              displayName: getDisplayName(lobby.playerB, !isCreator),
            });
          }
        }
        setArenaState("vrf-pending");
      } else if (lobby.status === 3 && lobby.winner) {
        // Status 3 = Resolved - start fight animation immediately
        logger.game.info("[LobbyDetails] Lobby resolved, starting fight animation", {
          winner: lobby.winner,
          gameReady,
          sceneInitialized: sceneInitialized.current,
          playerBSpawned: playerBSpawned.current,
          fightStarted: fightStarted.current,
        });
        
        // Only start fight if not already started (use ref to avoid stale closure)
        if (!fightStarted.current) {
          fightStarted.current = true;
          
          // Ensure Player B is spawned before starting fight (shouldn't happen normally)
          if (lobby.playerB && lobby.characterB !== undefined && !playerBSpawned.current) {
            const scene = getOneVOneScene();
            if (scene && typeof scene.spawnSingleCharacter === "function") {
              logger.game.info("[LobbyDetails] Spawning Player B before fight (late spawn)");
              playerBSpawned.current = true;
              scene.spawnSingleCharacter({
                playerId: lobby.playerB,
                characterId: lobby.characterB,
                position: "right",
                displayName: getDisplayName(lobby.playerB, !isCreator),
              });
            }
          }
          
          setArenaState("fighting");
          
          // Start fight animation immediately (no artificial delay since characters should already be spawned)
          // Use requestAnimationFrame to ensure React state update has propagated
          requestAnimationFrame(() => {
            const scene = getOneVOneScene();
            if (scene && typeof scene.startFightAnimation === "function") {
              logger.game.info("[LobbyDetails] Starting fight animation now", {
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
            } else {
              logger.game.warn("[LobbyDetails] Scene not ready for fight animation");
            }
          });
        }
      }
    }
  }, [isOpen, lobby, isCreator, getOneVOneScene, gameReady, getDisplayName]);

  // Listen for fight completion event from Phaser
  useEffect(() => {
    if (!isOpen) return;

    const handleFightComplete = () => {
      logger.game.info("[LobbyDetails] Fight animation complete");
      
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
      case "preview":
        return {
          title: isCreator ? "Your Lobby" : "Ready to Battle!",
          subtitle: isCreator ? "Waiting for someone to join" : "Join this lobby to fight!",
          showSpinner: !isCreator,
        };
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

  // Determine if close button should be shown (allow closing during preview, waiting, and results)
  const showCloseButton = arenaState === "preview" || arenaState === "waiting" || arenaState === "results" || arenaState === "opponent-joining" || arenaState === "vrf-pending";

  // Early return AFTER all hooks are called
  if (!lobby) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="bg-black border-2 border-indigo-500/30 text-white sm:max-w-4xl p-0 overflow-hidden !gap-0"
        showCloseButton={showCloseButton}
      >
        {/* Header */}
        <DialogHeader className="p-3 pr-12 bg-gradient-to-r from-indigo-900/90 to-purple-900/90 border-b border-indigo-500/30/50">
          <DialogTitle className="text-lg font-bold text-indigo-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {lobby.isPrivate && <span title="Private Lobby">🔒</span>}
              Lobby #{lobby.lobbyId}
              {/* Share Button - only show when not in fight/results */}
              {(arenaState === "preview" || arenaState === "waiting") && (
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
              )}
            </span>
            <span className="text-yellow-400 font-mono">
              {formatAmount(lobby.amount)} SOL
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Phaser Game Container - aspect ratio matches game dimensions (1188x540 = 11:5 ≈ 2.2:1) */}
        <div 
          ref={containerRefCallback}
          className="relative w-full bg-gray-900 flex items-center justify-center overflow-hidden [&>canvas]:max-w-full [&>canvas]:max-h-full [&>canvas]:object-contain"
          style={{ aspectRatio: '1188 / 540' }}
        >
          {/* Loading indicator while Phaser initializes */}
          {!gameReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-5">
              <div className="animate-spin w-10 h-10 border-4 border-indigo-500/30 border-t-transparent rounded-full mb-4"></div>
              <p className="text-gray-400 text-sm">Loading arena...</p>
            </div>
          )}
          
          {/* Status Banner - Small overlay at top */}
          {gameReady && arenaState !== "fighting" && arenaState !== "results" && (
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

        {/* Results Actions (only show when fight is complete) */}
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
                {onDoubleDown && (
                  <button
                    onClick={handleDoubleDownClick}
                    className="w-full py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold rounded-lg transform hover:scale-105 transition-all shadow-lg"
                  >
                    DOUBLE DOWN! (Bet {formatAmount(prizeAmount)} SOL)
                  </button>
                )}
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

        {/* Lobby Info Footer - Show during preview/waiting/pending states */}
        {(arenaState === "preview" || arenaState === "waiting" || arenaState === "opponent-joining" || arenaState === "vrf-pending") && (
          <div className="p-4 bg-gray-900/95 border-t border-indigo-500/30/30">
            <div className="flex gap-3 mb-3">
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-indigo-500/30/30 text-center">
                <p className="text-xs text-gray-400">Player A</p>
                <p className="text-sm font-semibold text-indigo-200">{getDisplayName(lobby.playerA, isCreator)}</p>
              </div>
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-indigo-500/30/30 text-center">
                <p className="text-xs text-gray-400">Player B</p>
                <p className="text-sm font-semibold text-indigo-200">{lobby.playerB ? getDisplayName(lobby.playerB, !isCreator) : "Waiting..."}</p>
              </div>
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-indigo-500/30/30 text-center">
                <p className="text-xs text-gray-400">Bet</p>
                <p className="text-sm font-bold text-yellow-400">{formatAmount(lobby.amount)} SOL</p>
              </div>
            </div>

            {/* Action Buttons - Only show during preview state */}
            {arenaState === "preview" && (
              <>
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
                      disabled={!selectedCharacter || isJoining}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-900/20"
                    >
                      {isJoining ? "Joining..." : `Join Battle (${formatAmount(lobby.amount)} SOL)`}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Waiting state actions for creator */}
            {arenaState === "waiting" && isCreator && (
              
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
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
