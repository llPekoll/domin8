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
  forceSeed?: string;
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
  const settleLobbyAction = useAction(api.lobbies.settleLobby);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fightStarted, setFightStarted] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [fightResult, setFightResult] = useState<{
    winner: string;
    loser: string;
  } | null>(null);

  const handleSettle = useCallback(async () => {
    if (!connected || !wallet || !lobby.forceSeed || !publicKey) return;
    
    setIsSettling(true);
    const toastId = toast.loading("Settling lobby...");

    try {
        const { getSharedConnection } = await import("../../lib/sharedConnection");
        const { buildSettleLobbyTransaction } = await import("../../lib/solana-1v1-transactions");
        const { PublicKey } = await import("@solana/web3.js");

        const connection = getSharedConnection();
        const lobbyPda = new PublicKey(lobby.lobbyPda);

        // Build settle transaction
        const transaction = await buildSettleLobbyTransaction(
            new PublicKey(publicKey),
            lobby.lobbyId,
            lobbyPda,
            lobby.forceSeed,
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

        logger.ui.info("Settle transaction sent", { signature });
        toast.loading("Confirming settlement...", { id: toastId });

        const confirmation = await connection.confirmTransaction(signature, "confirmed");
        
        if (confirmation.value.err) {
            throw new Error("Transaction failed: " + confirmation.value.err.toString());
        }

        logger.ui.info("Settle confirmed", { signature });

        // Call Convex action
        const result = await settleLobbyAction({
            lobbyId: lobby.lobbyId,
            transactionHash: signature,
        });

        if (result.success) {
            toast.success("Lobby settled! Fight starting...", { id: toastId });
        } else {
            throw new Error("Failed to update lobby in database");
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // If error is "Randomness not ready", we should tell the user to wait
        if (errorMsg.includes("Randomness not ready") || errorMsg.includes("0x1771")) { // 0x1771 is ORAO RandomnessNotReady
             toast.info("Oracle is still generating randomness. Please wait a moment and try again.", { id: toastId });
        } else {
             logger.ui.error("Settle failed:", error);
             toast.error("Settle failed: " + errorMsg, { id: toastId });
        }
    } finally {
        setIsSettling(false);
    }
  }, [connected, wallet, lobby, publicKey, settleLobbyAction]);

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

  const isWinner = lobby.status === 1 && lobby.winner === publicKey?.toString();
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
      {lobby.status === 2 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Waiting for Oracle...</h2>
            <p className="text-gray-400 mb-4">Generating randomness for fair fight</p>
            <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            
            <button 
                onClick={handleSettle}
                disabled={isSettling}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white rounded font-bold transition-colors"
            >
                {isSettling ? "Settling..." : "Settle Lobby"}
            </button>
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
