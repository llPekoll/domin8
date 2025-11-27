import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  LogIn,
  LogOut,
  Wallet,
  Download,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { isPhantomInstalled, openPhantomDownload } from "../lib/solana-wallet-utils";
import { toast } from "sonner";

interface PrivyWalletButtonProps {
  className?: string;
  compact?: boolean;
  showDisconnect?: boolean;
  onWalletConnected?: (address: string) => void;
}

export function PrivyWalletButton({
  className = "",
  compact = false,
  onWalletConnected,
}: PrivyWalletButtonProps) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [isMounted, setIsMounted] = useState(false);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Get Privy embedded wallet from user.linkedAccounts (more reliable)
  const embeddedWalletAccount = user?.linkedAccounts?.find(
    (account) =>
      account.type === "wallet" &&
      "walletClientType" in account &&
      "chainType" in account &&
      (account.walletClientType === "privy" || !account.walletClientType) &&
      account.chainType === "solana"
  );

  // Find the corresponding wallet object from useWallets()
  const embeddedWallet =
    embeddedWalletAccount && "address" in embeddedWalletAccount
      ? wallets.find((w) => w.address === embeddedWalletAccount.address)
      : null;

  // Primary wallet for display (prefer Privy embedded, fallback to first wallet)
  const solanaWallet = embeddedWallet || wallets[0];
  const walletAddress = solanaWallet?.address;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check for Phantom installation
  useEffect(() => {
    setIsMounted(true);
    setHasPhantom(isPhantomInstalled());
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const handleLogin = () => {
    if (!hasPhantom) {
      toast.info(
        "Phantom wallet not detected. You can use email/social login for an embedded wallet, or install Phantom extension.",
        { duration: 5000 }
      );
    }
    login();
  };

  // Notify parent when wallet connects
  useEffect(() => {
    if (authenticated && walletAddress && onWalletConnected) {
      onWalletConnected(walletAddress);
    }
  }, [authenticated, walletAddress, onWalletConnected]);

  const handleDisconnect = async () => {
    setDropdownOpen(false);
    await logout();
  };

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsCopied(true);
      toast.success("Wallet address copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy address");
    }
  };

  if (!isMounted || !ready) {
    return (
      <Button disabled className="bg-gray-700 text-gray-300" size={compact ? "sm" : "default"}>
        Loading...
      </Button>
    );
  }

  if (!authenticated || !walletAddress) {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={handleLogin}
          className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold"
          size={compact ? "sm" : "default"}
        >
          <LogIn className="h-4 w-4 mr-2" />
          {compact ? "Connect" : "Connect Wallet"}
        </Button>

        {!hasPhantom && (
          <Button
            onClick={openPhantomDownload}
            variant="outline"
            size={compact ? "sm" : "default"}
            className="border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white"
            title="Install Phantom Wallet"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-950/80 border border-indigo-500/40 backdrop-blur-md hover:bg-indigo-800/50 transition-colors"
        >
          <Wallet className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-indigo-100 uppercase tracking-wide">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-indigo-300 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
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
              onClick={() => void handleDisconnect()}
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

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg bg-indigo-950/80 border border-indigo-500/40 backdrop-blur-md hover:bg-indigo-800/50 transition-colors"
      >
        <Wallet className="w-4 h-4 text-indigo-400" />
        <div className="h-4 w-px bg-indigo-500/30" />
        <span className="text-xs font-medium text-indigo-100 uppercase tracking-wide">
          {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-indigo-300 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-44 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
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
            onClick={() => void handleDisconnect()}
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
