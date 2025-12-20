import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState, useEffect } from "react";
import { getSharedConnection } from "../lib/sharedConnection";
import { logger } from "../lib/logger";

export function usePrivyWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

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
  // Debug: Log what we're returning
  // console.log('[DEBUG] usePrivyWallet returning:', {
  //   connected,
  //   walletAddress,
  //   externalWalletAddress,
  //   externalWalletAccountType,
  //   ready,
  //   linkedAccountsCount: user?.linkedAccounts?.length || 0
  // });

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