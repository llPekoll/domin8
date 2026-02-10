import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { EventBus } from "../../game/EventBus";
import { logger } from "../../lib/logger";
import { useAssets } from "../../contexts/AssetsContext";
import { useActiveWallet } from "../../contexts/ActiveWalletContext";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import type { Character } from "../../types/character";
import Phaser from "phaser";
import { OneVOneBoot } from "../../game/scenes/OneVOneBoot";
import { OneVOnePreloader } from "../../game/scenes/OneVOnePreloader";
import { OneVOneScene } from "../../game/scenes/OneVOneScene";
import { setCharactersData, setAllMapsData, STAGE_WIDTH, STAGE_HEIGHT } from "../../game/main";
import { LogIn, ChevronLeft, ChevronRight } from "lucide-react";
import { SpriteAnimator } from "../SpriteAnimator";

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
  status: 0 | 1 | 2 | 3; // 0 = Open, 1 = Awaiting VRF, 2 = Ready, 3 = Resolved
  winner?: string;
  isPrivate?: boolean;
  settleTxHash?: string; // Transaction hash for prize settlement
  prizeAmount?: number; // Actual prize won in lamports (from tx logs)
  winStreak?: number; // Current win streak for double-down
}

interface LobbyDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lobby: LobbyData | null;
  currentPlayerWallet: string;
  selectedCharacter: Character | null;
  onJoin: (lobbyId: number, character?: Character) => void | Promise<void>;
  isJoining?: boolean;
  // Props for arena functionality (fight sequence)
  onFightComplete?: () => void;
  onDoubleDown?: (amount: number, winStreak: number) => void;
}

type ArenaState =
  | "preview"
  | "waiting"
  | "opponent-joining"
  | "vrf-pending"
  | "fighting"
  | "results";

export function LobbyDetailsDialog({
  isOpen,
  onClose,
  lobby,
  currentPlayerWallet,
  selectedCharacter,
  onJoin,
  isJoining = false,
  onFightComplete,
  onDoubleDown,
}: LobbyDetailsDialogProps) {
  const { characters, maps } = useAssets();
  const { connected, activePublicKey: publicKey, solBalance } = useActiveWallet();
  const { login, ready } = usePrivy();

  // Check if user has enough balance to join (amount is in lamports)
  const hasEnoughBalance = lobby ? solBalance >= lobby.amount / 1e9 : false;

  // Local character selection state for joining via shared link
  const [localCharacterIndex, setLocalCharacterIndex] = useState(0);

  // Always use local character index for selection in dialog
  const localSelectedCharacter = useMemo(() => {
    if (characters && characters.length > 0) {
      const safeIndex = localCharacterIndex % characters.length;
      return characters[safeIndex >= 0 ? safeIndex : 0];
    }
    return null;
  }, [characters, localCharacterIndex]);

  // Sync local index when dialog opens or selectedCharacter changes
  useEffect(() => {
    if (isOpen && selectedCharacter && characters && characters.length > 0) {
      const idx = characters.findIndex((c: Character) => c._id === selectedCharacter._id);
      if (idx >= 0) {
        setLocalCharacterIndex(idx);
      }
    }
  }, [isOpen, selectedCharacter, characters]);

  const handleCharacterChange = useCallback((direction: "prev" | "next") => {
    if (!characters || characters.length === 0) return;
    setLocalCharacterIndex(prev => {
      if (direction === "prev") {
        return prev === 0 ? characters.length - 1 : prev - 1;
      } else {
        return prev === characters.length - 1 ? 0 : prev + 1;
      }
    });
  }, [characters]);

  // Get unique wallet addresses from the lobby to fetch player names
  const lobbyWallets = useMemo(() => {
    if (!lobby) return [];
    const wallets = [lobby.playerA];
    if (lobby.playerB) wallets.push(lobby.playerB);
    return wallets;
  }, [lobby]);

  // Fetch player names for lobby participants
  const playerNames = useQuery(
    api.players.getPlayersByWallets,
    lobbyWallets.length > 0 ? { walletAddresses: lobbyWallets } : "skip"
  );

  // Create a lookup map for quick access
  const playerNameMap = useMemo(() => {
    if (!playerNames) return new Map<string, string | null>();
    return new Map(playerNames.map((p: any) => [p.walletAddress, p.displayName]));
  }, [playerNames]);

  // Helper to get display name for a wallet address
  const getDisplayName = useCallback(
    (walletAddress: string, isCurrentUser: boolean) => {
      if (isCurrentUser) return "You";
      // Look up player name from the map
      const displayName = playerNameMap.get(walletAddress);
      if (displayName) {
        return displayName;
      }
      // Fallback to sliced wallet address
      return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    },
    [playerNameMap]
  );

  const [gameReady, setGameReady] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const [arenaState, setArenaState] = useState<ArenaState>("preview");

  const [fightResult, setFightResult] = useState<{ winner: string; isUserWinner: boolean } | null>(
    null
  );
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
    if (!isOpen || !containerReady || !modalGameContainerRef.current || !characters || !maps)
      return;

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

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      // Reset to fresh state when opening
      setArenaState("preview");
      setFightResult(null);
      sceneInitialized.current = false;
      previousLobbyStatus.current = null;
      playerBSpawned.current = false;
      fightStarted.current = false;
    } else {
      // Cleanup when closing
      setGameReady(false);
      setContainerReady(false);

      // Cleanup game instance if it exists
      if (gameInstanceRef.current) {
        logger.game.info("[LobbyDetails] Destroying Phaser game instance");
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    }
  }, [isOpen]);

  // Spawn Player A's character when game is ready and lobby data is available
  useEffect(() => {
    if (!isOpen || !lobby || !gameReady) return;

    const oneVOneScene = getOneVOneScene();
    if (!oneVOneScene || sceneInitialized.current) return;

    sceneInitialized.current = true;

    // Debug: Log the lobby data received from props
    console.log("[1v1 Debug] LobbyDetailsDialog - lobby prop received:", {
      lobbyId: lobby.lobbyId,
      characterA: lobby.characterA,
      characterB: lobby.characterB,
      playerA: lobby.playerA,
      playerB: lobby.playerB,
      status: lobby.status,
    });

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
      // Status 1 = Awaiting VRF, Status 2 = Ready (both show as pending)
      setArenaState("vrf-pending");
    } else if (lobby.status === 3 && lobby.winner) {
      // Status 3 = Resolved - always show fight animation first
      logger.game.info(
        "[LobbyDetails] Lobby already resolved on open, scheduling fight animation",
        {
          winner: lobby.winner,
          hasPlayerB: !!lobby.playerB,
        }
      );
      fightStarted.current = true;
      setArenaState("fighting");

      // Delay fight animation to allow Player B character to spawn and land
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
  }, [isOpen, lobby, gameReady, isCreator, getOneVOneScene, getDisplayName, publicKey]);

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
        // Status 1 = Awaiting VRF, Status 2 = Ready - spawn Player B if not already spawned
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

  // Listen for results ready event (shows buttons immediately)
  useEffect(() => {
    if (!isOpen) return;

    const handleResultsReady = () => {
      logger.game.info("[LobbyDetails] Results ready, showing buttons");

      if (lobby?.winner && publicKey) {
        const isUserWinner = lobby.winner === publicKey.toString();
        setFightResult({
          winner: lobby.winner,
          isUserWinner,
        });
        setArenaState("results");
      }
    };

    EventBus.on("1v1-results-ready", handleResultsReady);

    return () => {
      EventBus.off("1v1-results-ready", handleResultsReady);
    };
  }, [isOpen, lobby, publicKey]);

  // Listen for fight completion event from Phaser (for auto-close on loss)
  useEffect(() => {
    if (!isOpen) return;

    const handleFightComplete = () => {
      logger.game.info("[LobbyDetails] Fight animation complete");

      // If user lost, auto-close after delay
      if (lobby?.winner && publicKey) {
        const isUserWinner = lobby.winner === publicKey.toString();
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

  // Helper function to format lamports to SOL
  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(3);
  };

  // Use actual prize from tx logs, or calculate fallback (95% of total pot)
  const prizeAmount = lobby?.prizeAmount ?? (lobby ? lobby.amount * 2 * 0.95 : 0);

  // Win streak logic:
  // - Only Player A can carry a streak (they created via double-down)
  // - If Player A wins, their streak continues: currentStreak + 1
  // - If Player B wins, they start fresh at 1
  // Use fightResult.winner first, fallback to lobby.winner for resolved lobbies
  const actualWinner = fightResult?.winner ?? lobby?.winner;
  const isWinnerPlayerA = lobby && actualWinner === lobby.playerA;
  const newWinStreak = isWinnerPlayerA ? (lobby?.winStreak ?? 0) + 1 : 1;

  const handleDoubleDownClick = () => {
    if (onDoubleDown && prizeAmount > 0) {
      onDoubleDown(prizeAmount, newWinStreak);
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
            ? `You won ${formatAmount(prizeAmount)} SOL!${newWinStreak > 1 ? ` 🔥 ${newWinStreak} win streak!` : ""}`
            : "Better luck next time!",
          showSpinner: false,
        };
      default:
        return { title: "", subtitle: "", showSpinner: false };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Determine if close button should be shown (allow closing during preview, waiting, and results)
  const showCloseButton =
    arenaState === "preview" ||
    arenaState === "waiting" ||
    arenaState === "results" ||
    arenaState === "opponent-joining" ||
    arenaState === "vrf-pending";

  // Early return AFTER all hooks are called
  if (!lobby) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-black border-2 border-amber-700/50 text-white sm:max-w-4xl p-0 overflow-hidden !gap-0"
        showCloseButton={showCloseButton}
      >
        {/* Header */}
        <DialogHeader className="p-3 pr-12 bg-linear-to-r from-amber-900/90 to-amber-950/90 border-b border-amber-700/50">
          <DialogTitle className="text-lg font-bold text-amber-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {lobby.isPrivate && <span title="Private Lobby">🔒</span>}
              Battle #{lobby.lobbyId}
              {/* Share Button - only show when not in fight/results */}
              {(arenaState === "preview" || arenaState === "waiting") &&
                lobby.playerA == publicKey?.toString() && (
                  <button
                    onClick={handleCopyShareLink}
                    className="ml-2 p-1 hover:bg-amber-700/50 rounded transition-colors"
                    title="Copy share link"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-amber-300 hover:text-white"
                    >
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </button>
                )}
            </span>
            <span className="text-amber-400 font-mono flex items-center gap-1">
              <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
              {formatAmount(lobby.amount)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Phaser Game Container - aspect ratio matches game dimensions (1188x540 = 11:5 ≈ 2.2:1) */}
        <div
          ref={containerRefCallback}
          className="relative w-full bg-gray-900 flex items-center justify-center overflow-hidden [&>canvas]:max-w-full [&>canvas]:max-h-full [&>canvas]:object-contain"
          style={{ aspectRatio: "1188 / 540" }}
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
              <div className="text-center bg-black/70 px-6 py-3 rounded-lg border border-amber-700/50">
                <div className="flex items-center gap-3">
                  {statusDisplay.showSpinner && (
                    <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full"></div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-amber-100">{statusDisplay.title}</h2>
                    <p className="text-amber-300/80 text-sm">{statusDisplay.subtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer during fighting - just show back button */}
        {arenaState === "fighting" && (
          <div className="p-4 bg-linear-to-b from-amber-900/50 to-amber-950/50 border-t border-amber-700/50">
            <div className="text-center flex flex-col items-center gap-2">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/40 text-amber-300 rounded transition-colors"
              >
                Back to Lobby List
              </button>
            </div>
          </div>
        )}

        {/* Results Actions - show win/lose UI with actual prize and win streak */}
        {arenaState === "results" && fightResult && (
          <div className="p-4 bg-linear-to-b from-amber-900/50 to-amber-950/50 border-t border-amber-700/50">
            {fightResult.isUserWinner ? (
              <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                {/* Prize display */}
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <img src="/sol-logo.svg" alt="SOL" className="w-6 h-6" />
                    <span className="text-2xl font-bold text-amber-300">
                      +{formatAmount(prizeAmount)} SOL
                    </span>
                  </div>
                  {newWinStreak > 1 && (
                    <div className="text-amber-400 text-sm font-semibold animate-pulse">
                      🔥 {newWinStreak} Win Streak!
                    </div>
                  )}
                </div>

                {/* Double down button */}
                {onDoubleDown && (
                  <button
                    onClick={handleDoubleDownClick}
                    className="w-full py-3 bg-linear-to-b from-amber-500 to-amber-700 hover:to-amber-800 text-amber-100 font-bold rounded-lg transform hover:scale-105 transition-all shadow-lg"
                  >
                    🔥 DOUBLE DOWN! (Bet {formatAmount(prizeAmount)} SOL)
                  </button>
                )}
                <button
                  onClick={handleCollectAndLeave}
                  className="px-6 py-1.5 text-sm bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/40 text-amber-300/80 rounded transition-colors"
                >
                  Collect & Leave
                </button>
                {lobby.settleTxHash && (
                  <a
                    href={`https://solscan.io/tx/${lobby.settleTxHash}${import.meta.env.VITE_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-400/60 hover:text-amber-300 underline"
                  >
                    View settlement transaction ↗
                  </a>
                )}
              </div>
            ) : (
              <div className="text-center flex flex-col items-center gap-2">
                <div className="text-red-400 text-sm mb-1">
                  You lost {formatAmount(lobby.amount)} SOL
                </div>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/40 text-amber-300 rounded transition-colors"
                >
                  Back to Lobby List
                </button>
                {lobby.settleTxHash && (
                  <a
                    href={`https://solscan.io/tx/${lobby.settleTxHash}${import.meta.env.VITE_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-400/60 hover:text-amber-300 underline"
                  >
                    View settlement transaction ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lobby Info Footer - Show during preview/waiting/pending states */}
        {(arenaState === "preview" ||
          arenaState === "waiting" ||
          arenaState === "opponent-joining" ||
          arenaState === "vrf-pending") && (
          <div className="p-4 bg-linear-to-b from-amber-900/50 to-amber-950/50 border-t border-amber-700/30">
            <div className="flex gap-3 mb-3">
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-amber-700/50 text-center flex-1">
                <p className="text-xs text-amber-400/70">Player A</p>
                <p className="text-sm font-semibold text-amber-200">
                  {getDisplayName(lobby.playerA, isCreator)}
                </p>
              </div>
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-amber-700/50 text-center flex-1">
                <p className="text-xs text-amber-400/70">Player B</p>
                <p className="text-sm font-semibold text-amber-200">
                  {lobby.playerB ? getDisplayName(lobby.playerB, !isCreator) : "Waiting..."}
                </p>
              </div>
              <div className="bg-black/50 px-4 py-2 rounded-lg border border-amber-700/50 text-center flex-1">
                <p className="text-xs text-amber-400/70">Bet</p>
                <div className="flex items-center gap-1 justify-center">
                  <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                  <p className="text-sm font-bold text-amber-300">{formatAmount(lobby.amount)}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons - Only show during preview state */}
            {arenaState === "preview" && (
              <>
                {isCreator ? null : !connected ? (
                  /* User is not logged in - show connect wallet button */
                  <div>
                    <p className="text-xs text-amber-400 text-center mb-2">
                      Connect your wallet to join this battle
                    </p>
                    <button
                      onClick={login}
                      disabled={!ready}
                      className="w-full bg-linear-to-b from-amber-500 to-amber-700 hover:to-amber-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-amber-100 font-bold py-2 px-4 rounded-lg transition-colors shadow-lg flex items-center justify-center gap-2"
                    >
                      <LogIn className="h-4 w-4" />
                      Connect Wallet to Join
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Character Selector */}
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-xs text-amber-400">Your Fighter:</span>
                      <div className="flex items-center gap-1 bg-black/40 border border-amber-700/50 rounded-lg px-2 py-1">
                        <button
                          onClick={() => handleCharacterChange("prev")}
                          disabled={!characters || characters.length <= 1}
                          className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
                        >
                          <ChevronLeft className="w-4 h-4 text-amber-300" />
                        </button>

                        <div className="flex items-center gap-2 w-30 justify-center">
                          {localSelectedCharacter && (
                            <>
                              <div className="w-8 shrink-0 flex items-center justify-center">
                                <SpriteAnimator
                                  assetPath={localSelectedCharacter.assetPath}
                                  animation="idle"
                                  size={32}
                                  scale={1.5}
                                />
                              </div>
                              <span className="text-amber-100 font-bold text-xs uppercase truncate">
                                {localSelectedCharacter.name}
                              </span>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleCharacterChange("next")}
                          disabled={!characters || characters.length <= 1}
                          className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
                        >
                          <ChevronRight className="w-4 h-4 text-amber-300" />
                        </button>
                      </div>
                    </div>

                    {!hasEnoughBalance && (
                      <p className="text-xs text-red-400 text-center mb-2">
                        Insufficient balance. You need {formatAmount(lobby.amount)} SOL
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (localSelectedCharacter) {
                          onJoin(lobby.lobbyId, localSelectedCharacter);
                        }
                      }}
                      disabled={!localSelectedCharacter || isJoining || !hasEnoughBalance}
                      className="w-full bg-linear-to-b from-amber-500 to-amber-700 hover:to-amber-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-amber-100 font-bold py-2 px-4 rounded-lg transition-colors shadow-lg"
                    >
                      {isJoining ? "Joining..." : `Join Battle (${formatAmount(lobby.amount)} SOL)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
