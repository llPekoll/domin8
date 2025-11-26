import { useState, useCallback, useMemo } from "react";
import { Header } from "../components/Header";
import { CharacterSelection2 } from "../components/CharacterSelection2";
import { CreateLobby } from "../components/onevone/CreateLobby";
import { LobbyList } from "../components/onevone/LobbyList";
import { LobbyHistory } from "../components/onevone/LobbyHistory";
import { OneVOneArenaModal } from "../components/onevone/OneVOneArenaModal";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import type { Character } from "../types/character";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
}

export function OneVOnePage() {
  const { connected, publicKey, wallet } = usePrivyWallet();
  const createLobbyAction = useAction(api.lobbies.createLobby);
  
  // Track selected character for 1v1 lobbies
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  
  // Arena modal state
  const [arenaModalOpen, setArenaModalOpen] = useState(false);
  const [activeLobbyId, setActiveLobbyId] = useState<number | null>(null);
  const [isCreator, setIsCreator] = useState(false); // true if user created the lobby
  
  // Get open lobbies from Convex (real-time updates)
  const openLobbies = useQuery(api.lobbies.getOpenLobbies) || [];
  
  // Get completed lobbies for history
  const completedLobbies = useQuery(api.lobbies.getCompletedLobbies, { limit: 20 }) || [];
  
  // Get user's personal lobbies (for cancel functionality)
  // Must always pass a value to useQuery - pass empty string as default
  const userLobbies = useQuery(
    api.lobbies.getPlayerLobbies,
    publicKey ? { playerWallet: publicKey.toString() } : { playerWallet: "" }
  );
  
  const userOpenLobbies = useMemo(() => {
    if (!publicKey || !userLobbies?.asPlayerA) return [];
    // Filter to only lobbies user created (as Player A) that are still open (status = 0)
    return userLobbies.asPlayerA.filter((l: any) => l.status === 0);
  }, [publicKey, userLobbies]);
  
  // Get specific lobby state when in arena (for real-time updates during fight)
  const lobbyStateQuery = useQuery(
    api.lobbies.getLobbyState, 
    activeLobbyId !== null ? { lobbyId: activeLobbyId } : "skip"
  );
  
  // Only use the lobby state if modal is open
  const activeLobbyState = arenaModalOpen && activeLobbyId !== null ? lobbyStateQuery : null;

  const handleCharacterSelected = useCallback((character: Character | null) => {
    setSelectedCharacter(character);
  }, []);

  // When user creates a lobby, open the arena modal
  const handleLobbyCreated = useCallback((lobbyId: number) => {
    logger.ui.info("[1v1] Lobby created, opening arena modal", { lobbyId });
    setActiveLobbyId(lobbyId);
    setIsCreator(true);
    setArenaModalOpen(true);
  }, []);

  const handleLobbyCancelled = useCallback((lobbyId: number) => {
    // Lobby was cancelled - close modal if viewing this lobby
    logger.ui.info("[1v1] Lobby cancelled", { lobbyId });
    if (activeLobbyId === lobbyId) {
      setArenaModalOpen(false);
      setActiveLobbyId(null);
    }
  }, [activeLobbyId]);

  // When user joins a lobby, open the arena modal
  const handleLobbyJoined = useCallback((lobbyId: number) => {
    logger.ui.info("[1v1] Joined lobby, opening arena modal", { lobbyId });
    setActiveLobbyId(lobbyId);
    setIsCreator(false);
    setArenaModalOpen(true);
  }, []);

  // Handle arena modal close
  const handleArenaClose = useCallback(() => {
    setArenaModalOpen(false);
    // Keep activeLobbyId for a moment in case user wants to reopen
  }, []);

  // Handle fight completion (from modal)
  const handleFightComplete = useCallback(() => {
    logger.ui.info("[1v1] Fight complete");
    setArenaModalOpen(false);
    setActiveLobbyId(null);
  }, []);

  // Double down handler for winner
  const handleDoubleDown = useCallback(async (amount: number) => {
    if (!connected || !publicKey || !selectedCharacter || !wallet) {
      toast.error("Please connect wallet and select a character");
      return;
    }

    logger.ui.info("Double Down requested", { amount });
    const toastId = toast.loading("Processing Double Down...");

    try {
      // Import utilities
      const { getSharedConnection } = await import("../lib/sharedConnection");
      const { buildCreateLobbyTransaction } = await import("../lib/solana-1v1-transactions");

      const connection = getSharedConnection();
      
      // Build create_lobby transaction
      const transaction = await buildCreateLobbyTransaction(
        publicKey,
        amount, // Amount is already in lamports
        selectedCharacter.id,
        0, // Default map ID
        connection
      );

      // Serialize transaction for Privy
      const serializedTx = transaction.serialize();

      // Sign and send via Privy
      const txResult = await wallet.signAndSendTransaction({
        transaction: serializedTx,
        chain: "solana:mainnet",
      });

      // Handle signature - could be string or Uint8Array
      let signature: string;
      if (typeof txResult.signature === "string") {
        signature = txResult.signature;
      } else if (txResult.signature instanceof Uint8Array) {
        const bs58 = await import("bs58");
        signature = bs58.default.encode(txResult.signature);
      } else {
        throw new Error("Invalid signature format from wallet");
      }

      logger.solana.info("Double Down transaction sent", { signature });
      toast.loading("Confirming Double Down transaction...", { id: toastId });

      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      
      if (confirmation.value.err) {
          throw new Error("Transaction failed: " + confirmation.value.err.toString());
      }

      logger.solana.info("Double Down confirmed", { signature });

      // Call Convex action to create lobby
      const result = await createLobbyAction({
        playerAWallet: publicKey.toString(),
        amount: amount,
        characterA: selectedCharacter.id,
        mapId: 0,
        transactionHash: signature,
      });

      if (result.success) {
        toast.success(`Double Down successful! Lobby #${result.lobbyId} created.`, { id: toastId });
        // Open the new lobby in the arena
        setActiveLobbyId(result.lobbyId);
        setIsCreator(true);
        // Modal stays open with new lobby
      } else {
        throw new Error("Failed to create lobby in database");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.ui.error("Double Down failed:", error);
      toast.error("Double Down failed: " + errorMsg, { id: toastId });
    }
  }, [connected, publicKey, selectedCharacter, wallet, createLobbyAction]);

  // Allow user to click on their own waiting lobby to reopen modal
  const handleViewOwnLobby = useCallback((lobbyId: number) => {
    logger.ui.info("[1v1] Viewing own lobby", { lobbyId });
    setActiveLobbyId(lobbyId);
    setIsCreator(true);
    setArenaModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen w-full bg-gray-950">
      <Header />
      
      {/* Character Selection (fixed, always visible) */}
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <CharacterSelection2 onCharacterSelected={handleCharacterSelected} />
      </div>

      {/* Main Content Area - Always show lobby list */}
      <main className="pt-16 pb-32 px-4 container mx-auto">
        {!connected || !publicKey ? (
          // Not connected view
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-indigo-200 mb-4">1v1 Coinflip</h1>
              <p className="text-indigo-300 mb-4">Connect your wallet to play</p>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Create Lobby Section */}
              <div>
                <CreateLobby
                  selectedCharacter={selectedCharacter}
                  onLobbyCreated={handleLobbyCreated}
                  userOpenLobbies={userOpenLobbies}
                  onLobbyCancelled={handleLobbyCancelled}
                  onViewLobby={handleViewOwnLobby}
                />
              </div>

              {/* Open Lobbies List */}
              <div className="lg:col-span-2">
                <LobbyList
                  lobbies={openLobbies as LobbyData[]}
                  currentPlayerWallet={publicKey?.toString() || ""}
                  selectedCharacter={selectedCharacter}
                  onLobbyJoined={handleLobbyJoined}
                />
              </div>

              {/* Lobby History */}
              <div>
                <LobbyHistory lobbies={completedLobbies as LobbyData[]} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Arena Modal - Shows the Phaser game in a dialog */}
      <OneVOneArenaModal
        isOpen={arenaModalOpen}
        onClose={handleArenaClose}
        lobby={activeLobbyState as LobbyData | null}
        selectedCharacter={selectedCharacter}
        isCreator={isCreator}
        onFightComplete={handleFightComplete}
        onDoubleDown={handleDoubleDown}
      />
    </div>
  );
}