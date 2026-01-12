import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { Header } from "../components/Header";
import { ChatPanel } from "../components/ChatPanel";
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Header overlay - positioned above game */}
      <div className="relative z-10">
        <Header />
      </div>

      {/* Main content area with chat sidebar */}
      <div className="fixed top-16 left-0 right-0 bottom-0 flex">
        {/* Chat Sidebar - Left (hidden on small screens) */}
        <div className="hidden lg:block w-[320px] flex-shrink-0 p-4">
          <ChatPanel embedded />
        </div>

        {/* Game Container - Centered */}
        <div className="flex-1 flex items-center justify-center">
          <div
            ref={containerRef}
            className="w-full h-full max-w-[600px] [image-rendering:pixelated] [&>canvas]:[image-rendering:pixelated]"
            data-testid="flappy-container"
          />
        </div>

        {/* Empty spacer for balance on large screens */}
        <div className="hidden lg:block w-[320px] flex-shrink-0" />
      </div>
    </div>
  );
}
