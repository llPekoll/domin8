import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useActiveGame } from "../hooks/useActiveGame";
import { usePlayerNames } from "../contexts/PlayerNamesContext";
import { useMemo, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChevronDown, ChevronUp, Crown } from "lucide-react";

export function MultiParticipantPanel() {
  const { walletAddress } = usePrivyWallet();
  const { activeGame, isLoading } = useActiveGame();
  const { playerNames } = usePlayerNames();
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate total pot
  const totalPot = useMemo(() => {
    if (!activeGame?.totalDeposit) return 0;
    return activeGame.totalDeposit.toNumber();
  }, [activeGame]);

  // Transform blockchain bet data into participant format
  const participants = useMemo(() => {
    if (!activeGame?.bets || !activeGame?.wallets) return [];
    
    // Get host wallet (first wallet in the array)
    const hostWallet = activeGame.wallets[0]?.toString();

    return activeGame.bets.map((bet, index) => {
      const wallet = activeGame.wallets[bet.walletIndex];
      const walletStr = wallet?.toString() || "";
      const amount = bet.amount.toNumber();
      const winChance = totalPot > 0 ? (amount / totalPot) * 100 : 0;

      // Find player name from playerNames context
      const playerData = playerNames?.find((p: any) => p.walletAddress === walletStr);
      const displayName = playerData?.displayName || `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}`;
      
      // Check if this participant is the host
      const isHost = walletStr === hostWallet;

      return {
        id: index,
        walletAddress: walletStr,
        displayName,
        amount,
        winChance,
        isOwn: walletStr === walletAddress,
        isHost, // Add host flag
      };
    });
  }, [activeGame, totalPot, playerNames, walletAddress]);

  // Don't show panel if no game or loading
  if (isLoading || !activeGame || participants.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-60 z-50">
      <div className="bg-black/40 backdrop-blur-sm rounded-lg shadow-sm">
        {/* Total Pot Header */}
        <div className="p-2 border-b border-amber-500/30">
          <div className="flex justify-between items-center">
            <div className="font-bold text-amber-300 text-sm uppercase tracking-wide leading-tight">
              Round #
              {activeGame.roundId?.toString() ||
              activeGame.gameRound?.toString() ||
              "?"}
            </div>
            <div className="flex-1 text-center">
              <div className="text-amber-400 text-xs uppercase tracking-wider">Pot</div>
              <div className="text-xl font-bold text-amber-300">
          {(totalPot / LAMPORTS_PER_SOL).toFixed(3)} SOL
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-amber-400 hover:text-amber-300 transition-colors ml-2"
              aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
            >
              {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
              ) : (
          <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Participants List */}
        {isExpanded && (
          <div className="p-2 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {participants.map((participant) => (
            <div
              key={participant.id}
              className={`
                flex items-center justify-between p-2 rounded-lg
                ${participant.isOwn 
                  ? "bg-green-900/30 border border-green-500/40" 
                  : "bg-amber-900/20 border border-amber-500/20"
                }
              `}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-amber-100 text-sm truncate">
                    {participant.displayName}
                  </span>
                  {participant.isOwn && (
                    <span className="text-green-400 text-xs">(You)</span>
                  )}
                  {participant.isHost && (
                    <div 
                      className="inline-flex items-center gap-1 bg-gradient-to-r from-yellow-500/90 to-amber-600/90 px-1.5 py-0.5 rounded text-xs font-bold text-amber-950 shadow-sm"
                      title="Game Host"
                    >
                      <Crown className="w-3 h-3 fill-current" />
                      <span className="tracking-wide">HOST</span>
                    </div>
                  )}
                </div>
                <div className="text-amber-400 text-xs">
                  {(participant.amount / LAMPORTS_PER_SOL).toFixed(3)} SOL
                </div>
              </div>

              <div className="text-right ml-3">
                <div className="text-xl font-bold text-amber-300">
                  {participant.winChance.toFixed(1)}%
                </div>
                <div className="text-amber-500 text-xs uppercase tracking-wide">
                  Win
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
