import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useFundWallet } from "@privy-io/react-auth/solana";
import {
  LogIn,
  LogOut,
  Wallet,
  Download,
  Plus,
  ArrowUpRight,
  User,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { isPhantomInstalled, openPhantomDownload } from "../lib/solana-wallet-utils";
import { toast } from "sonner";
import { WithdrawDialog } from "./WithdrawDialog";

interface PrivyWalletButtonProps {
  className?: string;
  compact?: boolean;
  showDisconnect?: boolean;
  onWalletConnected?: (address: string) => void;
  onShowProfile?: () => void;
}

export function PrivyWalletButton({
  className = "",
  compact = false,
  onWalletConnected,
  onShowProfile,
}: PrivyWalletButtonProps) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const [isMounted, setIsMounted] = useState(false);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

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

  const handleAddFunds = async () => {
    setDropdownOpen(false);

    if (!embeddedWallet) {
      toast.error("No in-game wallet found. Please reconnect to create one.");
      return;
    }

    try {
      await fundWallet({
        address: embeddedWallet.address,
        options: {
          chain: `solana:${import.meta.env.VITE_SOLANA_NETWORK}`,
          amount: "0.01",
        },
      });
    } catch (error: any) {
      if (error?.message?.includes("not enabled")) {
        try {
          await navigator.clipboard.writeText(embeddedWallet.address);
          toast.info("Funding not yet enabled. In-game wallet address copied!", {
            description: "Send SOL to this address to fund your in-game wallet",
            duration: 5000,
          });
        } catch {
          toast.error("Funding not enabled. Enable MoonPay in Privy Dashboard.", {
            description: "Go to dashboard.privy.io → Plugins → MoonPay Fiat On-Ramp",
            duration: 5000,
          });
        }
      } else {
        toast.error("Failed to open funding flow");
      }
    }
  };

  const handleWithdraw = () => {
    setDropdownOpen(false);
    setShowWithdrawDialog(true);
  };

  const handleProfile = () => {
    setDropdownOpen(false);
    if (onShowProfile) {
      onShowProfile();
    }
  };

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
      <>
        <WithdrawDialog isOpen={showWithdrawDialog} onClose={() => setShowWithdrawDialog(false)} />
        <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm hover:bg-gray-800 transition-colors"
        >
          <Wallet className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-gray-200 uppercase tracking-wide">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-700 bg-gray-800 shadow-xl z-50">
            <div className="py-1">
              <button
                onClick={() => void handleCopyAddress()}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Address
                  </>
                )}
              </button>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => void handleAddFunds()}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Funds
              </button>
              <button
                onClick={handleWithdraw}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4" />
                Withdraw Funds
              </button>
              <button
                onClick={handleProfile}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => void handleDisconnect()}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
      </>
    );
  }

  return (
    <>
      <WithdrawDialog isOpen={showWithdrawDialog} onClose={() => setShowWithdrawDialog(false)} />
      <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm hover:bg-gray-800 transition-colors"
      >
        <Wallet className="w-4 h-4 text-indigo-400" />
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
          {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-800 shadow-xl z-50">
          <div className="py-1">
            <button
              onClick={() => void handleCopyAddress()}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Address
                </>
              )}
            </button>
            <div className="border-t border-gray-700 my-1" />
            <button
              onClick={() => void handleAddFunds()}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Funds
            </button>
            <button
              onClick={handleWithdraw}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw Funds
            </button>
            <button
              onClick={handleProfile}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <User className="w-4 h-4" />
              Profile
            </button>
            <div className="border-t border-gray-700 my-1" />
            <button
              onClick={() => void handleDisconnect()}
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
