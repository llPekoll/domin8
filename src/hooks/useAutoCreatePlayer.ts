import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { logger } from "../lib/logger";
import { generateRandomName } from "../lib/nameGenerator";
import { useReferralTracking } from "./useReferralTracking";

/**
 * Hook that automatically creates a player when:
 * 1. Wallet is connected
 * 2. Player doesn't exist
 *
 * This replaces the PlayerOnboarding component with automatic player creation
 * Also tracks referrals if user signed up via referral link
 */
export function useAutoCreatePlayer(
  connected: boolean,
  publicKey: string | null,
  externalWalletAddress?: string
) {
  const { socket } = useSocket();

  // Player data fetched via socket
  const [playerData, setPlayerData] = useState<any>(undefined);

  // Referral tracking
  const { trackReferral, hasReferralCode } = useReferralTracking();

  // Track which wallets we've already processed to avoid duplicates
  const processedWalletsRef = useRef<Set<string>>(new Set());

  // Fetch player data when wallet connects
  useEffect(() => {
    if (!socket || !connected || !publicKey) {
      setPlayerData(undefined);
      return;
    }

    socketRequest(socket, "get-player-with-character", { walletAddress: publicKey }).then(
      (res) => {
        if (res.success) {
          setPlayerData(res.data ?? null);
        } else {
          setPlayerData(null);
        }
      }
    );
  }, [socket, connected, publicKey]);

  // Create player mutation via socket
  const createPlayerMutation = useCallback(
    async (args: {
      walletAddress: string;
      displayName: string;
      externalWalletAddress?: string;
    }) => {
      if (!socket) return;
      const res = await socketRequest(socket, "create-player", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

  // Auto-create player when wallet connects and player doesn't exist
  useEffect(() => {
    if (!connected || !publicKey || playerData === undefined) {
      return;
    }

    // Prevent duplicate processing for the same wallet
    if (processedWalletsRef.current.has(publicKey)) {
      return;
    }

    // Player exists, no need to create
    if (playerData !== null) {
      // But check if we need to track a referral for this existing player
      const checkReferral = async () => {
        if (hasReferralCode) {
          logger.ui.info("Existing player detected, attempting to track referral...");
          const success = await trackReferral(publicKey);
          if (success) {
            logger.ui.info("Referral tracked for existing player!");
          } else {
            logger.ui.warn("Could not track referral (may already be referred)");
          }
        }
      };
      processedWalletsRef.current.add(publicKey);
      void checkReferral();
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
          externalWalletAddress || "none (email/social login)",
          "has referral code:",
          hasReferralCode
        );

        processedWalletsRef.current.add(publicKey);

        await createPlayerMutation({
          walletAddress: publicKey,
          displayName: randomName,
          externalWalletAddress: externalWalletAddress || undefined,
        });

        logger.ui.info(
          `Player auto-created! Display name: ${randomName}`
        );

        // Track referral if user signed up via referral link
        if (hasReferralCode) {
          logger.ui.info("Tracking referral for new player...");
          const success = await trackReferral(publicKey);
          if (success) {
            logger.ui.info("Referral tracked successfully!");
          } else {
            logger.ui.error("Failed to track referral!");
          }
        }
      } catch (error) {
        logger.ui.error("Failed to auto-create player:", error);
      }
    };

    void autoCreatePlayer();
  }, [connected, publicKey, playerData, externalWalletAddress, createPlayerMutation, hasReferralCode, trackReferral]);
}
