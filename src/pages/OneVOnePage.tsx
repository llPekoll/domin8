import { useState, useCallback, useMemo } from "react";
import { Header } from "../components/Header";
import { CharacterSelection2 } from "../components/CharacterSelection2";
import { CreateLobby } from "../components/onevone/CreateLobby";
import { LobbyList } from "../components/onevone/LobbyList";
import { OneVOneFightScene } from "../components/onevone/OneVOneFightScene";
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
  
  // Track which lobby we're currently fighting in (null = list view, number = fighting)
  const [fightingLobbyId, setFightingLobbyId] = useState<number | null>(null);
  const [isArenaMinimized, setIsArenaMinimized] = useState(false);
  
  // Get open lobbies from Convex (real-time updates)
  const openLobbies = useQuery(api.lobbies.getOpenLobbies) || [];
  
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
  
  // Get specific lobby state when fighting (for real-time updates during fight)
  // Must always call useQuery unconditionally - use fightingLobbyId || 0 as fallback
  const lobbyStateQuery = useQuery(
    api.lobbies.getLobbyState, 
    fightingLobbyId !== null ? { lobbyId: fightingLobbyId } : "skip"
  );
  
  // Only use the lobby state if we're actually fighting
  const lobbyState = fightingLobbyId !== null ? lobbyStateQuery : null;

  const handleCharacterSelected = useCallback((character: Character | null) => {
    setSelectedCharacter(character);
  }, []);

  const handleLobbyCreated = useCallback((lobbyId: number) => {
    // After creating a lobby, stay on the list so they can see it
    console.log("[1v1] Lobby created:", lobbyId);
  }, []);

  const handleLobbyCancelled = useCallback((lobbyId: number) => {
    // Lobby was cancelled - the component will automatically refresh
    console.log("[1v1] Lobby cancelled:", lobbyId);
  }, []);

  const handleLobbyJoined = useCallback((lobbyId: number) => {
    // Player B joined, transition to fight view
    setFightingLobbyId(lobbyId);
  }, []);

  const handleFightComplete = useCallback(() => {
    // Fight finished, go back to list view
    setFightingLobbyId(null);
    setIsArenaMinimized(false);
  }, []);

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
      const { Keypair } = await import("@solana/web3.js");

      const connection = getSharedConnection();
      
      // Generate a random 32-byte seed for ORAO VRF
      const forceKeypair = Keypair.generate();
      const forceSeed = forceKeypair.publicKey.toBase58();

      logger.solana.debug("Generated force seed for Double Down", { forceSeed });

      // Build create_lobby transaction
      const transaction = await buildCreateLobbyTransaction(
        publicKey,
        amount, // Amount is already in lamports
        selectedCharacter.id,
        0, // Default map ID
        forceSeed,
        connection
      );

      // Serialize transaction for Privy (must be Uint8Array, not VersionedTransaction object)
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
        // Convert Uint8Array to base58
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
        forceSeed: forceSeed,
      });

      if (result.success) {
        toast.success(`Double Down successful! Lobby #${result.lobbyId} created.`, { id: toastId });
        // Transition to the new lobby? Or just show it in the list?
        // For now, let's just go back to list view (which happens automatically if we don't set fightingLobbyId)
        // But maybe we want to auto-minimize the arena or something?
        setFightingLobbyId(null); // Ensure we exit the previous fight view
      } else {
        throw new Error("Failed to create lobby in database");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.ui.error("Double Down failed:", error);
      toast.error("Double Down failed: " + errorMsg, { id: toastId });
    }
  }, [connected, publicKey, selectedCharacter, wallet, createLobbyAction]);

  // Determine which view to show
  const currentView = useMemo(() => {
    if (!connected || !publicKey) {
      return "not-connected";
    }
    
    if (fightingLobbyId !== null && lobbyState) {
      return "fighting";
    }
    
    return "lobby-list";
  }, [connected, publicKey, fightingLobbyId, lobbyState]);

  return (
    <div className="min-h-screen w-full bg-black">
      <Header />
      
      {/* Character Selection (fixed, always visible) */}
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <CharacterSelection2 onCharacterSelected={handleCharacterSelected} />
      </div>

      {/* Main Content Area */}
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
          <>
            {/* Lobby list + create view (Show if not fighting OR if fighting but minimized) */}
            {(currentView !== "fighting" || isArenaMinimized) && (
              <div className="max-w-4xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Create Lobby Section */}
                  <div>
                    <CreateLobby
                      selectedCharacter={selectedCharacter}
                      onLobbyCreated={handleLobbyCreated}
                      userOpenLobbies={userOpenLobbies}
                      onLobbyCancelled={handleLobbyCancelled}
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
                </div>
              </div>
            )}

            {/* Fight view (Show if fighting) */}
            {currentView === "fighting" && lobbyState && (
              <div className={isArenaMinimized ? "fixed bottom-24 right-4 w-96 z-50 shadow-2xl transition-all duration-300" : "max-w-4xl mx-auto transition-all duration-300"}>
                 <div className="bg-black border border-indigo-500 rounded-lg overflow-hidden">
                     <div className="flex justify-between items-center p-2 bg-indigo-900/80 border-b border-indigo-500/50">
                         <span className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                             Lobby #{lobbyState.lobbyId}
                         </span>
                         <button 
                             onClick={() => setIsArenaMinimized(!isArenaMinimized)}
                             className="text-xs bg-indigo-800 hover:bg-indigo-700 text-white px-3 py-1 rounded border border-indigo-600 transition-colors"
                         >
                             {isArenaMinimized ? "Maximize Arena" : "Minimize"}
                         </button>
                     </div>
                     <OneVOneFightScene
                        lobby={lobbyState as LobbyData}
                        onFightComplete={handleFightComplete}
                        selectedCharacter={selectedCharacter}
                        onDoubleDown={handleDoubleDown}
                     />
                 </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
