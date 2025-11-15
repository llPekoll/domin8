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
      {/* Header: Status and Fight Info */}
      <div className="mb-4 text-center">
        <h2 className="text-2xl font-bold text-indigo-400 mb-1">1v1 Coinflip Battle</h2>
        <p className="text-xs text-gray-400">
          Lobby #{lobby.lobbyId} • {lobby.status === 0 ? "Pending..." : "Fighting..."}
        </p>
      </div>

      {/* Phaser Game Container */}
      <div
        ref={containerRef}
        id="phaser-1v1-container"
        className="w-full aspect-video bg-black border-2 border-indigo-500 rounded-lg overflow-hidden mb-6 relative"
      >
        {!fightStarted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center">
              <p className="text-indigo-300 mb-4 text-lg">Initializing Arena...</p>
              <div className="inline-block">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fight Result Message */}
      {fightResult && (
        <div className="bg-gradient-to-r from-yellow-900 to-orange-900 border-2 border-yellow-400 rounded-lg p-6 mb-6 text-center animate-pulse">
          <p className="text-4xl font-bold text-yellow-300 mb-2">� VICTORY! 🏆</p>
          <p className="text-indigo-200 mb-2">
            Winner: <span className="font-mono text-yellow-400">{fightResult.winner.slice(0, 16)}...</span>
          </p>
          <p className="text-yellow-400 text-sm">
            Prize Pool: {formatAmount(lobby.amount * 2 * 0.98)} SOL
          </p>
        </div>
      )}

      {/* Player Battle Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Player A */}
        <div className={`rounded-lg p-4 transition-all ${
          lobby.status === 1 && lobby.winner === lobby.playerA 
            ? "bg-green-900/50 border-2 border-green-400" 
            : "bg-gray-900 border border-indigo-400/50"
        }`}>
          <p className="text-xs text-indigo-400 mb-2 font-semibold">PLAYER A</p>
          <p className="text-indigo-200 font-mono text-xs mb-2 break-all">{lobby.playerA.slice(0, 20)}...</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Character:</span>
            <span className="text-xs text-indigo-300 font-bold">#{lobby.characterA}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">Bet:</span>
            <span className="text-xs text-yellow-400 font-bold">{formatAmount(lobby.amount)} SOL</span>
          </div>
          {lobby.status === 1 && lobby.winner === lobby.playerA && (
            <p className="text-xs text-green-400 font-bold mt-2">✓ WINNER</p>
          )}
        </div>

        {/* Player B */}
        <div className={`rounded-lg p-4 transition-all ${
          lobby.status === 1 && lobby.winner === lobby.playerB 
            ? "bg-green-900/50 border-2 border-green-400" 
            : "bg-gray-900 border border-indigo-400/50"
        }`}>
          <p className="text-xs text-indigo-400 mb-2 font-semibold">PLAYER B</p>
          <p className="text-indigo-200 font-mono text-xs mb-2 break-all">
            {lobby.playerB ? lobby.playerB.slice(0, 20) + "..." : "Waiting for opponent..."}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Character:</span>
            <span className="text-xs text-indigo-300 font-bold">
              {lobby.characterB !== undefined ? `#${lobby.characterB}` : "TBD"}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">Bet:</span>
            <span className="text-xs text-yellow-400 font-bold">{formatAmount(lobby.amount)} SOL</span>
          </div>
          {lobby.status === 1 && lobby.winner === lobby.playerB && (
            <p className="text-xs text-green-400 font-bold mt-2">✓ WINNER</p>
          )}
        </div>
      </div>

      {/* Prize Pool Info */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 border border-indigo-500/50 rounded-lg p-4 text-center">
        <div className="grid grid-cols-3 gap-4">
          {/* Total Pot */}
          <div>
            <p className="text-xs text-indigo-400 mb-1">TOTAL POT</p>
            <p className="text-xl font-bold text-yellow-400">
              {formatAmount(lobby.amount * 2)} SOL
            </p>
          </div>

          {/* House Fee */}
          <div>
            <p className="text-xs text-indigo-400 mb-1">HOUSE FEE</p>
            <p className="text-lg font-bold text-red-400">
              {formatAmount(lobby.amount * 2 * 0.02)} SOL
            </p>
          </div>

          {/* Winner Prize */}
          <div>
            <p className="text-xs text-indigo-400 mb-1">WINNER PRIZE</p>
            <p className="text-lg font-bold text-green-400">
              {formatAmount(lobby.amount * 2 * 0.98)} SOL
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
