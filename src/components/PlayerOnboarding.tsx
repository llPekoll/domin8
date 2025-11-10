import { useQuery, useMutation } from "convex/react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { toast } from "sonner";
import { generateRandomName } from "../lib/nameGenerator";
import { Users } from "lucide-react";
import { logger } from "../lib/logger";

export function PlayerOnboarding() {
  const { connected, publicKey, externalWalletAddress } = usePrivyWallet();

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
        randomName,
        "external wallet:",
        externalWalletAddress || "none (email/social login)"
      );

      await createPlayer({
        walletAddress: publicKey.toString(),
        displayName: randomName,
        externalWalletAddress: externalWalletAddress || undefined,
      });
      toast.success(
        `Player created! Your display name is: ${randomName}. You've been given a random character and 1000 starting coins.`
      );
    } catch (error) {
      logger.ui.error("Failed to create player:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create player");
    }
  };

  // Don't render anything if player already exists
  if (playerData) {
    return null;
  }

  // Show connect wallet message if not connected
  if (!connected) {
    return (
      <Card className="p-4 text-center bg-amber-950 border-2 border-yellow-300">
        <p className="text-xl text-yellow-400">Connect wallet to join</p>
      </Card>
    );
  }

  // If wallet is connected but playerData is undefined, query is still loading
  if (connected && playerData === undefined) {
    return (
      <Card className="p-4 bg-amber-950 border-2 border-yellow-300">
        <div className="flex justify-center items-center min-h-[120px]">
          <div className="animate-spin rounded-full h-8 w-8 "></div>
        </div>
      </Card>
    );
  }

  // Show create player UI when:
  // - Wallet is connected
  // - Query has completed (playerData is not undefined)
  // - Player doesn't exist (playerData is null)
  if (connected && playerData === null) {
    return (
      <Card className="p-6 text-center mb-4">
        <Users className="w-12 h-12 mx-auto mb-4 text-blue-400" />
        <h2 className="text-xl font-bold mb-2">Welcome to Royal Rumble!</h2>
        <p className="text-gray-400 mb-4">Create your player profile to start battling</p>
        <Button onClick={() => void handleCreatePlayer()} size="lg">
          Create Player Profile
        </Button>
      </Card>
    );
  }

  return null;
}
