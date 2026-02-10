import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useActiveGame } from "../hooks/useActiveGame";
import { usePlayerNames } from "../contexts/PlayerNamesContext";
import { useMemo } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Crown } from "lucide-react";

export function ParticipantListMobile() {
  const { walletAddress } = usePrivyWallet();
  const { activeGame, isLoading } = useActiveGame();
  const { playerNames } = usePlayerNames();

  const totalPot = useMemo(() => {
    if (!activeGame?.totalDeposit) return 0;
    return activeGame.totalDeposit.toNumber();
  }, [activeGame]);

  const participants = useMemo(() => {
    if (!activeGame?.bets || !activeGame?.wallets) return [];

    const hostWallet = activeGame.wallets[0]?.toString();
    const aggregatedBets = new Map<string, { totalAmount: number; betCount: number }>();

    activeGame.bets.forEach((bet) => {
      const wallet = activeGame.wallets[bet.walletIndex];
      const walletStr = wallet?.toString() || "";
      const amount = bet.amount.toNumber();

      const existing = aggregatedBets.get(walletStr);
      if (existing) {
        existing.totalAmount += amount;
        existing.betCount += 1;
      } else {
        aggregatedBets.set(walletStr, { totalAmount: amount, betCount: 1 });
      }
    });

    return Array.from(aggregatedBets.entries())
      .map(([walletStr, data], index) => {
        const winChance = totalPot > 0 ? (data.totalAmount / totalPot) * 100 : 0;
        const playerData = playerNames?.find((p: any) => p.walletAddress === walletStr);
        const displayName =
          playerData?.displayName || `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}`;
        const isHost = walletStr === hostWallet;

        return {
          id: index,
          walletAddress: walletStr,
          displayName,
          amount: data.totalAmount,
          betCount: data.betCount,
          winChance,
          isOwn: walletStr === walletAddress,
          isHost,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [activeGame, totalPot, playerNames, walletAddress]);

  if (isLoading || !activeGame || participants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No players yet. Be the first to join!
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {participants.map((participant) => (
        <div
          key={participant.id}
          className={`
            flex items-center justify-between p-3 rounded-lg
            ${
              participant.isOwn
                ? "bg-green-900/40 border border-green-500/40"
                : "bg-amber-900/30 border border-amber-500/20"
            }
          `}
        >
          {/* Left: Name + Host badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-100 text-sm truncate">
                {participant.displayName}
              </span>
              {participant.isOwn && <span className="text-green-400 text-xs">(You)</span>}
              {participant.isHost && (
                <div className="inline-flex items-center gap-0.5 bg-linear-to-r from-yellow-500/90 to-amber-600/90 px-1.5 py-0.5 rounded text-xs font-bold text-amber-950">
                  <Crown className="w-3 h-3 fill-current" />
                  <span>HOST</span>
                </div>
              )}
            </div>
            <div className="text-amber-400 text-xs">
              {(participant.amount / LAMPORTS_PER_SOL).toFixed(3)} SOL
              {participant.betCount > 1 && (
                <span className="text-amber-500/70 ml-1">({participant.betCount} bets)</span>
              )}
            </div>
          </div>

          {/* Right: Win chance */}
          <div className="text-right ml-3">
            <div className="text-xl font-bold text-amber-300">{participant.winChance.toFixed(1)}%</div>
            <div className="text-amber-500 text-xs uppercase">Win</div>
          </div>
        </div>
      ))}
    </div>
  );
}
