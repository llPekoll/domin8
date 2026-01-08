import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { ProfileDialog } from "./ProfileDialog";
import { WithdrawDialog } from "./WithdrawDialog";
import { PrivyWalletButton } from "./PrivyWalletButton";
import { SoundControl } from "./SoundControl";
import { toast } from "sonner";
import { generateRandomName } from "../lib/nameGenerator";
import { logger } from "../lib/logger";
import { useFundWallet } from "../hooks/useFundWallet";
import { Plus, ArrowUpRight, ChevronDown, User } from "lucide-react";
import { Link } from "react-router-dom";
import { NotificationBell } from "./NotificationToggle";

export function Header() {
  const { connected, publicKey, externalWalletAddress, solBalance, isLoadingBalance } =
    usePrivyWallet();
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showBalanceMenu, setShowBalanceMenu] = useState(false);
  const [hasAttemptedCreation, setHasAttemptedCreation] = useState(false);
  const [profileDefaultTab, setProfileDefaultTab] = useState<"profile" | "sound">("profile");
  const balanceMenuRef = useRef<HTMLDivElement>(null);

  const createPlayer = useMutation(api.players.createPlayer);
  const { handleAddFunds } = useFundWallet();

  // Close balance menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (balanceMenuRef.current && !balanceMenuRef.current.contains(event.target as Node)) {
        setShowBalanceMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const playerData = useQuery(
    api.players.getPlayer,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  // Get current game state directly from blockchain (not Convex)
  // const { activeGame: currentRoundState } = useActiveGame();

  // Create player with random name on first connect
  useEffect(() => {
    if (connected && publicKey && playerData === null && !hasAttemptedCreation) {
      const randomName = generateRandomName();
      const walletAddr = publicKey.toString();

      setHasAttemptedCreation(true);

      createPlayer({
        walletAddress: walletAddr,
        displayName: randomName,
        externalWalletAddress: externalWalletAddress || undefined,
      })
        .then(() => {
          toast.success(`Welcome! Your display name is: ${randomName}`);
        })
        .catch((error) => {
          logger.ui.error("Failed to create player:", error);
          toast.error("Failed to create player profile. Please refresh the page and try again.");
          setHasAttemptedCreation(false);
        });
    }

    if (!connected) {
      setHasAttemptedCreation(false);
    }
  }, [connected, publicKey, playerData, hasAttemptedCreation, createPlayer, externalWalletAddress]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        {/* Single unified header bar - full width */}
        <div className="w-full bg-gray-950/90 px-3 md:px-6 py-1 backdrop-blur-sm shadow-sm shadow-indigo-500/20">
          <div className="flex items-center justify-between gap-2 md:gap-6">
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <img src="/assets/logo.webp" alt="Enrageded" className="h-8 md:h-12 w-auto" />
            </div>

            {/* Center - Navigation Links */}
            <div className="flex-1 flex gap-3 md:gap-6">
              <Link
                to="/"
                className="text-indigo-200 hover:text-indigo-100 transition-colors text-xs md:text-sm font-semibold"
              >
                Arena
              </Link>
              <Link
                to="/1v1"
                className="text-indigo-200 hover:text-indigo-100 transition-colors text-xs md:text-sm font-semibold"
              >
                1<span className="px-0.5">v</span>1
              </Link>
              <Link
                to="/flappy"
                className="text-indigo-200 hover:text-indigo-100 transition-colors text-xs md:text-sm font-semibold"
              >
                Flaps
              </Link>
            </div>

            {/* Right Side - User Controls */}
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
              {/* Notification Bell */}
              <NotificationBell walletAddress={publicKey?.toString()} />

              {/* Sound Control - Hidden on mobile */}
              <div className="hidden md:block">
                <SoundControl
                  onSettingsClick={
                    connected && publicKey
                      ? () => {
                          setProfileDefaultTab("sound");
                          setShowProfileDialog(true);
                        }
                      : undefined
                  }
                />
              </div>

              {connected && (
                <>
                  {/* Divider - Hidden on mobile */}
                  <div className="hidden md:block h-8 w-px bg-indigo-500/30"></div>

                  {/* Wallet Balance with Dropdown */}
                  <div className="relative" ref={balanceMenuRef}>
                    <button
                      onClick={() => setShowBalanceMenu(!showBalanceMenu)}
                      className="flex flex-col hover:bg-indigo-800/30 px-1.5 md:px-2 py-1 rounded-lg transition-all cursor-pointer group"
                    >
                      <div className="text-[10px] md:text-xs text-indigo-400/80 leading-tight group-hover:text-indigo-300/90">
                        Balance
                      </div>
                      <div className="text-indigo-200 font-bold text-sm md:text-base flex items-center gap-1 leading-tight group-hover:text-indigo-100">
                        {isLoadingBalance ? (
                          <span className="text-xs md:text-sm">...</span>
                        ) : solBalance !== null ? (
                          <>
                            <img
                              src="/sol-logo.svg"
                              alt="SOL"
                              className="w-3 h-3"
                              style={{
                                filter:
                                  "brightness(0) saturate(100%) invert(81%) sepia(13%) saturate(891%) hue-rotate(196deg) brightness(95%) contrast(92%)",
                              }}
                            />
                            <span className="hidden md:inline">{solBalance.toFixed(4)}</span>
                            <span className="md:hidden">{solBalance.toFixed(2)}</span>
                            <ChevronDown
                              className={`w-3 h-3 transition-transform ${showBalanceMenu ? "rotate-180" : ""}`}
                            />
                          </>
                        ) : (
                          <span className="text-xs md:text-sm">--</span>
                        )}
                      </div>
                    </button>

                    {/* Dropdown Menu */}
                    {showBalanceMenu && (
                      <div className="absolute top-full right-0 mt-2 w-44 bg-indigo-950/95 border border-indigo-500/40 rounded-lg shadow-lg backdrop-blur-md overflow-hidden z-50">
                        <button
                          onClick={() => {
                            if (publicKey) {
                              void handleAddFunds(publicKey.toString());
                            }
                            setShowBalanceMenu(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
                        >
                          <Plus className="w-4 h-4 text-green-400" />
                          <span>Add Funds</span>
                        </button>
                        <div className="h-px bg-indigo-500/30" />
                        <button
                          onClick={() => {
                            setShowWithdrawDialog(true);
                            setShowBalanceMenu(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-800/50 transition-colors text-indigo-100"
                        >
                          <ArrowUpRight className="w-4 h-4 text-orange-400" />
                          <span>Withdraw</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Divider - Hidden on mobile */}
                  <div className="hidden md:block h-8 w-px bg-indigo-500/30"></div>

                  {/* Profile Button */}
                  <button
                    onClick={() => {
                      setProfileDefaultTab("profile");
                      setShowProfileDialog(true);
                    }}
                    className="flex items-center justify-center hover:bg-indigo-800/30 p-1.5 md:p-2 rounded-lg transition-all cursor-pointer group"
                    title="Edit Profile"
                  >
                    <User className="w-4 h-4 md:w-5 md:h-5 text-indigo-400 group-hover:text-indigo-300" />
                  </button>

                  {/* Divider */}
                  <div className="h-6 md:h-8 w-px bg-indigo-500/30"></div>
                </>
              )}

              {/* Wallet Connect Button */}
              <div className="flex items-center">
                <PrivyWalletButton compact={true} showDisconnect={true} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Render modals outside header */}
      {showProfileDialog && publicKey && (
        <ProfileDialog
          open={showProfileDialog}
          onOpenChange={setShowProfileDialog}
          currentName={playerData?.displayName}
          walletAddress={publicKey.toString()}
          defaultTab={profileDefaultTab}
        />
      )}

      <WithdrawDialog isOpen={showWithdrawDialog} onClose={() => setShowWithdrawDialog(false)} />
    </>
  );
}
