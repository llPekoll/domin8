/**
 * Background Configuration Types
 */

export interface BackgroundAnimation {
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  frameRate: number;
  repeat?: number; // -1 for loop, 0 for play once, or specific count
}

export interface BackgroundClickable {
  enabled: boolean;
  action: "url" | "custom" | "none";
  url?: string;
  onClickHandler?: (scene: Phaser.Scene) => void;
}

export interface OverlayAnimation {
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  frameRate: number;
  repeat?: number; // -1 for loop, 0 for play once
}

export interface OverlayConfig {
  textureKey: string; // Key used in Phaser (for loading)
  assetPath: string; // Path to asset file
  animations: {
    idle: OverlayAnimation;
    click?: OverlayAnimation; // Optional click animation
  };
  clickable?: boolean; // Whether the overlay is clickable
  depth?: number; // Z-index (default: 1, above background)
  flipX?: boolean; // Mirror horizontally
}

export interface BackgroundConfig {
  id: number;
  name: string;
  textureKey: string; // Key used in Phaser (for loading)
  assetPath: string; // Path to asset file
  type: "static" | "animated"; // Static image or animated sprite
  animations?: {
    idle: BackgroundAnimation;
  };
  clickable?: BackgroundClickable;
  overlays?: OverlayConfig[]; // Optional overlays (e.g., animated cat)
}
