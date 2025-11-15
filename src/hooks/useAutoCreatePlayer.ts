import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "../lib/logger";
import { generateRandomName } from "../lib/nameGenerator";

/**
 * Hook that automatically creates a player when:
 * 1. Wallet is connected
 * 2. Player doesn't exist
 * 
 * This replaces the PlayerOnboarding component with automatic player creation
 */
export function useAutoCreatePlayer(
  connected: boolean,
  publicKey: string | null,
  externalWalletAddress?: string
) {
  // Get player data
  const playerData = useQuery(
    api.players.getPlayerWithCharacter,
    connected && publicKey ? { walletAddress: publicKey } : "skip"
  );

  // Create player mutation
  const createPlayerMutation = useMutation(api.players.createPlayer);

  // Auto-create player when wallet connects and player doesn't exist
  useEffect(() => {
    if (!connected || !publicKey || playerData === undefined) {
      return;
    }

    // Player exists, no need to create
    if (playerData !== null) {
      return;
    }

    // Player doesn't exist, create one
    const autoCreatePlayer = async () => {
      try {
        const randomName = generateRandomName();
        
        logger.ui.debug(
          "Auto-creating player for wallet:",
          publicKey,
          "with name:",
          randomName,
          "external wallet:",
          externalWalletAddress || "none (email/social login)"
        );

        await createPlayerMutation({
          walletAddress: publicKey,
          displayName: randomName,
          externalWalletAddress: externalWalletAddress || undefined,
        });

        logger.ui.info(
          `Player auto-created! Display name: ${randomName}`
        );
      } catch (error) {
        logger.ui.error("Failed to auto-create player:", error);
      }
    };

    void autoCreatePlayer();
  }, [connected, publicKey, playerData, externalWalletAddress, createPlayerMutation]);
}
