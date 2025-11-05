import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
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
      <header className="fixed top-0 left-0 right-0 z-50 ">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center space-x-6">
              <img src="/assets/logo.webp" alt="Enrageded" className="h-22 w-auto" />
            </div>

            <div className="flex items-center space-x-4">
              {/* Game Status Display */}
              {currentRoundState && (
                <div className="flex flex-col items-center text-amber-300">
                  <div className="flex items-center gap-2">
                    <Map className="w-4 h-4 text-amber-400" />
                    <div className="font-bold text-amber-300 text-lg uppercase tracking-wide">
                      Round #
                      {currentRoundState.roundId?.toString() ||
                        currentRoundState.gameRound?.toString() ||
                        "?"}
                    </div>
                  </div>
                  <div className="text-amber-300 text-sm flex items-center gap-1 mt-1">
                    <span className="text-yellow-300">⚡</span>
                    {currentRoundState.status === 0 && "Waiting for players"}
                    {currentRoundState.status === 1 && "Game Over - Place bet for new round"}
                    {/* Debug: show status if unexpected */}
                    {![0, 1].includes(currentRoundState.status) &&
                      `Status: ${currentRoundState.status}`}
                  </div>
                </div>
              )}

              {/* Sound Control */}
              <SoundControl />

              {connected && (
                <>
                  <Button
                    onClick={() => setShowProfileDialog(true)}
                    variant="ghost"
                    className="text-gray-300 hover:text-white hover:bg-gray-800"
                    title={playerData?.displayName || "Profile"}
                  >
                    <User className="h-5 w-5" />
                    <span className="ml-2 hidden sm:inline text-lg">
                      {playerData?.displayName || "Profile"}
                    </span>
                  </Button>

                  <div className="bg-gradient-to-r from-indigo-900/30 to-indigo-800/30 rounded-lg px-4 py-2 border border-indigo-600/50 backdrop-blur-sm shadow-lg shadow-indigo-500/20">
                    <div className="text-right">
                      <div className="text-sm text-gray-400 mb-0.5">Wallet Balance</div>
                      <div className="text-indigo-300 font-bold text-xl flex items-center justify-end">
                        {isLoadingBalance ? (
                          <span className="text-lg">Loading...</span>
                        ) : solBalance !== null ? (
                          <>
                            {solBalance.toFixed(4)}{" "}
                            <span className="text-indigo-400 ml-1 text-lg">SOL</span>
                          </>
                        ) : (
                          <span className="text-lg">--</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Privy Wallet Button */}
              <PrivyWalletButton
                compact={false}
                showDisconnect={true}
                onShowProfile={() => setShowProfileDialog(true)}
              />
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
