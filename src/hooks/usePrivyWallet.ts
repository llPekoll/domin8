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

  // Fetch SOL balance from the Privy embedded wallet
  useEffect(() => {
    if (!connected || !walletAddress) {
      setSolBalance(0);
      return;
    }

    const fetchBalance = async () => {
      setIsLoadingBalance(true);
      try {
        // Use shared connection instance
        const connection = getSharedConnection();

        // Fetch balance in lamports
        const publicKey = new PublicKey(walletAddress);
        const balanceLamports = await connection.getBalance(publicKey);

        // Convert lamports to SOL
        const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
        setSolBalance(balanceSOL);
      } catch (error) {
        logger.solana.error("Error fetching SOL balance:", error);
        setSolBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    void fetchBalance();

    // Refresh balance every 10 seconds while connected
    const interval = setInterval(() => void fetchBalance(), 10000);
    return () => clearInterval(interval);
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