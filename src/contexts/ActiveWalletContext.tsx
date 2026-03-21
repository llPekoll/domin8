/**
 * Active Wallet Context — TON version
 *
 * Replaces the Privy-based ActiveWalletContext with TonConnect.
 * TonConnect manages a single wallet (no embedded/external split).
 *
 * Provides the same interface so components don't need major changes.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import {
  useTonConnectUI,
  useTonAddress,
  useTonWallet,
} from "@tonconnect/ui-react";
import { Address, fromNano } from "@ton/core";
import { getTonClient } from "../lib/tonClient";

interface ActiveWalletContextType {
  // Active wallet
  activeWalletAddress: string | null;
  activePublicKey: string | null;  // compat: was Solana PublicKey, now just address string
  activeWallet: null;              // compat: no Privy wallet object on TON
  isUsingExternalWallet: boolean;

  // Embedded/external compat (TON = single wallet)
  embeddedWalletAddress: string | null;
  externalWalletAddress: string | null;

  // Balance
  tonBalance: number;
  isLoadingBalance: boolean;
  refreshBalance: () => Promise<void>;

  // Compat aliases
  solBalance: number;
  walletAddress: string | null;
  connected: boolean;
  ready: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
}

const ActiveWalletContext = createContext<ActiveWalletContextType | null>(null);

export function ActiveWalletProvider({ children }: { children: ReactNode }) {
  const [tonConnectUI] = useTonConnectUI();
  const rawAddress = useTonAddress(false);
  const friendlyAddress = useTonAddress(true);
  const wallet = useTonWallet();

  const [tonBalance, setTonBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const connected = !!wallet;
  const ready = true; // TonConnect is always ready after provider mounts

  const address = rawAddress ? Address.parseRaw(rawAddress) : null;

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setTonBalance(0);
      return;
    }
    setIsLoadingBalance(true);
    try {
      const client = getTonClient();
      const bal = await client.getBalance(address);
      setTonBalance(parseFloat(fromNano(bal)));
    } catch (err) {
      console.error("[ActiveWallet] Balance error:", err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address?.toString()]);

  // Fetch balance on connect + poll every 15s
  useEffect(() => {
    if (!connected || !address) {
      setTonBalance(0);
      return;
    }
    refreshBalance();
    const interval = setInterval(refreshBalance, 15000);
    return () => clearInterval(interval);
  }, [connected, address?.toString(), refreshBalance]);

  const connect = useCallback(() => {
    tonConnectUI.openModal();
  }, [tonConnectUI]);

  const disconnect = useCallback(() => {
    tonConnectUI.disconnect();
  }, [tonConnectUI]);

  const value: ActiveWalletContextType = {
    activeWalletAddress: friendlyAddress || null,
    activePublicKey: friendlyAddress || null,
    activeWallet: null,
    isUsingExternalWallet: false,
    embeddedWalletAddress: friendlyAddress || null, // same as active on TON
    externalWalletAddress: null,
    tonBalance,
    isLoadingBalance,
    refreshBalance,
    solBalance: tonBalance,
    walletAddress: friendlyAddress || null,
    connected,
    ready,
    connect,
    disconnect,
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
    throw new Error(
      "useActiveWallet must be used within an ActiveWalletProvider"
    );
  }
  return context;
}
