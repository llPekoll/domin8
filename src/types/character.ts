import type { Id } from "../../convex/_generated/dataModel";

/**
 * Character type - "free" | "lootbox" | "nft"
 */
export type CharacterType = "free" | "lootbox" | "nft";

/**
 * Character rarity for lootbox weighting and UI effects
 */
export type CharacterRarity = "common" | "rare" | "legendary";

/**
 * Asset version for animation format handling
 * - v1: Old format (multiple animations in single spritesheet)
 * - v2: New 3-animation format (Idle, Move, land)
 */
export type AssetVersion = "v1" | "v2";

/**
 * Evolution lines for free characters
 */
export type EvolutionLine = "elf" | "priest" | "pumpkin" | "skeleton" | "zombie";

/**
 * Shared Character type that matches the Convex database schema
 * Includes _creationTime which Convex automatically adds to all documents
 */
export interface Character {
  _id: Id<"characters">;
  _creationTime: number; // Convex automatically adds this
  id: number; // Blockchain ID
  name: string;
  displayName?: string; // UI name: "Elf Warrior"
  assetPath?: string;
  isActive: boolean;
  description?: string;

  // Character acquisition type
  characterType?: CharacterType;

  // Evolution system (only for free evolution characters)
  evolutionLine?: EvolutionLine;
  evolutionLevel?: number; // 0, 1, 2
  winsRequired?: number; // 0, 20, 50

  // NFT-gated
  nftCollection?: string;
  nftCollectionName?: string;

  // Rarity (for lootbox weighting and UI effects)
  rarity?: CharacterRarity;

  // Asset version (for animation format handling)
  assetVersion?: AssetVersion;

  // Legacy animations (v1 format)
  animations?: {
    idle: {
      start: number;
      end: number;
      frameRate: number;
    };
    walk: {
      start: number;
      end: number;
      frameRate: number;
    };
  };
}
