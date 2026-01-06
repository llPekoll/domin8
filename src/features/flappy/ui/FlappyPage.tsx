import Phaser from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createFlappyGame } from "../phaser/createGame";
import { FlappyHUD } from "./FlappyHUD";
import { usePrivyWallet } from "../../../hooks/usePrivyWallet";

type GameState = "playing" | "gameover";

export function FlappyPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const eventsRef = useRef<Phaser.Events.EventEmitter | null>(null);
  const [score, setScore] = useState(0);
  const [state, setState] = useState<GameState>("playing");
  const [lastRun, setLastRun] = useState<{ score: number; durationMs: number } | null>(null);
  const { login, ready: privyReady } = usePrivy();
  const { connected, walletAddress } = usePrivyWallet();

  const walletLabel = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    container.replaceChildren();
    const { game, events } = createFlappyGame(container);
    gameRef.current = game;
    eventsRef.current = events;

    const handleScore = (value: number) => setScore(value);
    const handleState = (payload: { state: GameState; score: number }) => {
      setState(payload.state);
      setScore(payload.score);
    };
    const handleGameOver = (payload: { score: number }) => {
      setState("gameover");
      setScore(payload.score);
    };
    const handleRunCompleted = (payload: { score: number; durationMs: number }) => {
      setLastRun(payload);
    };

    events.on("flappy:score", handleScore);
    events.on("flappy:state", handleState);
    events.on("flappy:gameover", handleGameOver);
    events.on("run:completed", handleRunCompleted);

    return () => {
      const containerEl = containerRef.current;
      events.off("flappy:score", handleScore);
      events.off("flappy:state", handleState);
      events.off("flappy:gameover", handleGameOver);
      events.off("run:completed", handleRunCompleted);
      events.removeAllListeners();
      game.destroy(true);
      gameRef.current = null;
      eventsRef.current = null;
      containerEl?.replaceChildren();
    };
  }, []);

  const handleRestart = () => {
    const events = eventsRef.current;
    if (!events) return;
    events.emit("flappy:restart");
  };

  const handleConnect = () => {
    if (!privyReady || !login) return;
    void login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-black text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 py-12">
        <div className="text-center space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-sky-300/90">Domin8 Mini</p>
          <h1 className="text-3xl font-semibold text-white drop-shadow-[0_10px_25px_rgba(56,189,248,0.35)]">
            Flappy Rook
          </h1>
          <p className="text-sm text-slate-300">Thread the neon pylons. Space / Tap to fly.</p>
        </div>

        <div className="relative w-full max-w-3xl">
          <div className="absolute inset-6 -z-10 rounded-[36px] bg-gradient-to-r from-sky-500/25 via-fuchsia-500/20 to-amber-400/20 blur-3xl" />
          <div className="absolute inset-2 -z-10 rounded-[32px] border border-sky-500/25 shadow-[0_0_25px_rgba(14,165,233,0.35)]" />

          <div className="relative mx-auto flex max-w-xl overflow-hidden rounded-[28px] border border-sky-900/60 bg-slate-950/70 shadow-[0_24px_70px_rgba(56,189,248,0.22)]">
            <div className="pointer-events-none absolute inset-0 border border-sky-500/20 mix-blend-screen" />
            <div className="pointer-events-none absolute -left-10 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-6 bottom-6 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl" />

            <div ref={containerRef} className="aspect-[2/3] w-full" data-testid="flappy-container" />
            <FlappyHUD
              score={score}
              status={state}
              onRestart={handleRestart}
              onConnect={handleConnect}
              connected={connected}
              walletLabel={walletLabel}
              lastRun={lastRun}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
