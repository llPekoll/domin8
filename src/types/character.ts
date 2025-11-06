import type { Id } from "../../convex/_generated/dataModel";

/**
 * Shared Character type that matches the Convex database schema
 * Includes _creationTime which Convex automatically adds to all documents
 */
export interface Character {
  _id: Id<"characters">;
  _creationTime: number; // Convex automatically adds this
  id: number; // Blockchain ID
  name: string;
  assetPath: string;
  isActive: boolean;
  description?: string;
  nftCollection?: string;
  nftCollectionName?: string;
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
