/**
 * Shared Character type that matches the database schema
 * Includes _creationTime which is automatically added to all documents
 */
export interface Character {
  _id: string;
  _creationTime: number;
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
