import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { toast } from "sonner";
import { MultiParticipantPanel } from "./MultiParticipantPanel";
import { CharacterSelection } from "./CharacterSelection";
import { generateRandomName } from "../lib/nameGenerator";
import { Users, Gamepad2 } from "lucide-react";
import { logger } from "../lib/logger";

export function GameLobby() {
  const { connected, publicKey } = usePrivyWallet();
  // TODO: need to be redone in a blockchainway
  // Get player data
  const playerData = useQuery(
    api.players.getPlayerWithCharacter,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  // Mutations
  const createPlayer = useMutation(api.players.createPlayer);

  const handleCreatePlayer = async () => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }

    try {
      const randomName = generateRandomName();
      logger.ui.debug(
        "Manual player creation for wallet:",
        publicKey.toString(),
        "with name:",
        randomName
      );

      await createPlayer({
        walletAddress: publicKey.toString(),
        displayName: randomName,
      });
      toast.success(
        `Player created! Your display name is: ${randomName}. You've been given a random character and 1000 starting coins.`
      );
    } catch (error) {
      logger.ui.error("Failed to create player:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create player");
    }
  };

  // Stable callback for CharacterSelection
  const handleParticipantAdded = useCallback(() => {
    // No need to force re-render, queries will update automatically
  }, []);

  if (!connected) {
    return (
      <Card className="p-4 text-center">
        <Gamepad2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <h2 className="text-lg font-bold mb-1">Royal Rumble</h2>
        <p className="text-sm text-gray-400 mb-2">Connect wallet to join</p>
      </Card>
    );
  }

  // Show create player UI only when:
  // - Wallet is connected
  // - Query has completed (playerData is not undefined)
  // - Player doesn't exist (playerData is null)
  if (connected && playerData === null) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-blue-400" />
          <h2 className="text-xl font-bold mb-2">Welcome to Royal Rumble!</h2>
          <p className="text-gray-400 mb-4">Create your player profile to start battling</p>
          <Button onClick={() => void handleCreatePlayer()} size="lg">
            Create Player Profile
          </Button>
        </Card>
      </div>
    );
  }

  // If wallet is connected but playerData is undefined, query is still loading
  if (connected && playerData === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // If not connected or no player data, show connect wallet message
  if (!connected || !playerData) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400">Please connect your wallet to start playing</p>
        </Card>
      </div>
    );
  }

  // In demo mode (currentGame is always null), always show the lobby UI
  return (
    <div className="space-y-4">
      {/* Character Selection - allows player to place bets */}
      <CharacterSelection onParticipantAdded={handleParticipantAdded} />

      {/* Multi-Participant Control */}
      <MultiParticipantPanel />
    </div>
  );

  // The following code will be enabled once Solana game state is integrated:
  /*
  if (!currentGame) {
    return (
      <div className="space-y-4">
        <CharacterSelection onParticipantAdded={handleParticipantAdded} />
        <MultiParticipantPanel />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentGame?.status === "waiting" && (
        <>
          <MultiParticipantPanel />
          <CharacterSelection onParticipantAdded={handleParticipantAdded} />
        </>
      )}

      {currentGame?.status === "results" && currentGame?.winnerId && (
        <div className="p-6 bg-gradient-to-br from-amber-900/20 to-yellow-900/20 border border-amber-600/40 rounded-lg backdrop-blur-sm shadow-xl shadow-amber-500/10">
          <div className="text-center">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-amber-400" />
            <h3 className="text-xl font-bold mb-2">Game Complete!</h3>
            {(() => {
              const winner = currentGame?.participants?.find(
                (p: any) => p._id === currentGame?.winnerId
              );
              const isPlayerWinner =
                winner && playerParticipants.some((p: any) => p._id === winner._id);
              return (
                <div>
                  <p className="text-lg mb-2">
                    Winner: <span className="text-yellow-400 font-bold">{winner?.displayName}</span>
                  </p>
                  {isPlayerWinner && (
                    <p className="text-green-400 font-bold">🎉 Congratulations! You won! 🎉</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
  */
}
