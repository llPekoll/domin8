import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { ProfileDialog } from "./ProfileDialog";
import { PrivyWalletButton } from "./PrivyWalletButton";
import { SoundControl } from "./SoundControl";
import { toast } from "sonner";
import { User, Map } from "lucide-react";
import { generateRandomName } from "../lib/nameGenerator";
import { useActiveGame } from "../hooks/useActiveGame";
import { logger } from "../lib/logger";

export function Header() {
  const { connected, publicKey, externalWalletAddress, solBalance, isLoadingBalance } = usePrivyWallet();
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [hasAttemptedCreation, setHasAttemptedCreation] = useState(false);

  const createPlayer = useMutation(api.players.createPlayer);

  const playerData = useQuery(
    api.players.getPlayer,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  // Get current game state directly from blockchain (not Convex)
  const { activeGame: currentRoundState } = useActiveGame();

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
        <div className="container mx-auto px-4 py-3">
          {/* Single unified header bar */}
          <div className="bg-gradient-to-r from-indigo-900/30 to-indigo-800/30 rounded-lg px-6 py-3 border border-indigo-600/50 backdrop-blur-sm shadow-lg shadow-indigo-500/20">
            <div className="flex items-center justify-between gap-6">
              {/* Logo */}
              <div className="flex items-center flex-shrink-0">
                <img src="/assets/logo.webp" alt="Enrageded" className="h-12 w-auto" />
              </div>

              {/* Center - Game Status */}
              <div className="flex-1 flex justify-center">
                {currentRoundState && (
                  <div className="flex items-center gap-3">
                    <Map className="w-5 h-5 text-amber-400" />
                    <div className="flex flex-col">
                      <div className="font-bold text-amber-300 text-base uppercase tracking-wide leading-tight">
                        Round #
                        {currentRoundState.roundId?.toString() ||
                          currentRoundState.gameRound?.toString() ||
                          "?"}
                      </div>
                      <div className="text-amber-400/80 text-xs flex items-center gap-1 leading-tight">
                        <span className="text-yellow-300">⚡</span>
                        {currentRoundState.status === 0 && "Waiting for players"}
                        {currentRoundState.status === 1 && "Place bet for new round"}
                        {![0, 1].includes(currentRoundState.status) &&
                          `Status: ${currentRoundState.status}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side - User Controls */}
              <div className="flex items-center gap-4 flex-shrink-0">
                {/* Sound Control */}
                <div className="flex items-center">
                  <SoundControl />
                </div>

                {connected && (
                  <>
                    {/* Profile Button */}
                    <button
                      onClick={() => setShowProfileDialog(true)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                      title={playerData?.displayName || "Profile"}
                    >
                      <User className="h-5 w-5 text-indigo-300" />
                      <span className="hidden sm:inline text-indigo-200 font-medium text-sm">
                        {playerData?.displayName || "Profile"}
                      </span>
                    </button>

                    {/* Divider */}
                    <div className="h-8 w-px bg-indigo-500/30"></div>

                    {/* Wallet Balance */}
                    <div className="flex flex-col">
                      <div className="text-xs text-indigo-400/80 leading-tight">Balance</div>
                      <div className="text-indigo-200 font-bold text-base flex items-center leading-tight">
                        {isLoadingBalance ? (
                          <span className="text-sm">Loading...</span>
                        ) : solBalance !== null ? (
                          <>
                            {solBalance.toFixed(4)}{" "}
                            <span className="text-indigo-300 ml-1 text-sm">SOL</span>
                          </>
                        ) : (
                          <span className="text-sm">--</span>
                        )}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-8 w-px bg-indigo-500/30"></div>
                  </>
                )}

                {/* Wallet Connect Button */}
                <div className="flex items-center">
                  <PrivyWalletButton
                    compact={false}
                    showDisconnect={true}
                    onShowProfile={() => setShowProfileDialog(true)}
                  />
                </div>
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
        />
      )}
    </>
  );
}
