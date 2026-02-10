import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSharedConnection } from "../lib/sharedConnection";
import { logger } from "../lib/logger";

interface ActiveWalletContextType {
  // Active wallet info (the one user selected to use)
  activeWalletAddress: string | null;
  activePublicKey: PublicKey | null;
  activeWallet: ReturnType<typeof useWallets>["wallets"][0] | null;
  isUsingExternalWallet: boolean;

  // Embedded wallet info (always available)
  embeddedWalletAddress: string | null;
  embeddedWallet: ReturnType<typeof useWallets>["wallets"][0] | null;

  // External wallet info (if linked)
  externalWalletAddress: string | null;
  externalWallet: ReturnType<typeof useWallets>["wallets"][0] | null;
  externalWalletType: string | null;

  // Balance for active wallet
  solBalance: number;
  isLoadingBalance: boolean;
  refreshBalance: () => Promise<void>;

  // Actions
  switchToEmbedded: () => void;
  switchToExternal: () => void;
  setActiveWallet: (address: string, isExternal: boolean) => void;

  // Connection status
  connected: boolean;
  ready: boolean;
}

const ActiveWalletContext = createContext<ActiveWalletContextType | null>(null);

const ACTIVE_WALLET_KEY = "domin8_active_wallet";

export function ActiveWalletProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [useExternalWallet, setUseExternalWallet] = useState<boolean>(() => {
    // Restore from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem(ACTIVE_WALLET_KEY) === "external";
    }
    return false;
  });
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  // Get Privy embedded wallet from user.linkedAccounts
  const embeddedWalletAccount = user?.linkedAccounts?.find(
    (account) =>
      account.type === "wallet" &&
      "walletClientType" in account &&
      "chainType" in account &&
      (account.walletClientType === "privy" || !account.walletClientType) &&
      account.chainType === "solana"
  );

  // Get external wallet (non-Privy wallet, e.g., Phantom)
  const externalWalletAccount = user?.linkedAccounts?.find(
    (account) =>
      account.type === "wallet" &&
      "chainType" in account &&
      account.chainType === "solana" &&
      "walletClientType" in account &&
      account.walletClientType !== "privy" &&
      account.walletClientType
  );

  const embeddedWalletAddress = embeddedWalletAccount && "address" in embeddedWalletAccount
    ? embeddedWalletAccount.address
    : null;

  const externalWalletAddress = externalWalletAccount && "address" in externalWalletAccount
    ? externalWalletAccount.address
    : null;

  const externalWalletType = externalWalletAccount && "walletClientType" in externalWalletAccount
    ? (externalWalletAccount.walletClientType as string)
    : null;

  // Find wallet objects
  const embeddedWallet = embeddedWalletAddress
    ? wallets.find((w) => w.address === embeddedWalletAddress) || null
    : null;

  const externalWallet = externalWalletAddress
    ? wallets.find((w) => w.address === externalWalletAddress) || null
    : null;

  // Determine active wallet
  const canUseExternal = useExternalWallet && externalWallet && externalWalletAddress;
  const activeWallet = canUseExternal ? externalWallet : (embeddedWallet || wallets[0] || null);
  const activeWalletAddress = activeWallet?.address || null;
  const activePublicKey = activeWalletAddress ? new PublicKey(activeWalletAddress) : null;
  const isUsingExternalWallet = Boolean(canUseExternal);

  const connected = ready && authenticated && !!activeWalletAddress;

  // Persist preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_WALLET_KEY, useExternalWallet ? "external" : "embedded");
    }
  }, [useExternalWallet]);

  // Reset to embedded if external wallet is no longer available
  useEffect(() => {
    if (useExternalWallet && !externalWalletAddress) {
      setUseExternalWallet(false);
    }
  }, [useExternalWallet, externalWalletAddress]);

  // Fetch SOL balance for active wallet
  useEffect(() => {
    if (!connected || !activeWalletAddress) {
      setSolBalance(0);
      return;
    }

    const publicKey = new PublicKey(activeWalletAddress);
    const connection = getSharedConnection();
    let subscriptionId: number | null = null;

    const fetchInitialBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const balanceLamports = await connection.getBalance(publicKey);
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
        setSolBalance(balanceSOL);
        logger.solana.debug("[ActiveWalletContext] Initial balance fetched:", balanceSOL);
      } catch (error) {
        logger.solana.error("Error fetching initial SOL balance:", error);
        setSolBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    const subscribeToBalance = async () => {
      try {
        subscriptionId = connection.onAccountChange(
          publicKey,
          (accountInfo) => {
            const balanceSOL = accountInfo.lamports / LAMPORTS_PER_SOL;
            setSolBalance(balanceSOL);
            logger.solana.debug("[ActiveWalletContext] Balance updated via WebSocket:", balanceSOL);
          },
          "confirmed"
        );
        logger.solana.debug("[ActiveWalletContext] WebSocket subscription active, id:", subscriptionId);
      } catch (error) {
        logger.solana.error("Error subscribing to balance changes:", error);
      }
    };

    void fetchInitialBalance();
    void subscribeToBalance();

    return () => {
      if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId);
        logger.solana.debug("[ActiveWalletContext] WebSocket subscription removed, id:", subscriptionId);
      }
    };
  }, [connected, activeWalletAddress]);

  const refreshBalance = useCallback(async () => {
    if (!connected || !activeWalletAddress) return;

    setIsLoadingBalance(true);
    try {
      const connection = getSharedConnection();
      const publicKey = new PublicKey(activeWalletAddress);
      const balanceLamports = await connection.getBalance(publicKey);
      const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
      setSolBalance(balanceSOL);
    } catch (error) {
      logger.solana.error("Error refreshing SOL balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [connected, activeWalletAddress]);

  const switchToEmbedded = useCallback(() => {
    setUseExternalWallet(false);
    logger.solana.info("[ActiveWalletContext] Switched to embedded wallet");
  }, []);

  const switchToExternal = useCallback(() => {
    if (externalWalletAddress) {
      setUseExternalWallet(true);
      logger.solana.info("[ActiveWalletContext] Switched to external wallet:", externalWalletType);
    }
  }, [externalWalletAddress, externalWalletType]);

  const setActiveWallet = useCallback((address: string, isExternal: boolean) => {
    setUseExternalWallet(isExternal);
    logger.solana.info("[ActiveWalletContext] Active wallet set:", { address, isExternal });
  }, []);

  const value: ActiveWalletContextType = {
    activeWalletAddress,
    activePublicKey,
    activeWallet,
    isUsingExternalWallet,
    embeddedWalletAddress,
    embeddedWallet,
    externalWalletAddress,
    externalWallet,
    externalWalletType,
    solBalance,
    isLoadingBalance,
    refreshBalance,
    switchToEmbedded,
    switchToExternal,
    setActiveWallet,
    connected,
    ready,
  };

  return (
    <ActiveWalletContext.Provider value={value}>
      {children}
    </ActiveWalletContext.Provider>
  );
}

export function useActiveWallet() {
  const context = useContext(ActiveWalletContext);
  if (!context) {
    throw new Error("useActiveWallet must be used within an ActiveWalletProvider");
  }
  return context;
}
