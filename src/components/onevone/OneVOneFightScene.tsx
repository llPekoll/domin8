import { useEffect, useRef, useState, useCallback } from "react";
import { EventBus } from "../../game/EventBus";
import type { Character } from "../../types/character";
import { usePrivyWallet } from "../../hooks/usePrivyWallet";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { logger } from "../../lib/logger";

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

interface OneVOneFightSceneProps {
  lobby: LobbyData;
  selectedCharacter: Character | null;
  onFightComplete?: () => void;
  onDoubleDown?: (amount: number) => void;
}

export function OneVOneFightScene({
  lobby,
  onFightComplete,
  onDoubleDown,
}: OneVOneFightSceneProps) {
  const { publicKey, wallet, connected } = usePrivyWallet();
  const containerRef = useRef<HTMLDivElement>(null);
  const [fightStarted, setFightStarted] = useState(false);
  const [fightResult, setFightResult] = useState<{
    winner: string;
    loser: string;
  } | null>(null);

  useEffect(() => {
    // Handle when lobby status is resolved (fight data is ready)
    // Status 2 = Resolved (Winner determined)
    if (lobby.status === 2 && lobby.winner && !fightStarted) {
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

      // Call parent callback after showing result (delayed)
      // If user won, we wait for them to decide (Double Down or Leave)
      // If user lost, we can auto-close or show "You Lost"
      
      if (lobby.winner !== publicKey?.toString()) {
          const timer = setTimeout(() => {
            onFightComplete?.();
          }, 3000);
          return () => clearTimeout(timer);
      }
    };

    EventBus.on("1v1-complete", handleFightComplete);

    return () => {
      EventBus.off("1v1-complete", handleFightComplete);
    };
  }, [lobby, onFightComplete, publicKey]);

  const formatAmount = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  // Status 2 = Resolved
  const isWinner = lobby.status === 2 && lobby.winner === publicKey?.toString();
  const prizeAmount = lobby.amount * 2 * 0.98; // Approximate prize

  return (
    <div className="relative w-full h-[600px] bg-black rounded-lg overflow-hidden" ref={containerRef}>
      {/* Phaser Game Container - This is where the game is rendered */}
      {/* Note: The actual Phaser game is rendered in the root div with id "phaser-game" */}
      {/* We just overlay UI on top of it here if needed, or this component acts as a controller */}
      
      {/* Overlay UI for Waiting State */}
      {lobby.status === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Waiting for Opponent...</h2>
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        </div>
      )}

      {/* Overlay UI for Awaiting VRF State */}
      {/* Status 1 = Awaiting VRF */}
      {lobby.status === 1 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Waiting for Oracle...</h2>
            <p className="text-gray-400 mb-4">Generating randomness for fair fight</p>
            <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-xs text-gray-500">This usually takes a few seconds...</p>
          </div>
        </div>
      )}

      {/* Result Overlay (Only shown after fight animation completes) */}
      {fightResult && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 animate-in fade-in duration-500">
          <div className="text-center p-8 bg-gray-900 border-2 border-indigo-500 rounded-xl max-w-md w-full">
            {isWinner ? (
              <>
                <h2 className="text-4xl font-black text-yellow-400 mb-2 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                  VICTORY!
                </h2>
                <p className="text-gray-300 mb-6">
                  You won <span className="text-white font-bold">{formatAmount(prizeAmount)} SOL</span>
                </p>
                
                <div className="space-y-3">
                  <button
                    onClick={() => onDoubleDown?.(prizeAmount)}
                    className="w-full py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold rounded-lg transform hover:scale-105 transition-all shadow-lg"
                  >
                    DOUBLE DOWN! (Bet {formatAmount(prizeAmount)} SOL)
                  </button>
                  
                  <button
                    onClick={onFightComplete}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-lg transition-colors"
                  >
                    Collect & Leave
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-black text-red-500 mb-2 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                  DEFEAT
                </h2>
                <p className="text-gray-400 mb-6">Better luck next time!</p>
                
                <button
                  onClick={onFightComplete}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Return to Lobby
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}