/**
 * Wallet Button — TON version (TonConnect)
 *
 * Keeps the same component name for backward compat.
 * Simplified: TonConnect = single wallet, no embedded/external split.
 */

import { useState, useEffect, useRef } from "react";
import { LogIn, LogOut, Wallet, ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useActiveWallet } from "../contexts/ActiveWalletContext";

interface PrivyWalletButtonProps {
  className?: string;
  compact?: boolean;
  showDisconnect?: boolean;
  onWalletConnected?: (address: string) => void;
  onActiveWalletChange?: (address: string, isExternal: boolean) => void;
}

export function PrivyWalletButton({
  className = "",
  compact = false,
  onWalletConnected,
}: PrivyWalletButtonProps) {
  const { connected, ready, walletAddress, connect, disconnect } =
    useActiveWallet();

  const [isCopied, setIsCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  // Notify parent on connect
  useEffect(() => {
    if (connected && walletAddress && onWalletConnected) {
      onWalletConnected(walletAddress);
    }
  }, [connected, walletAddress, onWalletConnected]);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsCopied(true);
      toast.success("Address copied!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDisconnect = () => {
    setDropdownOpen(false);
    disconnect();
  };

  if (!ready) {
    return (
      <Button
        disabled
        className="bg-gray-700 text-gray-300"
        size={compact ? "sm" : "default"}
      >
        Loading...
      </Button>
    );
  }

  if (!connected || !walletAddress) {
    return (
      <Button
        onClick={connect}
        className="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold"
        size={compact ? "sm" : "default"}
      >
        <LogIn className="h-4 w-4 mr-2" />
        {compact ? "Connect" : "Connect Wallet"}
      </Button>
    );
  }

  const shortAddr = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-950/80 border border-indigo-500/40 backdrop-blur-md hover:bg-indigo-800/50 transition-colors"
      >
        <Wallet className="w-4 h-4 text-indigo-400" />
        {!compact && <div className="h-4 w-px bg-indigo-500/30" />}
        <span className="text-xs font-medium text-indigo-100 uppercase tracking-wide">
          {shortAddr}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-indigo-300 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
          <div className="px-4 py-2 border-b border-indigo-500/30">
            <span className="text-2.5 text-indigo-400 uppercase tracking-wider">
              TON Wallet
            </span>
          </div>

          <button
            onClick={() => void handleCopyAddress()}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-indigo-400" />
                <span>Copy Address</span>
              </>
            )}
          </button>

          <div className="h-px bg-indigo-500/30" />

          <button
            onClick={handleDisconnect}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-red-400"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
