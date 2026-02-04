import Phaser from "phaser";
import { useEffect, useRef, useState, useCallback } from "react";
import { Header } from "../components/Header";
import { createChopGame } from "~/game/chop";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function ChopPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<Phaser.Events.EventEmitter | null>(null);

  const { connected, publicKey } = usePrivyWallet();
  const [betAmount, setBetAmount] = useState("0.01");
  const [isCreating, setIsCreating] = useState(false);

  const [joiningLobbyId, setJoiningLobbyId] = useState<number | null>(null);

  // Convex
  const openLobbies = useQuery(api.chopLobbies.getOpenLobbies) || [];
  const createLobbyInDb = useMutation(api.chopLobbies.createLobbyInDb);
  const joinLobbyInDb = useMutation(api.chopLobbies.joinLobbyInDb);

  // Initialize game
  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    console.log("CHOP MOUNT", container);
    container.replaceChildren();
    const { game, events, destroy } = createChopGame(container);
    gameRef.current = game;
    eventsRef.current = events;
    destroyRef.current = destroy;

    // Listen for game events
    events.on("chop:gameover", (data: { score: number }) => {
      toast.info(`Game Over! Score: ${data.score}`);
    });

    return () => {
      console.log("CHOP UNMOUNT");
      destroyRef.current?.();
      gameRef.current = null;
      eventsRef.current = null;
      destroyRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []);

  // Create lobby
  const handleCreateLobby = useCallback(async () => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }

    const betLamports = Math.floor(parseFloat(betAmount) * 1e9);
    if (betLamports < 1_000_000) {
      toast.error("Minimum bet is 0.001 SOL");
      return;
    }

    setIsCreating(true);
    try {
      const lobbyId = Date.now();
      await createLobbyInDb({
        lobbyId,
        creator: publicKey.toString(),
        betAmount: betLamports,
      });
      toast.success("Lobby created!");
    } catch (error) {
      toast.error("Failed to create lobby");
    } finally {
      setIsCreating(false);
    }
  }, [connected, publicKey, betAmount, createLobbyInDb]);

  // Join lobby
  const handleJoinLobby = useCallback(async (lobbyId: number) => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }

    setJoiningLobbyId(lobbyId);
    try {
      await joinLobbyInDb({
        lobbyId,
        player: publicKey.toString(),
      });
      toast.success("Joined lobby! Game starting...");
    } catch (error) {
      toast.error("Failed to join lobby");
    } finally {
      setJoiningLobbyId(null);
    }
  }, [connected, publicKey, joinLobbyInDb]);

  const truncateWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="relative z-10">
        <Header />
      </div>

      {/* Main content */}
      <div className="fixed top-16 left-0 right-0 bottom-0 flex">
        {/* Empty spacer for balance */}
        <div className="hidden lg:block w-[320px] flex-shrink-0" />

        {/* Game Container - Centered */}
        <div className="flex-1 flex items-center justify-center">
          <div
            ref={containerRef}
            className="w-full h-full max-w-[600px] [image-rendering:pixelated] [&>canvas]:[image-rendering:pixelated]"
            data-testid="chop-container"
          />
        </div>

        {/* Lobby Sidebar - Right */}
        <div className="hidden lg:flex w-[320px] flex-shrink-0 flex-col p-4 gap-4 overflow-y-auto">
          {/* Create Lobby */}
          {connected && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4">
              <h3 className="text-sm font-bold text-green-200 mb-3">Create Game</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min="0.001"
                  step="0.001"
                  className="flex-1 bg-gray-800 border border-green-700/50 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="SOL"
                />
                <button
                  onClick={handleCreateLobby}
                  disabled={isCreating}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
                >
                  {isCreating ? "..." : "Create"}
                </button>
              </div>
            </div>
          )}

          {/* Open Lobbies */}
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-200 mb-3">Open Games</h3>
            <div className="space-y-2">
              {openLobbies.map((lobby) => {
                const isOwnLobby = publicKey && lobby.creator === publicKey.toString();
                const isJoining = joiningLobbyId === lobby.lobbyId;

                return (
                  <div
                    key={lobby._id}
                    className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white text-sm font-medium">
                          {truncateWallet(lobby.creator)}
                        </p>
                        <p className="text-gray-400 text-xs">Waiting...</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-400 text-sm font-bold">
                          {(lobby.betAmount / 1e9).toFixed(3)}
                        </span>
                        <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                      </div>
                    </div>
                    {connected && !isOwnLobby && (
                      <button
                        onClick={() => handleJoinLobby(lobby.lobbyId)}
                        disabled={isJoining}
                        className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
                      >
                        {isJoining ? "Joining..." : "Join Game"}
                      </button>
                    )}
                    {isOwnLobby && (
                      <p className="text-center text-xs text-gray-500">Your lobby</p>
                    )}
                  </div>
                );
              })}
              {openLobbies.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No open games
                </p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-gray-900/30 border border-gray-700/30 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-2">How to Play</h3>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• Tap LEFT or RIGHT to chop</li>
              <li>• Avoid branches on your side</li>
              <li>• Keep chopping to refill time</li>
              <li>• Highest score wins!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
