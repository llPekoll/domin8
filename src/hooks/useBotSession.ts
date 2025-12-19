/**
 * React Hook for Bot Session Signer Management
 *
 * Handles adding and removing Privy session signers for automated bot operations.
 * Session signers allow the backend to sign transactions on behalf of the user.
 */

import { useCallback, useState } from "react";
import { useSessionSigners } from "@privy-io/react-auth";
import { usePrivyWallet } from "./usePrivyWallet";
import { useBotSettings } from "./useBotSettings";
import { toast } from "sonner";
import { logger } from "../lib/logger";

// Bot signer ID from Privy Dashboard (set in env)
const BOT_SIGNER_ID = import.meta.env.VITE_PRIVY_BOT_SIGNER_ID;

export function useBotSession() {
  const { connected, walletAddress } = usePrivyWallet();
  const { sessionSignerEnabled, updateSessionSigner } = useBotSettings();
  const { addSessionSigners, removeSessionSigners } = useSessionSigners();

  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  /**
   * Enable bot session signer
   * This allows the backend to sign transactions on behalf of the user
   */
  const enableBotSession = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!connected || !walletAddress) {
      return { success: false, error: "Wallet not connected" };
    }

    if (!BOT_SIGNER_ID) {
      logger.ui.error("[useBotSession] BOT_SIGNER_ID not configured");
      return { success: false, error: "Bot signer not configured. Contact support." };
    }

    if (sessionSignerEnabled) {
      return { success: true }; // Already enabled
    }

    setIsEnabling(true);

    try {
      logger.ui.debug(`[useBotSession] Adding session signer for ${walletAddress.slice(0, 8)}...`);

      // Add session signer to user's wallet via Privy
      await addSessionSigners({
        address: walletAddress,
        signers: [
          {
            signerId: BOT_SIGNER_ID,
            policyIds: [], // No policy restrictions for now
          },
        ],
      });

      // Update database state
      const result = await updateSessionSigner(true);
      if (!result.success) {
        throw new Error(result.error || "Failed to update session state");
      }

      logger.ui.debug(`[useBotSession] Session signer enabled successfully`);
      toast.success("Bot session enabled", {
        description: "The bot can now place bets on your behalf.",
      });

      return { success: true };
    } catch (error) {
      logger.ui.error("[useBotSession] Enable failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to enable bot session";
      toast.error("Failed to enable bot session", { description: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      setIsEnabling(false);
    }
  }, [connected, walletAddress, sessionSignerEnabled, addSessionSigners, updateSessionSigner]);

  /**
   * Disable bot session signer
   * This revokes the backend's ability to sign transactions
   */
  const disableBotSession = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!connected || !walletAddress) {
      return { success: false, error: "Wallet not connected" };
    }

    if (!sessionSignerEnabled) {
      return { success: true }; // Already disabled
    }

    setIsDisabling(true);

    try {
      logger.ui.debug(`[useBotSession] Removing session signer for ${walletAddress.slice(0, 8)}...`);

      // Remove session signer from user's wallet via Privy
      await removeSessionSigners({
        address: walletAddress,
      });

      // Update database state (this also deactivates the bot)
      const result = await updateSessionSigner(false);
      if (!result.success) {
        throw new Error(result.error || "Failed to update session state");
      }

      logger.ui.debug(`[useBotSession] Session signer disabled successfully`);
      toast.success("Bot session disabled", {
        description: "The bot can no longer place bets on your behalf.",
      });

      return { success: true };
    } catch (error) {
      logger.ui.error("[useBotSession] Disable failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to disable bot session";
      toast.error("Failed to disable bot session", { description: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      setIsDisabling(false);
    }
  }, [connected, walletAddress, sessionSignerEnabled, removeSessionSigners, updateSessionSigner]);

  /**
   * Toggle session signer state
   */
  const toggleBotSession = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (sessionSignerEnabled) {
      return disableBotSession();
    } else {
      return enableBotSession();
    }
  }, [sessionSignerEnabled, enableBotSession, disableBotSession]);

  return {
    // State
    sessionSignerEnabled,
    isEnabling,
    isDisabling,
    isLoading: isEnabling || isDisabling,

    // Configuration
    signerConfigured: !!BOT_SIGNER_ID,

    // Actions
    enableBotSession,
    disableBotSession,
    toggleBotSession,
  };
}
