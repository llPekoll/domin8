import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { createFlappyGame } from "../phaser/createGame";
import { FlappyHUD } from "./FlappyHUD";

type GameState = "playing" | "gameover";

export function FlappyPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const eventsRef = useRef<Phaser.Events.EventEmitter | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);
  const [score, setScore] = useState(0);
  const [state, setState] = useState<GameState>("playing");
  const [lastRun, setLastRun] = useState<{ score: number; durationMs: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    console.log("FLAPPY MOUNT", container);
    container.replaceChildren();
    const { game, events, destroy } = createFlappyGame(container);
    gameRef.current = game;
    eventsRef.current = events;
    destroyRef.current = destroy;

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
      console.log("FLAPPY UNMOUNT");
      events.off("flappy:score", handleScore);
      events.off("flappy:state", handleState);
      events.off("flappy:gameover", handleGameOver);
      events.off("run:completed", handleRunCompleted);
      destroyRef.current?.();
      gameRef.current = null;
      eventsRef.current = null;
      destroyRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []);

  const handleRestart = () => {
    const events = eventsRef.current;
    if (!events) return;
    events.emit("flappy:restart");
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#050816] text-white">
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full" data-testid="flappy-container" />
        <FlappyHUD
          score={score}
          status={state}
          onRestart={handleRestart}
          connected={false}
          walletLabel={null}
          lastRun={lastRun}
        />
      </div>
    </div>
  );
}
