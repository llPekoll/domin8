import { useState, useCallback, useMemo } from "react";
import { Header } from "../components/Header";
import { CharacterSelection2 } from "../components/CharacterSelection2";
import { CreateLobby } from "../components/onevone/CreateLobby";
import { LobbyList } from "../components/onevone/LobbyList";
import { OneVOneFightScene } from "../components/onevone/OneVOneFightScene";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Character } from "../types/character";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
}

export function OneVOnePage() {
  const { connected, publicKey } = usePrivyWallet();
  
  // Track selected character for 1v1 lobbies
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  
  // Track which lobby we're currently fighting in (null = list view, number = fighting)
  const [fightingLobbyId, setFightingLobbyId] = useState<number | null>(null);
  
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
  const lobbyState = fightingLobbyId !== null 
    ? useQuery(api.lobbies.getLobbyState, { lobbyId: fightingLobbyId })
    : null;

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
  }, []);

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
        ) : currentView === "fighting" && lobbyState ? (
          // Fight view
          <div className="max-w-4xl mx-auto">
            <OneVOneFightScene
              lobby={lobbyState as LobbyData}
              onFightComplete={handleFightComplete}
              selectedCharacter={selectedCharacter}
            />
          </div>
        ) : (
          // Lobby list + create view
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
      </main>
    </div>
  );
}
