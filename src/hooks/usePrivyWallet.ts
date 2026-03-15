import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { getSharedConnection } from "../lib/sharedConnection";
import { logger } from "../lib/logger";
import { EventBus } from "../game/EventBus";
import { LEVEL_THRESHOLDS } from "../lib/xpUtils";

function getLevelInfo(level: number) {
  return LEVEL_THRESHOLDS.find((l) => l.level === level) || LEVEL_THRESHOLDS[0];
}

// Re-export useActiveWallet for components that want wallet switching
export { useActiveWallet } from "../contexts/ActiveWalletContext";

/**
 * Hook for accessing wallet state from Privy.
 *
 * Note: For components that need wallet switching between embedded/external,
 * use the useActiveWallet hook from contexts/ActiveWalletContext instead.
 * This hook provides the embedded wallet by default for backward compatibility.
 */
export function usePrivyWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const dailyLoginClaimedRef = useRef<string | null>(null);

  const { socket } = useSocket();

  // Socket-based daily login XP claim
  const claimDailyLoginXp = useCallback(
    async (args: { walletAddress: string }) => {
      if (!socket) return { awarded: false };
      const res = await socketRequest(socket, "claim-daily-login-xp", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;
  const connected = ready && authenticated && !!walletAddress;

  // Debug: Log user and linked accounts
  useEffect(() => {
    if (user) {
      console.log('[DEBUG] Privy user object:', {
        id: user.id,
        linkedAccounts: user.linkedAccounts?.map(acc => ({
          type: acc.type,
          chainType: 'chainType' in acc ? acc.chainType : 'N/A',
          walletClientType: 'walletClientType' in acc ? acc.walletClientType : 'N/A',
          address: 'address' in acc ? acc.address : 'N/A'
        }))
      });
    }
  }, [user]);

  // Claim daily login XP when wallet is connected
  useEffect(() => {
    if (!connected || !walletAddress) return;

    // Prevent multiple claims for the same wallet in the same session
    if (dailyLoginClaimedRef.current === walletAddress) return;

    const claimLoginXp = async () => {
      try {
        const result = await claimDailyLoginXp({ walletAddress });

        if (result?.awarded) {
          logger.solana.info("[usePrivyWallet] Daily login XP claimed:", result);

          // Emit level-up event if player leveled up
          if (result.levelUp && result.newLevel) {
            EventBus.emit("level-up", {
              newLevel: result.newLevel,
              levelTitle: getLevelInfo(result.newLevel).title,
            });
          }
        }

        // Mark as claimed for this session
        dailyLoginClaimedRef.current = walletAddress;
      } catch (error) {
        logger.solana.error("[usePrivyWallet] Failed to claim daily login XP:", error);
      }
    };

    void claimLoginXp();
  }, [connected, walletAddress, claimDailyLoginXp]);

  // Get external wallet address (non-Privy wallet, e.g., Phantom)
  const externalWalletAccount = user?.linkedAccounts?.find(
    (account) =>
      account.type === "wallet" &&
      "chainType" in account &&
      account.chainType === "solana" &&
      "walletClientType" in account &&
      account.walletClientType !== "privy" &&
      account.walletClientType
  );

  const externalWalletAccountType = externalWalletAccount && "walletClientType" in externalWalletAccount
    ? externalWalletAccount.walletClientType
    : null;

  const externalWalletAddress = externalWalletAccount && "address" in externalWalletAccount
    ? externalWalletAccount.address
    : null;

  // Fetch SOL balance from the Privy embedded wallet using WebSocket subscription
  useEffect(() => {
    if (!connected || !walletAddress) {
      setSolBalance(0);
      return;
    }

    const publicKey = new PublicKey(walletAddress);
    const connection = getSharedConnection();
    let subscriptionId: number | null = null;

    // Initial balance fetch
    const fetchInitialBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const balanceLamports = await connection.getBalance(publicKey);
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
        setSolBalance(balanceSOL);
        logger.solana.debug("[usePrivyWallet] Initial balance fetched:", balanceSOL);
      } catch (error) {
        logger.solana.error("Error fetching initial SOL balance:", error);
        setSolBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Subscribe to account changes via WebSocket for real-time updates
    const subscribeToBalance = async () => {
      try {
        subscriptionId = connection.onAccountChange(
          publicKey,
          (accountInfo) => {
            const balanceSOL = accountInfo.lamports / LAMPORTS_PER_SOL;
            setSolBalance(balanceSOL);
            logger.solana.debug("[usePrivyWallet] Balance updated via WebSocket:", balanceSOL);
          },
          "confirmed"
        );
        logger.solana.debug("[usePrivyWallet] WebSocket subscription active, id:", subscriptionId);
      } catch (error) {
        logger.solana.error("Error subscribing to balance changes:", error);
      }
    };

    void fetchInitialBalance();
    void subscribeToBalance();

    // Cleanup: unsubscribe when component unmounts or wallet changes
    return () => {
      if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId);
        logger.solana.debug("[usePrivyWallet] WebSocket subscription removed, id:", subscriptionId);
      }
    };
  }, [connected, walletAddress]);

  // Function to manually refresh balance (e.g., after a transaction)
  const refreshBalance = async () => {
    if (!connected || !walletAddress) return;

    setIsLoadingBalance(true);
    try {
      const connection = getSharedConnection();
      const publicKey = new PublicKey(walletAddress);
      const balanceLamports = await connection.getBalance(publicKey);
      const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
      setSolBalance(balanceSOL);
    } catch (error) {
      logger.solana.error("Error refreshing SOL balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }

  };

  return {
      connected,
      publicKey: walletAddress ? new PublicKey(walletAddress) : null,
      walletAddress,
      externalWalletAddress,
      externalWalletAccountType,
      wallet: solanaWallet,
      ready,
      solBalance,
      isLoadingBalance,
      refreshBalance,
    };
}
