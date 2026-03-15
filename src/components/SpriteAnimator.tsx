import { useState, useEffect, useRef, useCallback } from "react";

interface SpriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
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

// Cache for loaded sprite metadata and images
const metadataCache: Record<string, SpriteMetadata | null> = {};
const imageCache: Record<string, HTMLImageElement> = {};

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
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const frameIndexRef = useRef<number>(0);

  // Derive paths from assetPath
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
  }, [cacheKey, jsonPath, assetPath]);

  // Load spritesheet image
  useEffect(() => {
    if (!pngPath) return;

    if (imageCache[cacheKey]) {
      setImage(imageCache[cacheKey]);
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageCache[cacheKey] = img;
      setImage(img);
    };
    img.src = pngPath;
  }, [pngPath, cacheKey]);

  // Get animation frame range
  const frameTag = metadata?.meta?.frameTags?.find(
    (tag) => tag.name.toLowerCase() === animation.toLowerCase()
  );
  const startFrame = frameTag?.from ?? 0;
  const endFrame = frameTag?.to ?? (metadata?.frames?.length ? metadata.frames.length - 1 : 0);

  // Draw a frame onto the canvas — same approach as Phaser:
  // Fixed canvas size = sourceSize, trimmed frame placed at spriteSourceSize offset
  const drawFrame = useCallback(
    (frameIndex: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !metadata?.frames || !image) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const frame = metadata.frames[frameIndex];
      if (!frame) return;

      // sourceSize = the original untrimmed canvas (e.g., 64x60) — FIXED, never changes
      const { w: srcW, h: srcH } = frame.sourceSize;

      // Set canvas to scaled sourceSize
      canvas.width = srcW * scale;
      canvas.height = srcH * scale;

      // Disable smoothing for crisp pixel art (like Phaser's NEAREST filter)
      ctx.imageSmoothingEnabled = false;

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // frame = where the trimmed pixels are in the spritesheet PNG
      const { x: sheetX, y: sheetY, w: frameW, h: frameH } = frame.frame;

      // spriteSourceSize = where to place the trimmed pixels within the sourceSize canvas
      const { x: destX, y: destY } = frame.spriteSourceSize;

      // Draw trimmed frame at the correct offset within the fixed canvas
      ctx.drawImage(
        image,
        sheetX, sheetY, frameW, frameH,           // source rect from spritesheet
        destX * scale, destY * scale,              // destination offset (spriteSourceSize)
        frameW * scale, frameH * scale             // destination size
      );
    },
    [metadata, image, scale]
  );

  // Animation loop
  useEffect(() => {
    if (!metadata?.frames || metadata.frames.length === 0 || !image) return;

    // Reset to start frame
    frameIndexRef.current = startFrame;
    lastFrameTimeRef.current = 0;
    drawFrame(startFrame);

    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      const currentFrame = metadata.frames[frameIndexRef.current];
      const frameDuration = currentFrame?.duration || 150;

      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        const nextFrame = frameIndexRef.current + 1;
        frameIndexRef.current = nextFrame > endFrame ? startFrame : nextFrame;
        drawFrame(frameIndexRef.current);
        lastFrameTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [metadata, image, startFrame, endFrame, drawFrame]);

  // Show loading spinner while loading
  if (!assetPath || !metadata?.frames || !image) {
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

  // Get sourceSize for the canvas dimensions
  const firstFrame = metadata.frames[0];
  const canvasW = firstFrame.sourceSize.w * scale;
  const canvasH = firstFrame.sourceSize.h * scale;

  return (
    <div
      className={`flex items-end justify-center overflow-visible ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        style={{
          width: canvasW,
          height: canvasH,
          imageRendering: "pixelated",
          transform: offsetY !== 0 ? `translateY(${offsetY}px)` : undefined,
        }}
      />
    </div>
  );
}
