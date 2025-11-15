import { useEffect, useRef, useState } from "react";
import { EventBus } from "../../game/EventBus";
import type { Character } from "../../types/character";

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

interface OneVOneFightSceneProps {
  lobby: LobbyData;
  selectedCharacter: Character | null;
  onFightComplete?: () => void;
}

export function OneVOneFightScene({
  lobby,
  onFightComplete,
}: OneVOneFightSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fightStarted, setFightStarted] = useState(false);
  const [fightResult, setFightResult] = useState<{
    winner: string;
    loser: string;
  } | null>(null);

  useEffect(() => {
    // Handle when lobby status is resolved (fight data is ready)
    if (lobby.status === 1 && lobby.winner && !fightStarted) {
      // Start the fight with the resolved data
      const game = (window as any).phaserGame;
      if (game && game.scene) {
        const oneVOneScene = game.scene.getScene("OneVOne");
        if (oneVOneScene && typeof (oneVOneScene as any).startFight === "function") {
          const fightData = {
            lobbyId: lobby.lobbyId,
            playerA: lobby.playerA,
            playerB: lobby.playerB || "",
            characterA: lobby.characterA,
            characterB: lobby.characterB || 0,
            winner: lobby.winner,
            mapId: lobby.mapId,
          };

          (oneVOneScene as any).startFight(fightData);
          setFightStarted(true);
        }
      }
    }
  }, [lobby, fightStarted]);

  useEffect(() => {
    // Listen for 1v1 fight completion event
    const handleFightComplete = () => {
      setFightResult({
        winner: lobby.winner || "",
        loser: lobby.playerA === lobby.winner ? lobby.playerB || "" : lobby.playerA,
      });

      // Call parent callback after showing result
      const timer = setTimeout(() => {
        onFightComplete?.();
      }, 2000);

      return () => clearTimeout(timer);
    };

    EventBus.on("1v1-complete", handleFightComplete);

    return () => {
      EventBus.off("1v1-complete", handleFightComplete);
    };
  }, [lobby, onFightComplete]);

  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  return (
    <div className="w-full">
      {/* Phaser Game Container */}
      <div
        ref={containerRef}
        id="phaser-1v1-container"
        className="w-full aspect-video bg-black border-2 border-indigo-500 rounded-lg overflow-hidden mb-6"
      >
        {!fightStarted && (
          <div className="flex items-center justify-center w-full h-full">
            <div className="text-center">
              <p className="text-indigo-300 mb-2">Loading fight...</p>
              <div className="inline-block">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fight Result Message */}
      {fightResult && (
        <div className="text-center mb-6">
          <p className="text-3xl font-bold text-yellow-400">🎉 Fight Complete!</p>
          <p className="text-indigo-200 mt-2">
            Winner: {fightResult.winner.slice(0, 8)}...
          </p>
        </div>
      )}

      {/* Lobby Info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Player A */}
        <div className="bg-gray-900 border border-indigo-400/50 rounded-lg p-4">
          <p className="text-xs text-indigo-400 mb-2">Player A</p>
          <p className="text-indigo-200 font-mono text-sm mb-1">{lobby.playerA.slice(0, 12)}...</p>
          <p className="text-xs text-gray-400">Character: {lobby.characterA}</p>
        </div>

        {/* Player B */}
        <div className="bg-gray-900 border border-indigo-400/50 rounded-lg p-4">
          <p className="text-xs text-indigo-400 mb-2">Player B</p>
          <p className="text-indigo-200 font-mono text-sm mb-1">
            {lobby.playerB ? lobby.playerB.slice(0, 12) + "..." : "Waiting..."}
          </p>
          <p className="text-xs text-gray-400">
            Character: {lobby.characterB ?? "N/A"}
          </p>
        </div>
      </div>

      {/* Prize Info */}
      <div className="bg-gray-900 border border-indigo-500/50 rounded-lg p-4 text-center">
        <p className="text-indigo-400 text-sm mb-1">Pot</p>
        <p className="text-2xl font-bold text-yellow-400">
          {formatAmount(lobby.amount * 2)} SOL
        </p>
        <p className="text-xs text-gray-400 mt-2">House fee: 2% | Winner gets: {formatAmount(lobby.amount * 2 * 0.98)} SOL</p>
      </div>
    </div>
  );
}
