/**
 * TON Wallet Hook
 *
 * Replaces usePrivyWallet.ts — uses TonConnect instead of Privy.
 * Provides wallet connection, balance, and address.
 */

import { useState, useEffect, useCallback } from "react";
import { useTonConnectUI, useTonAddress, useTonWallet } from "@tonconnect/ui-react";
import { Address, fromNano } from "@ton/core";
import { getTonClient } from "../lib/tonClient";

export function useTonWalletHook() {
  const [tonConnectUI] = useTonConnectUI();
  const rawAddress = useTonAddress(false); // raw format
  const friendlyAddress = useTonAddress(true); // friendly format
  const wallet = useTonWallet();

  const [balance, setBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const connected = !!wallet;

  const address = rawAddress
    ? Address.parseRaw(rawAddress)
    : null;

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(0);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const client = getTonClient();
      const bal = await client.getBalance(address);
      setBalance(parseFloat(fromNano(bal)));
    } catch (err) {
      console.error("[TonWallet] Balance fetch error:", err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address?.toString()]);

  // Fetch balance on connect and periodically
  useEffect(() => {
    if (!connected || !address) {
      setBalance(0);
      return;
    }

    refreshBalance();
    const interval = setInterval(refreshBalance, 15000); // every 15s
    return () => clearInterval(interval);
  }, [connected, address?.toString(), refreshBalance]);

  const connect = useCallback(() => {
    tonConnectUI.openModal();
  }, [tonConnectUI]);

  const disconnect = useCallback(() => {
    tonConnectUI.disconnect();
  }, [tonConnectUI]);

  return {
    connected,
    address,
    walletAddress: friendlyAddress || null,
    wallet,
    tonBalance: balance,
    isLoadingBalance,
    refreshBalance,
    connect,
    disconnect,
  };
}
