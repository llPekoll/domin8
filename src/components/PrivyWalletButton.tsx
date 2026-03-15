import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy, useLinkAccount } from "@privy-io/react-auth";
import { LogIn, LogOut, Wallet, ChevronDown, Copy, Check, Link2, ArrowLeftRight } from "lucide-react";
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
  onActiveWalletChange,
}: PrivyWalletButtonProps) {
  const { ready, authenticated, login, logout } = usePrivy();
  const {
    activeWalletAddress: walletAddress,
    isUsingExternalWallet: useExternalWallet,
    embeddedWalletAddress,
    externalWalletAddress,
    externalWalletType,
    switchToEmbedded,
    switchToExternal,
  } = useActiveWallet();

  const [isMounted, setIsMounted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Link wallet functionality
  const { linkWallet } = useLinkAccount({
    onSuccess: ({ linkedAccount }) => {
      console.log("[PrivyWalletButton] Wallet linked successfully:", linkedAccount);
      if (linkedAccount.type === "wallet" && "address" in linkedAccount) {
        toast.success(`Wallet ${linkedAccount.address.slice(0, 4)}...${linkedAccount.address.slice(-4)} linked!`);
      }
    },
    onError: (error) => {
      console.error("[PrivyWalletButton] Failed to link wallet:", error);
      toast.error("Failed to link wallet");
    },
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check for Phantom installation
  useEffect(() => {
    setIsMounted(true);
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

  const handleLinkWallet = useCallback(() => {
    setDropdownOpen(false);
    linkWallet({ walletChainType: "solana-only" });
  }, [linkWallet]);

  const handleSwitchWallet = useCallback(() => {
    if (!externalWalletAddress) {
      toast.error("No external wallet linked");
      return;
    }

    setDropdownOpen(false);

    if (useExternalWallet) {
      switchToEmbedded();
      toast.success("Switched to embedded wallet");
      if (embeddedWalletAddress) {
        onActiveWalletChange?.(embeddedWalletAddress, false);
      }
    } else {
      switchToExternal();
      toast.success(`Switched to ${externalWalletType || "external"} wallet`);
      onActiveWalletChange?.(externalWalletAddress, true);
    }
  }, [useExternalWallet, externalWalletAddress, externalWalletType, embeddedWalletAddress, switchToEmbedded, switchToExternal, onActiveWalletChange]);

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
          className="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold"
          size={compact ? "sm" : "default"}
        >
          <LogIn className="h-4 w-4 mr-2" />
          {compact ? "Connect" : "Connect Wallet"}
        </Button>
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
          {useExternalWallet && externalWalletType && (
            <span className="text-2.5 px-1.5 py-0.5 rounded bg-purple-600/50 text-purple-200 uppercase">
              {externalWalletType.slice(0, 3)}
            </span>
          )}
          <ChevronDown
            className={`w-3 h-3 text-indigo-300 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
            {/* Current wallet indicator */}
            <div className="px-4 py-2 border-b border-indigo-500/30">
              <span className="text-2.5 text-indigo-400 uppercase tracking-wider">
                {useExternalWallet ? (externalWalletType || "External") : "Embedded"} Wallet
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

            {/* Link or Switch External Wallet */}
            {externalWalletAddress ? (
              <button
                onClick={handleSwitchWallet}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
              >
                <ArrowLeftRight className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-sm">
                    {useExternalWallet ? "Use Embedded" : `Use ${externalWalletType || "External"}`}
                  </span>
                  <span className="text-2.5 text-indigo-400">
                    {useExternalWallet
                      ? `${embeddedWalletAddress ? embeddedWalletAddress.slice(0, 4) + "..." + embeddedWalletAddress.slice(-4) : ""}`
                      : `${externalWalletAddress.slice(0, 4)}...${externalWalletAddress.slice(-4)}`}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={handleLinkWallet}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
              >
                <Link2 className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-sm">Link External Wallet</span>
                  <span className="text-2.5 text-indigo-400">Phantom, Solflare, etc.</span>
                </div>
              </button>
            )}

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
        {useExternalWallet && externalWalletType && (
          <span className="text-2.5 px-1.5 py-0.5 rounded bg-purple-600/50 text-purple-200 uppercase">
            {externalWalletType.slice(0, 3)}
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-indigo-300 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
          {/* Current wallet indicator */}
          <div className="px-4 py-2 border-b border-indigo-500/30">
            <span className="text-2.5 text-indigo-400 uppercase tracking-wider">
              {useExternalWallet ? (externalWalletType || "External") : "Embedded"} Wallet
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

          {/* Link or Switch External Wallet */}
          {externalWalletAddress ? (
            <button
              onClick={handleSwitchWallet}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
            >
              <ArrowLeftRight className="w-4 h-4 text-purple-400" />
              <div className="flex flex-col">
                <span className="text-sm">
                  {useExternalWallet ? "Use Embedded" : `Use ${externalWalletType || "External"}`}
                </span>
                <span className="text-2.5 text-indigo-400">
                  {useExternalWallet
                    ? `${embeddedWalletAddress ? embeddedWalletAddress.slice(0, 4) + "..." + embeddedWalletAddress.slice(-4) : ""}`
                    : `${externalWalletAddress.slice(0, 4)}...${externalWalletAddress.slice(-4)}`}
                </span>
              </div>
            </button>
          ) : (
            <button
              onClick={handleLinkWallet}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
            >
              <Link2 className="w-4 h-4 text-purple-400" />
              <div className="flex flex-col">
                <span className="text-sm">Link External Wallet</span>
                <span className="text-2.5 text-indigo-400">Phantom, Solflare, etc.</span>
              </div>
            </button>
          )}

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
