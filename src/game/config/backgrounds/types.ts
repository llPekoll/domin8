/**
 * Background Configuration Types
 */

export interface BackgroundAnimation {
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  frameRate: number;
}

export interface BackgroundClickable {
  enabled: boolean;
  action: "url" | "custom" | "none";
  url?: string;
  onClickHandler?: (scene: Phaser.Scene) => void;
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
}
