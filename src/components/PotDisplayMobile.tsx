import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useActiveGame } from "../hooks/useActiveGame";
import { useMemo } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function PotDisplayMobile() {
  const { walletAddress } = usePrivyWallet();
  const { activeGame, isLoading } = useActiveGame();

  const totalPot = useMemo(() => {
    if (!activeGame?.totalDeposit) return 0;
    return activeGame.totalDeposit.toNumber();
  }, [activeGame]);

  const playerWinChance = useMemo(() => {
    if (!activeGame?.bets || !activeGame?.wallets || !walletAddress || totalPot === 0) {
      return 0;
    }

    const playerBets = activeGame.bets.filter((bet) => {
      const wallet = activeGame.wallets[bet.walletIndex];
      return wallet?.toString() === walletAddress;
    });

    const playerTotalBet = playerBets.reduce((sum, bet) => sum + bet.amount.toNumber(), 0);
    return (playerTotalBet / totalPot) * 100;
  }, [activeGame, walletAddress, totalPot]);

  const playerCount = useMemo(() => {
    if (!activeGame?.wallets) return 0;
    return activeGame.wallets.length;
  }, [activeGame]);

  const participantsCount = useMemo(() => {
    if (!activeGame?.bets) return 0;
    return activeGame.bets.length;
  }, [activeGame]);

  // Don't show if no game or no participants
  if (isLoading || !activeGame || participantsCount === 0) {
    return (
      <div className="shrink-0 bg-amber-950/50 border-b border-amber-500/20 px-4 py-2">
        <div className="flex items-center justify-center text-amber-400/50 text-sm">
          Waiting for players...
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 bg-linear-to-r from-amber-950/80 to-amber-900/80 border-b border-amber-500/30 px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Total Pot */}
        <div className="flex items-center gap-2">
          <img
            src="/assets/hud/chest.png"
            alt="Pot"
            className="w-8 h-8 object-contain"
          />
          <div>
            <div className="text-amber-400 text-xs uppercase">Pot</div>
            <div className="text-amber-200 font-bold text-lg leading-tight">
              {(totalPot / LAMPORTS_PER_SOL).toFixed(3)} SOL
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-amber-500/30" />

        {/* Player Count */}
        <div className="text-center">
          <div className="text-amber-400 text-xs uppercase">Players</div>
          <div className="text-amber-200 font-bold text-lg leading-tight">{playerCount}</div>
        </div>

        {/* Divider */}
        {playerWinChance > 0 && <div className="w-px h-8 bg-amber-500/30" />}

        {/* Player Win Chance */}
        {playerWinChance > 0 && (
          <div className="text-center">
            <div className="text-green-400 text-xs uppercase">Your Chance</div>
            <div className="text-green-300 font-bold text-lg leading-tight">
              {playerWinChance.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
