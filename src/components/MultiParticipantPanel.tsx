import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useActiveGame } from "../hooks/useActiveGame";
import { Users, Swords, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function MultiParticipantPanel() {
  const { walletAddress } = usePrivyWallet();
  const { activeGame, isLoading } = useActiveGame();
  const [isExpanded, setIsExpanded] = useState(true);

  // Transform blockchain bet data into participant format
  const participants = useMemo(() => {
    if (!activeGame?.bets || !activeGame?.wallets) return [];

    return activeGame.bets.map((bet, index) => {
      const wallet = activeGame.wallets[bet.walletIndex];
      return {
        id: index,
        walletAddress: wallet?.toString() || "",
        amount: bet.amount.toNumber(),
        skin: bet.skin,
        position: bet.position,
        isEliminated: false, // TODO: Track elimination status from game state
      };
    });
  }, [activeGame]);

  const currentParticipantCount = participants.length;

  const totalPot = useMemo(() => {
    if (!activeGame?.totalDeposit) return 0;
    return activeGame.totalDeposit.toNumber();
  }, [activeGame]);

  // Don't show panel if no game or loading
  if (isLoading || !activeGame || participants.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 z-50">
      <div className="bg-gradient-to-b from-amber-900/95 to-amber-950/95 backdrop-blur-sm rounded-lg border-2 border-amber-600/60 shadow-2xl shadow-amber-900/50">
        <div className="p-3 border-b border-amber-700/50">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2 text-amber-300 uppercase tracking-wide">
              <Swords className="w-4 h-4 text-amber-400" />
              Arena Combatants
            </h3>
            <div className="flex items-center gap-3">
              <div className="text-xs text-amber-400">
                <Users className="w-3 h-3 inline mr-1" />
                {currentParticipantCount}
              </div>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-amber-400 hover:text-amber-300 transition-colors"
                aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {isExpanded && (
          <>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <div className="p-3 space-y-2">
                {participants.map((participant) => {
                  const isOwn = participant.walletAddress === walletAddress;
                  const isEliminated = participant.isEliminated;
                  // Calculate win percentage based on bet amount
                  const winPercentage =
                    totalPot > 0 ? ((participant.amount / totalPot) * 100).toFixed(1) : "0.0";

                  // Format wallet address for display
                  const displayAddress =
                    participant.walletAddress.slice(0, 4) +
                    "..." +
                    participant.walletAddress.slice(-4);

                  return (
                    <div
                      key={participant.id}
                      className={`
                      ${
                        isOwn
                          ? "bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-green-600/60"
                          : isEliminated
                            ? "bg-gradient-to-r from-red-900/20 to-red-950/20 border-red-600/30 opacity-60"
                            : "bg-gradient-to-r from-amber-900/20 to-amber-950/20 border-amber-600/30"
                      }
                      border rounded-lg p-2.5 transition-all hover:border-amber-500/50
                    `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`
                          w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold
                          ${
                            isOwn
                              ? "bg-gradient-to-br from-green-600 to-emerald-700 text-green-100"
                              : isEliminated
                                ? "bg-gradient-to-br from-red-800 to-red-900 text-red-200"
                                : "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100"
                          }
                        `}
                          >
                            {participant.skin}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span
                                className={`
                              font-semibold text-xs truncate
                              ${isOwn ? "text-green-100" : isEliminated ? "text-red-200" : "text-amber-100"}
                            `}
                              >
                                {displayAddress}
                              </span>
                              {isOwn && <span className="text-green-400 text-xs">(You)</span>}
                            </div>
                            <span
                              className={`
                            text-xs block truncate
                            ${isOwn ? "text-green-400" : isEliminated ? "text-red-400" : "text-amber-500"}
                          `}
                            >
                              Character #{participant.skin}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`
                          font-bold text-sm
                          ${isOwn ? "text-green-300" : isEliminated ? "text-red-300" : "text-amber-300"}
                        `}
                          >
                            {(participant.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL
                          </div>
                          <div
                            className={`text-xs ${isEliminated ? "text-red-500" : "text-amber-500"}`}
                          >
                            {!isEliminated ? `${winPercentage}% win` : "Eliminated"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 border-t border-amber-700/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 uppercase tracking-wide">Total Pot</span>
                <span className="text-amber-300 font-bold text-sm">
                  {(totalPot / LAMPORTS_PER_SOL).toFixed(2)} SOL
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
