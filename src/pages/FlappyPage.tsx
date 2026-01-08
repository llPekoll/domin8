import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { Header } from "../components/Header";
import { createFlappyGame } from "~/game/flappy/flappyGame";

export function FlappyPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    console.log("FLAPPY MOUNT", container);
    container.replaceChildren();
    const { game, destroy } = createFlappyGame(container);
    gameRef.current = game;
    destroyRef.current = destroy;

    return () => {
      console.log("FLAPPY UNMOUNT");
      destroyRef.current?.();
      gameRef.current = null;
      destroyRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden ">
      {/* Phaser Game - fills viewport like main game */}
      <div className="fixed inset-0 w-full h-full z-0">
        <div ref={containerRef} className="w-full h-full" data-testid="flappy-container" />
      </div>

      {/* Header overlay - positioned above game */}
      <div className="relative z-10">
        <Header />
      </div>
    </div>
  );
}
