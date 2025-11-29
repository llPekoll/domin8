import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { CharacterSelection2 } from "../components/CharacterSelection2";
import { CreateLobby } from "../components/onevone/CreateLobby";
import { LobbyList } from "../components/onevone/LobbyList";
import { LobbyHistory } from "../components/onevone/LobbyHistory";
import { OneVOneArenaModal } from "../components/onevone/OneVOneArenaModal";
import { LobbyDetailsDialog } from "../components/onevone/LobbyDetailsDialog";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { useAssets } from "../contexts/AssetsContext";
import { setCharactersData } from "../game/main";
import type { Character } from "../types/character";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
  isPrivate?: boolean;
}

export function OneVOnePage() {
  const { connected, publicKey, wallet } = usePrivyWallet();
  const { characters } = useAssets();
  const createLobbyAction = useAction(api.lobbies.createLobby);
  const joinLobbyAction = useAction(api.lobbies.joinLobby);
  const [searchParams, setSearchParams] = useSearchParams();
  const [joiningSharedLobby, setJoiningSharedLobby] = useState(false);
  
  // Sync characters to Phaser's global state for CharacterPreviewScene
  useEffect(() => {
    if (characters && characters.length > 0) {
      logger.game.debug('[OneVOnePage] Syncing characters to Phaser global state', { count: characters.length });
      setCharactersData(characters);
    }
  }, [characters]);
  
  // Track selected character for 1v1 lobbies
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  
  // Arena modal state
  const [arenaModalOpen, setArenaModalOpen] = useState(false);
  const [activeLobbyId, setActiveLobbyId] = useState<number | null>(null);
  const [isCreator, setIsCreator] = useState(false); // true if user created the lobby
  
  // Shared lobby dialog state (opened via URL share link)
  const [sharedLobbyDialogOpen, setSharedLobbyDialogOpen] = useState(false);
  const shareToken = searchParams.get("join");
  
  // Get open lobbies from Convex (real-time updates)
  const openLobbies = useQuery(api.lobbies.getOpenLobbies) || [];
  
  // Get lobby by share token (for URL-based access)
  const sharedLobby = useQuery(
    api.lobbies.getLobbyByShareToken,
    shareToken ? { shareToken } : "skip"
  );
  
  // Get completed lobbies for history
  const completedLobbies = useQuery(api.lobbies.getCompletedLobbies, { limit: 20 }) || [];
  
  // Get specific lobby state when in arena (for real-time updates during fight)
  const lobbyStateQuery = useQuery(
    api.lobbies.getLobbyState, 
    activeLobbyId !== null ? { lobbyId: activeLobbyId } : "skip"
  );
  
  // Only use the lobby state if modal is open
  const activeLobbyState = arenaModalOpen && activeLobbyId !== null ? lobbyStateQuery : null;

  // Handle share link URL parameter - open lobby details dialog when navigating via share link
  useEffect(() => {
    if (shareToken && sharedLobby) {
      if (sharedLobby.status === 0) {
        // Lobby is open and available to join
        logger.ui.info("[1v1] Opening shared lobby from URL", { shareToken, lobbyId: sharedLobby.lobbyId });
        setSharedLobbyDialogOpen(true);
      } else {
        // Lobby is no longer available (already joined or resolved)
        toast.error("This lobby is no longer available");
        // Clear the URL parameter
        setSearchParams({});
      }
    }
  }, [shareToken, sharedLobby, setSearchParams]);

  // Handle closing shared lobby dialog - clear URL parameter
  const handleSharedLobbyDialogClose = useCallback(() => {
    setSharedLobbyDialogOpen(false);
    setSearchParams({});
  }, [setSearchParams]);

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
    // Close shared lobby dialog and clear URL param if open
    setSharedLobbyDialogOpen(false);
    setSearchParams({});
  }, [setSearchParams]);

  // Handle joining a shared lobby (from LobbyDetailsDialog opened via URL)
  const handleJoinSharedLobby = useCallback(async (lobbyId: number) => {
    if (!connected || !selectedCharacter || !wallet || !publicKey || !sharedLobby) {
      toast.error("Please connect wallet and select a character");
      return;
    }

    if (sharedLobby.playerA === publicKey.toString()) {
      toast.error("You cannot join your own lobby");
      return;
    }

    setJoiningSharedLobby(true);

    try {
      // Import utilities
      const { getSharedConnection } = await import("../lib/sharedConnection");
      const { buildJoinLobbyTransaction } = await import("../lib/solana-1v1-transactions");
      const { PublicKey } = await import("@solana/web3.js");

      const connection = getSharedConnection();
      const currentWallet = publicKey.toString();

      logger.ui.info("[1v1] Joining shared lobby", {
        lobbyId: sharedLobby.lobbyId,
        playerB: currentWallet,
        character: selectedCharacter.id,
      });

      const lobbyPda = new PublicKey(sharedLobby.lobbyPda);
      const transaction = await buildJoinLobbyTransaction(
        publicKey,
        sharedLobby.lobbyId,
        selectedCharacter.id,
        lobbyPda,
        connection
      );

      logger.solana.debug("[1v1] Transaction ready for signing", {
        type: transaction.constructor.name,
      });

      // Sign and send using Privy's signAndSendAllTransactions
      logger.solana.info("[1v1] Attempting to sign transaction with Privy wallet...");
      
      const chainId = `solana:devnet` as `${string}:${string}`;
      const serialized = Buffer.from(transaction.serialize());
      
      let signAndSendResult;
      try {
        signAndSendResult = await wallet.signAndSendAllTransactions([
          {
            chain: chainId,
            transaction: serialized,
          },
        ]);
      } catch (privyError: unknown) {
        const errorMessage = privyError instanceof Error ? privyError.message : String(privyError);
        logger.solana.error("[1v1] Privy wallet error:", { message: errorMessage });
        throw new Error(`Privy wallet error: ${errorMessage}`);
      }
      
      if (!signAndSendResult || signAndSendResult.length === 0) {
        throw new Error("Failed to get signature from Privy wallet");
      }
      
      const signatureBytes = signAndSendResult[0].signature;
      if (!signatureBytes) {
        throw new Error("No signature in Privy response");
      }
      
      // Import bs58 for signature encoding
      const { default: bs58 } = await import("bs58");
      const signature = bs58.encode(signatureBytes);
      
      logger.solana.info("[1v1] Join transaction signed and sent", { signature });
      toast.loading("Waiting for transaction confirmation...", { id: "join-tx-confirm" });
      
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error("Transaction failed: " + confirmation.value.err.toString());
      }

      toast.success("Transaction confirmed!", { id: "join-tx-confirm" });
      logger.ui.info("[1v1] Join transaction confirmed on blockchain", { signature });

      // Call Convex action to update lobby in database
      const result = await joinLobbyAction({
        playerBWallet: currentWallet,
        lobbyId: sharedLobby.lobbyId,
        characterB: selectedCharacter.id,
        transactionHash: signature,
      });

      if (result.success) {
        logger.ui.info("[1v1] Lobby joined successfully", { lobbyId: result.lobbyId });
        toast.success("You joined the lobby! Starting fight...", { duration: 5000 });
        
        // Open the arena modal
        handleLobbyJoined(result.lobbyId);
      } else {
        toast.error("Failed to update lobby in database");
        logger.ui.error("[1v1] Convex action failed");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.ui.error("[1v1] Failed to join shared lobby:", error);
      toast.error("Failed to join lobby: " + errorMsg);
    } finally {
      setJoiningSharedLobby(false);
    }
  }, [connected, wallet, publicKey, selectedCharacter, sharedLobby, joinLobbyAction, handleLobbyJoined]);

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

  return (
    <div className="min-h-screen w-full bg-gray-950">
      <Header />
      
      {/* Character Selection (fixed, always visible) */}
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <CharacterSelection2 onCharacterSelected={handleCharacterSelected} />
      </div>

      {/* Main Content Area - Always show lobby list */}
      <main className="pt-16 pb-32 px-4 ">
        {!connected || !publicKey ? (
          // Not connected view
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-indigo-200 mb-4">1v1 Coinflip</h1>
              <p className="text-indigo-300 mb-4">Connect your wallet to play</p>
            </div>
          </div>
        ) : (
          <>
            <div className="ml-18">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
                {/* Create Lobby Section */}
                <div>
                  <CreateLobby
                    selectedCharacter={selectedCharacter}
                    onLobbyCreated={handleLobbyCreated}
                  />
                </div>

                {/* Open Lobbies List */}
                <div className="lg:col-span-3">
                  <LobbyList
                    lobbies={openLobbies as LobbyData[]}
                    currentPlayerWallet={publicKey?.toString() || ""}
                    selectedCharacter={selectedCharacter}
                    onLobbyJoined={handleLobbyJoined}
                    onLobbyCancelled={handleLobbyCancelled}
                  />
                  </div>
                  
                  {/* Lobby History */}
                  <div className="lg:col-span-2">
                    <LobbyHistory lobbies={completedLobbies as LobbyData[]} maxLobbies={50} />
                  </div>
                </div>
              </div>
            
          </>
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

      {/* Shared Lobby Dialog - Opens when navigating via share link */}
      <LobbyDetailsDialog
        isOpen={sharedLobbyDialogOpen && !!sharedLobby}
        onClose={handleSharedLobbyDialogClose}
        lobby={sharedLobby as LobbyData | null}
        currentPlayerWallet={publicKey?.toString() || ""}
        selectedCharacter={selectedCharacter}
        onJoin={handleJoinSharedLobby}
        onCancel={handleLobbyCancelled}
      />
    </div>
  );
}