import Phaser from "phaser";
import { useEffect, useRef, useState, useCallback } from "react";
import { Header } from "../components/Header";
import { createChopGame, setChopHighScore } from "~/game/chop";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSharedConnection } from "../lib/sharedConnection";
import bs58 from "bs58";

// ============================================================================
// STATE MACHINE - Single source of truth for game state
// ============================================================================

type GameStatus = "ready" | "countdown" | "playing" | "gameover";

type ChopState =
  | { mode: "idle" }
  | { mode: "demo"; status: GameStatus; score: number }
  | { mode: "solo"; status: GameStatus; score: number; sessionId: string; livesRemaining: number; continuePrice: number }
  | { mode: "pvp"; status: GameStatus; score: number; lobbyId: number };

const initialState: ChopState = { mode: "idle" };

// Solo mode pricing
const SOLO_START_PRICE = 0.1; // SOL
const SOLO_TREASURY = "FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB";

export function ChopPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<Phaser.Events.EventEmitter | null>(null);

  const { connected, publicKey, wallet } = usePrivyWallet();
  const connection = getSharedConnection();

  // ============================================================================
  // SINGLE GAME STATE
  // ============================================================================
  const [gameState, setGameState] = useState<ChopState>(initialState);

  // UI states (not game logic)
  const [betAmount, setBetAmount] = useState("0.01");
  const [isCreating, setIsCreating] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<number | null>(null);
  const [isStartingSolo, setIsStartingSolo] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  // ============================================================================
  // CONVEX QUERIES & MUTATIONS
  // ============================================================================
  const openLobbies = useQuery(api.chopLobbies.getOpenLobbies) || [];
  const activeLobbies = useQuery(api.chopLobbies.getActiveLobbies) || [];
  const createLobbyInDb = useMutation(api.chopLobbies.createLobbyInDb);
  const joinLobbyInDb = useMutation(api.chopLobbies.joinLobbyInDb);

  const soloLeaderboard = useQuery(api.chopSolo.getSoloLeaderboard, { limit: 10 });
  const currentJackpot = useQuery(api.chopJackpot.getCurrentJackpot);
  const startSoloSessionVerified = useAction(api.chopSoloActions.startSoloSessionVerified);
  const recordSoloDeath = useMutation(api.chopSolo.recordSoloDeath);
  const continueSoloSessionVerified = useAction(api.chopSoloActions.continueSoloSessionVerified);
  const endSoloSession = useMutation(api.chopSolo.endSoloSession);
  const recordChop = useMutation(api.chopSolo.recordChop);

  // Check if user is involved in any active PVP game
  const myActiveGame = activeLobbies.find(
    (lobby) => publicKey && lobby.players.includes(publicKey.toString())
  );

  // Sync high score to Phaser when leaderboard loads
  useEffect(() => {
    if (soloLeaderboard && soloLeaderboard.length > 0) {
      setChopHighScore(soloLeaderboard[0].highScore);
    }
  }, [soloLeaderboard]);

  // ============================================================================
  // DERIVED STATE (computed from gameState)
  // ============================================================================
  const isIdle = gameState.mode === "idle";
  const isGameOver = gameState.mode !== "idle" && gameState.status === "gameover";
  const currentScore = gameState.mode !== "idle" ? gameState.score : 0;

  // ============================================================================
  // PHASER INITIALIZATION (only once)
  // ============================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    console.log("CHOP: Mounting Phaser game");
    container.replaceChildren();
    const { game, events, destroy } = createChopGame(container);
    gameRef.current = game;
    eventsRef.current = events;
    destroyRef.current = destroy;

    // Listen for Phaser game events
    events.on("chop:gameover", (data: { score: number }) => {
      console.log("CHOP: Game over with score", data.score);
      setGameState((prev) => {
        if (prev.mode === "idle") return prev;
        return { ...prev, status: "gameover", score: data.score };
      });
    });

    // Track chop inputs for solo mode (sent to server for anti-cheat)
    events.on("chop:input", (_data: { timestamp: number; side: string }) => {
      // This will be handled by the solo input tracker effect below
    });

    return () => {
      console.log("CHOP: Unmounting Phaser game");
      destroyRef.current?.();
      gameRef.current = null;
      eventsRef.current = null;
      destroyRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []);

  // ============================================================================
  // SOLO MODE: Track inputs for anti-cheat (batch send to server)
  // ============================================================================
  const soloInputsRef = useRef<{ t: number; s: string }[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  // Update sessionId ref when solo mode starts
  useEffect(() => {
    if (gameState.mode === "solo") {
      sessionIdRef.current = gameState.sessionId;
      soloInputsRef.current = []; // Reset inputs for new session
    } else {
      sessionIdRef.current = null;
    }
  }, [gameState]);

  // Listen for chop inputs and record them
  useEffect(() => {
    const events = eventsRef.current;
    if (!events) return;

    const handleInput = (data: { timestamp: number; side: string }) => {
      if (sessionIdRef.current) {
        soloInputsRef.current.push({ t: data.timestamp, s: data.side });

        // Send each input to server for tracking
        recordChop({
          sessionId: sessionIdRef.current,
          side: data.side,
          timestamp: data.timestamp,
        }).catch(console.error);
      }
    };

    events.on("chop:input", handleInput);
    return () => {
      events.off("chop:input", handleInput);
    };
  }, [recordChop]);

  // ============================================================================
  // SOLO MODE: Record death when game over
  // ============================================================================
  const deathRecordedRef = useRef(false);

  useEffect(() => {
    // Reset flag when not in gameover state
    if (gameState.mode === "idle" || gameState.status !== "gameover") {
      deathRecordedRef.current = false;
      return;
    }

    // Only record death once per gameover
    if (gameState.mode === "solo" && gameState.status === "gameover" && !deathRecordedRef.current) {
      deathRecordedRef.current = true;

      recordSoloDeath({
        sessionId: gameState.sessionId,
        finalScore: gameState.score,
      }).then((result) => {
        if (result) {
          setGameState((prev) => {
            if (prev.mode !== "solo") return prev;
            return {
              ...prev,
              livesRemaining: result.livesRemaining,
              continuePrice: result.continuePrice / LAMPORTS_PER_SOL,
            };
          });
        }
      });
    }
  }, [gameState, recordSoloDeath]);

  // ============================================================================
  // PVP: Auto-join when user is in an active lobby
  // ============================================================================
  useEffect(() => {
    // Only auto-start if we're idle and user is in an active game
    if (gameState.mode === "idle" && myActiveGame) {
      console.log("CHOP: Auto-starting PVP game for lobby:", myActiveGame.lobbyId);
      setGameState({
        mode: "pvp",
        status: "ready",
        score: 0,
        lobbyId: myActiveGame.lobbyId,
      });
      // Start the game
      eventsRef.current?.emit("chop:restart");
      setTimeout(() => {
        eventsRef.current?.emit("chop:start");
      }, 100);
    }
  }, [gameState.mode, myActiveGame]);

  // ============================================================================
  // GAME ACTIONS
  // ============================================================================

  const startDemo = useCallback(() => {
    console.log("CHOP: Starting demo");
    setGameState({ mode: "demo", status: "ready", score: 0 });
    eventsRef.current?.emit("chop:restart");
    setTimeout(() => {
      eventsRef.current?.emit("chop:start");
    }, 100);
  }, []);

  const startSolo = useCallback(async () => {
    if (!connected || !publicKey || !wallet) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!wallet.signAndSendTransaction) {
      toast.error("Wallet does not support transactions");
      return;
    }

    setIsStartingSolo(true);
    try {
      // Create payment transaction
      const treasuryPubkey = new PublicKey(SOLO_TREASURY);
      const lamports = Math.floor(SOLO_START_PRICE * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Serialize transaction for Privy (must be Uint8Array)
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Sign and send using Privy
      const txResult = await wallet.signAndSendTransaction({
        transaction: serializedTx,
        chain: "solana:devnet", // TODO: Change to mainnet for production
      });

      // Handle signature - could be string or Uint8Array
      let signature: string;
      if (typeof txResult.signature === "string") {
        signature = txResult.signature;
      } else if (txResult.signature instanceof Uint8Array) {
        signature = bs58.encode(txResult.signature);
      } else {
        throw new Error("Invalid signature format from wallet");
      }

      // Wait for confirmation
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Verify payment and start session
      const result = await startSoloSessionVerified({
        walletAddress: publicKey.toString(),
        paymentTxSignature: signature,
      });

      if (result.success && result.sessionId) {
        console.log("CHOP: Starting solo with session", result.sessionId);
        setGameState({
          mode: "solo",
          status: "ready",
          score: 0,
          sessionId: result.sessionId,
          livesRemaining: 10, // Start with 10 lives
          continuePrice: 0.01, // First continue costs 0.01 SOL
        });
        toast.success("Solo session started! You have 10 games.");

        eventsRef.current?.emit("chop:restart");
        setTimeout(() => {
          eventsRef.current?.emit("chop:start");
        }, 100);
      } else {
        toast.error(result.error || "Failed to verify payment");
      }
    } catch (error) {
      console.error("Failed to start solo:", error);
      toast.error("Failed to start solo session");
    } finally {
      setIsStartingSolo(false);
    }
  }, [connected, publicKey, wallet, connection, startSoloSessionVerified]);

  const continueSolo = useCallback(async () => {
    if (gameState.mode !== "solo" || !connected || !publicKey || !wallet) {
      return;
    }

    if (!wallet.signAndSendTransaction) {
      toast.error("Wallet does not support transactions");
      return;
    }

    setIsContinuing(true);
    try {
      const treasuryPubkey = new PublicKey(SOLO_TREASURY);
      const lamports = Math.floor(gameState.continuePrice * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Serialize transaction for Privy (must be Uint8Array)
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Sign and send using Privy
      const txResult = await wallet.signAndSendTransaction({
        transaction: serializedTx,
        chain: "solana:devnet", // TODO: Change to mainnet for production
      });

      // Handle signature - could be string or Uint8Array
      let signature: string;
      if (typeof txResult.signature === "string") {
        signature = txResult.signature;
      } else if (txResult.signature instanceof Uint8Array) {
        signature = bs58.encode(txResult.signature);
      } else {
        throw new Error("Invalid signature format from wallet");
      }

      // Wait for confirmation
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const result = await continueSoloSessionVerified({
        sessionId: gameState.sessionId,
        paymentTxSignature: signature,
        expectedPrice: lamports,
      });

      if (result.success) {
        const continueFromScore = gameState.score;
        console.log("CHOP: Continue from score", continueFromScore, "next price:", result.nextContinuePrice);
        setGameState((prev) => {
          if (prev.mode !== "solo") return prev;
          // Continue from current score, get 10 more games, update price for next continue
          const nextPrice = result.nextContinuePrice ? result.nextContinuePrice / LAMPORTS_PER_SOL : prev.continuePrice * 2;
          return { ...prev, status: "playing", livesRemaining: 10, continuePrice: nextPrice };
        });
        toast.success(`Continuing from score ${continueFromScore}! +10 games`);
        // Tell game to continue from current score (not restart)
        eventsRef.current?.emit("chop:continue", { score: continueFromScore });
      } else {
        toast.error(result.error || "Failed to verify payment");
      }
    } catch (error) {
      console.error("Failed to continue:", error);
      toast.error("Failed to continue");
    } finally {
      setIsContinuing(false);
    }
  }, [gameState, connected, publicKey, wallet, connection, continueSoloSessionVerified]);

  // Keep endSoloSession mutation available for potential future use
  void endSoloSession;

  const backToMenu = useCallback(() => {
    setGameState(initialState);
    eventsRef.current?.emit("chop:restart");
  }, []);

  // ============================================================================
  // LOBBY ACTIONS
  // ============================================================================

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
    } catch {
      toast.error("Failed to create lobby");
    } finally {
      setIsCreating(false);
    }
  }, [connected, publicKey, betAmount, createLobbyInDb]);

  const handleJoinLobby = useCallback(
    async (lobbyId: number) => {
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
      } catch {
        toast.error("Failed to join lobby");
      } finally {
        setJoiningLobbyId(null);
      }
    },
    [connected, publicKey, joinLobbyInDb]
  );

  // ============================================================================
  // HELPERS
  // ============================================================================

  const truncateWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  // Format time remaining for jackpot countdown
  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return "Ended";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getLeaderboardPosition = (
    score: number
  ): { position: number; total: number; wouldBeatTop: boolean } => {
    if (!soloLeaderboard || soloLeaderboard.length === 0) {
      return { position: 1, total: 0, wouldBeatTop: true };
    }

    let position = 1;
    for (const entry of soloLeaderboard) {
      if (score > entry.highScore) break;
      position++;
    }

    return {
      position,
      total: soloLeaderboard.length,
      wouldBeatTop:
        position === 1 && soloLeaderboard.length > 0 && score > soloLeaderboard[0].highScore,
    };
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="relative z-10">
        <Header />
      </div>

      {/* Main content */}
      <div className="fixed top-16 left-0 right-0 bottom-0 flex">
        {/* Empty spacer for balance */}
        <div className="hidden lg:block w-[320px] shrink-0" />

        {/* Game Container - Centered */}
        <div className="flex-1 flex items-center justify-center relative">
          <div
            ref={containerRef}
            className="w-full h-full max-w-150 [image-rendering:pixelated] [&>canvas]:[image-rendering:pixelated]"
            data-testid="chop-container"
          />

          {/* ============================================================ */}
          {/* IDLE STATE - Show menu */}
          {/* ============================================================ */}
          {isIdle && (
            <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
              <div className="bg-gray-900/95 border border-gray-700 rounded-2xl p-6 shadow-2xl pointer-events-auto max-w-md w-full mx-4">
                {!connected ? (
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => toast.info("Please connect wallet in header")}
                      className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-lg"
                    >
                      Sign in
                    </button>
                    <span className="text-gray-500">or</span>
                    <button
                      onClick={startDemo}
                      className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl text-lg border border-gray-600"
                    >
                      Play Demo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={startDemo}
                      className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl text-lg border border-gray-600"
                    >
                      Play Demo (Free)
                    </button>
                    <button
                      onClick={startSolo}
                      disabled={isStartingSolo}
                      className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-lg disabled:opacity-50"
                    >
                      {isStartingSolo ? "Starting..." : `Solo Mode (${SOLO_START_PRICE} SOL)`}
                    </button>
                    <p className="text-center text-purple-300 text-xs font-light">
                      10 games per session. Pay to continue and climb the leaderboard!
                    </p>
                  </div>
                )}
                <p className="text-center text-gray-500 text-sm mt-4">
                  Tap LEFT or RIGHT to chop. Avoid branches!
                </p>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SOLO MODE HUD - Show games remaining during play */}
          {/* ============================================================ */}
          {gameState.mode === "solo" && !isGameOver && (
            <div className="absolute top-4 right-4 bg-purple-900/80 border border-purple-500/50 rounded-lg px-3 py-2 pointer-events-none">
              <p className="text-purple-200 text-xs">
                Games: <span className="font-bold text-white">{gameState.livesRemaining}/10</span>
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* GAME OVER - Demo Mode */}
          {/* ============================================================ */}
          {isGameOver && gameState.mode === "demo" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-gray-900/95 border border-gray-700 rounded-2xl p-6 shadow-2xl pointer-events-auto max-w-sm w-full mx-4">
                <h2 className="text-2xl font-bold text-center text-red-500 mb-2">GAME OVER</h2>
                <p className="text-4xl font-bold text-center text-white mb-2">
                  Score: {currentScore}
                </p>

                {/* Leaderboard position */}
                {(() => {
                  const rank = getLeaderboardPosition(currentScore);
                  return (
                    <div className="text-center mb-4">
                      {rank.wouldBeatTop ? (
                        <p className="text-yellow-400 text-sm font-semibold">
                          🏆 New #1! (not recorded in demo)
                        </p>
                      ) : rank.total === 0 ? (
                        <p className="text-gray-400 text-sm">No scores yet - be the first!</p>
                      ) : (
                        <p className="text-gray-400 text-sm">
                          Would rank{" "}
                          <span className="text-purple-400 font-semibold">#{rank.position}</span> of{" "}
                          {rank.total}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-3">
                  <button
                    onClick={startDemo}
                    className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg"
                  >
                    Play Again
                  </button>

                  {connected && (
                    <button
                      onClick={startSolo}
                      disabled={isStartingSolo}
                      className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-lg disabled:opacity-50"
                    >
                      {isStartingSolo ? "Starting..." : `Solo Mode (${SOLO_START_PRICE} SOL)`}
                    </button>
                  )}

                  <button
                    onClick={backToMenu}
                    className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl text-lg border border-gray-600"
                  >
                    Back to Menu
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* GAME OVER - Solo Mode */}
          {/* ============================================================ */}
          {isGameOver && gameState.mode === "solo" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-gray-900/95 border border-purple-700 rounded-2xl p-4 shadow-2xl pointer-events-auto max-w-sm w-full mx-4">
                <h2 className="text-lg font-bold text-center text-red-500 mb-1">GAME OVER</h2>
                <p className="text-2xl font-bold text-center text-white mb-1">
                  Score: {currentScore}
                </p>

                {/* Leaderboard position */}
                {(() => {
                  const rank = getLeaderboardPosition(currentScore);
                  return (
                    <div className="text-center mb-4">
                      {rank.wouldBeatTop ? (
                        <p className="text-yellow-400 text-sm font-semibold">
                          🏆 New #1 High Score!
                        </p>
                      ) : rank.total === 0 ? (
                        <p className="text-purple-400 text-sm font-semibold">
                          🎉 First on the leaderboard!
                        </p>
                      ) : (
                        <p className="text-purple-400 text-sm">
                          Rank: <span className="font-semibold">#{rank.position}</span> of{" "}
                          {rank.total}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  {/* Show games remaining in session */}
                  <p className="text-center text-purple-300 text-xs">
                    Games remaining: <span className="font-bold text-white">{gameState.livesRemaining ?? 0}/10</span>
                  </p>

                  {/* Option 1: Continue from current score (always available, costs SOL) */}
                  <button
                    onClick={continueSolo}
                    disabled={isContinuing}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm disabled:opacity-50"
                  >
                    {isContinuing
                      ? "Processing..."
                      : `Continue (${gameState.continuePrice.toFixed(3)} SOL)`}
                  </button>
                  <p className="text-center text-purple-400/70 text-[10px]">
                    Continue from score {currentScore} + 10 more games
                  </p>

                  {/* Option 2: New Game (if games remaining) */}
                  {(gameState.livesRemaining ?? 0) > 0 && (
                    <button
                      onClick={() => {
                        setGameState((prev) => {
                          if (prev.mode !== "solo") return prev;
                          return { ...prev, status: "ready", score: 0 };
                        });
                        eventsRef.current?.emit("chop:restart");
                        setTimeout(() => eventsRef.current?.emit("chop:start"), 100);
                      }}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm"
                    >
                      New Game ({gameState.livesRemaining} games left)
                    </button>
                  )}

                  {/* Option 3: Play Demo (keep session for later) */}
                  <button
                    onClick={() => {
                      toast.info("Session saved! You can resume later.");
                      setGameState({ mode: "demo", status: "ready", score: 0 });
                      eventsRef.current?.emit("chop:restart");
                    }}
                    className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-xl text-sm border border-gray-500"
                  >
                    Play Demo (Free)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Right */}
        <div className="hidden lg:flex w-[320px] shrink-0 flex-col p-4 gap-4 overflow-y-auto">
          {/* Weekly Jackpot */}
          {currentJackpot && (
            <div className="bg-gradient-to-br from-yellow-900/50 to-orange-900/50 border border-yellow-500/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-yellow-200">Weekly Jackpot</h3>
                <span className="text-xs text-yellow-400/80">{currentJackpot.weekId}</span>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-300">
                  {(currentJackpot.totalPool / LAMPORTS_PER_SOL).toFixed(2)}
                  <span className="text-lg ml-1">SOL</span>
                </p>
                <p className="text-xs text-yellow-400/70 mt-1">
                  {currentJackpot.totalSessions} sessions · {currentJackpot.totalContinues} continues
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-yellow-500/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-yellow-400/80">Ends in:</span>
                  <span className="text-yellow-200 font-mono font-bold">
                    {formatTimeRemaining(currentJackpot.timeRemaining)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-yellow-400/60 text-center mt-2">
                Top scores win! Manual validation.
              </p>
            </div>
          )}

          {/* Solo Leaderboard */}
          <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-purple-200 mb-3">Solo Leaderboard</h3>
            <div className="space-y-1">
              {soloLeaderboard && soloLeaderboard.length > 0 ? (
                soloLeaderboard.slice(0, 5).map((entry, index) => (
                  <div key={entry._id} className="flex items-center justify-between text-sm">
                    <span className="text-purple-300">
                      #{index + 1} {truncateWallet(entry.walletAddress)}
                    </span>
                    <span className="text-purple-100 font-bold">{entry.highScore}</span>
                  </div>
                ))
              ) : (
                <p className="text-purple-400/50 text-xs text-center py-2">No scores yet</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4">
            {connected && (
              <>
                <p className="text-xs text-gray-400 mb-2">Create PVP Game</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    min="0.001"
                    step="0.001"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
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
              </>
            )}
          </div>

          {/* Active Games (in progress) */}
          {activeLobbies.length > 0 && (
            <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-4">
              <h3 className="text-sm font-bold text-orange-200 mb-3">Live Games</h3>
              <div className="space-y-2">
                {activeLobbies.map((lobby) => {
                  const isMyGame = publicKey && lobby.players.includes(publicKey.toString());
                  const player1 = lobby.players[0];
                  const player2 = lobby.players[1];

                  return (
                    <div
                      key={lobby._id}
                      className="bg-gray-800/50 border border-orange-700/30 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-white font-medium">
                              {truncateWallet(player1)}
                            </span>
                            <span className="text-orange-400">vs</span>
                            <span className="text-white font-medium">
                              {truncateWallet(player2)}
                            </span>
                          </div>
                          <p className="text-orange-400 text-xs mt-1">In progress...</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-green-400 text-sm font-bold">
                            {((lobby.betAmount * 2) / 1e9).toFixed(3)}
                          </span>
                          <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                        </div>
                      </div>
                      {isMyGame ? (
                        <p className="text-center text-xs text-orange-300 font-semibold">
                          Your game - Playing!
                        </p>
                      ) : (
                        <button
                          onClick={() => toast.info("Spectator mode coming soon!")}
                          className="w-full px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg text-sm"
                        >
                          Watch
                        </button>
                      )}
                    </div>
                  );
                })}
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
                    {isOwnLobby && <p className="text-center text-xs text-gray-500">Your lobby</p>}
                  </div>
                );
              })}
              {openLobbies.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">No open games</p>
              )}
            </div>
          </div>

          {/* Solo Leaderboard */}
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-200 mb-3">🏆 Solo Leaderboard</h3>
            <div className="space-y-2">
              {soloLeaderboard && soloLeaderboard.length > 0 ? (
                soloLeaderboard.slice(0, 10).map((entry, index) => (
                  <div
                    key={entry._id}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                      index === 0
                        ? "bg-yellow-500/20 border border-yellow-500/30"
                        : index === 1
                        ? "bg-gray-400/20 border border-gray-400/30"
                        : index === 2
                        ? "bg-orange-600/20 border border-orange-600/30"
                        : "bg-gray-800/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold w-6 ${
                          index === 0
                            ? "text-yellow-400"
                            : index === 1
                            ? "text-gray-300"
                            : index === 2
                            ? "text-orange-400"
                            : "text-gray-500"
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <span className="text-white text-sm">
                        {truncateWallet(entry.walletAddress)}
                      </span>
                    </div>
                    <span className="text-green-400 font-bold text-sm">
                      {entry.highScore}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No scores yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
