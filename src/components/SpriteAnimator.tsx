import { useState, useEffect, useRef, useCallback } from "react";

interface SpriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

interface FrameTag {
  name: string;
  from: number;
  to: number;
}

interface SpriteMetadata {
  frames: SpriteFrame[];
  meta: {
    size: { w: number; h: number };
    frameTags: FrameTag[];
  };
}

// Cache for loaded sprite metadata
const metadataCache: Record<string, SpriteMetadata | null> = {};

interface SpriteAnimatorProps {
  /** Asset path from character data (e.g., "/characters/orc.png") */
  assetPath: string;
  /** Animation name, defaults to "idle" */
  animation?: string;
  /** Container size in pixels */
  size?: number;
  /** Sprite scale multiplier */
  scale?: number;
  /** Additional Y offset for positioning */
  offsetY?: number;
  /** Additional CSS classes */
  className?: string;
}

export function SpriteAnimator({
  assetPath,
  animation = "idle",
  size = 56,
  scale = 2,
  offsetY = 0,
  className = "",
}: SpriteAnimatorProps) {
  const [metadata, setMetadata] = useState<SpriteMetadata | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameIndexRef = useRef<number>(0);

  // Derive paths from assetPath (e.g., "/characters/orc.png" -> "/assets/characters/orc.png")
  const pngPath = assetPath ? `/assets${assetPath}` : "";
  const jsonPath = assetPath ? `/assets${assetPath.replace(".png", ".json")}` : "";
  const cacheKey = assetPath || "";

  // Load metadata
  useEffect(() => {
    if (!assetPath) return;

    let cancelled = false;

    const loadMetadata = async () => {
      if (metadataCache[cacheKey] !== undefined) {
        if (!cancelled) setMetadata(metadataCache[cacheKey]);
        return;
      }

      try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
          metadataCache[cacheKey] = null;
          return;
        }
        const data: SpriteMetadata = await response.json();
        metadataCache[cacheKey] = data;
        if (!cancelled) setMetadata(data);
      } catch {
        metadataCache[cacheKey] = null;
      }
    };

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, jsonPath]);

  // Get animation frame range
  const frameTag = metadata?.meta?.frameTags?.find(
    (tag) => tag.name.toLowerCase() === animation.toLowerCase()
  );
  const startFrame = frameTag?.from ?? 0;
  const endFrame = frameTag?.to ?? (metadata?.frames?.length ? metadata.frames.length - 1 : 0);

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!metadata?.frames) return;

      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const currentFrame = metadata.frames[frameIndexRef.current];
      const frameDuration = currentFrame?.duration || 150;

      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        const nextFrame = frameIndexRef.current + 1;
        frameIndexRef.current = nextFrame > endFrame ? startFrame : nextFrame;
        setCurrentFrameIndex(frameIndexRef.current);
        lastFrameTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    },
    [metadata, startFrame, endFrame]
  );

  // Start animation
  useEffect(() => {
    if (!metadata?.frames || metadata.frames.length === 0) return;

    // Reset to start frame
    frameIndexRef.current = startFrame;
    setCurrentFrameIndex(startFrame);
    lastFrameTimeRef.current = 0;

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [metadata, startFrame, animate]);

  // Show loading spinner while loading, or empty if no assetPath
  if (!assetPath || !metadata?.frames) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        {assetPath && (
          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  const frame = metadata.frames[currentFrameIndex];
  if (!frame?.frame) return null;

  const { x, y, w, h } = frame.frame;
  const { w: sheetW, h: sheetH } = metadata.meta.size;

  // Scale the sprite
  const scaledW = w * scale;
  const scaledH = h * scale;
  const scaledSheetW = sheetW * scale;
  const scaledSheetH = sheetH * scale;
  const scaledX = x * scale;
  const scaledY = y * scale;

  return (
    <div
      className={`flex items-end justify-center overflow-visible ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        style={{
          width: scaledW,
          height: scaledH,
          backgroundImage: `url(${pngPath})`,
          backgroundPosition: `-${scaledX}px -${scaledY}px`,
          backgroundSize: `${scaledSheetW}px ${scaledSheetH}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
          transform: offsetY !== 0 ? `translateY(${offsetY}px)` : undefined,
        }}
      />
    </div>
  );
}
