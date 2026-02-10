import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useActiveGame } from "../hooks/useActiveGame";
import { useMemo } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function PotDisplayPanel() {
  const { walletAddress } = usePrivyWallet();
  const { activeGame, isLoading } = useActiveGame();

  // Calculate total pot
  const totalPot = useMemo(() => {
    if (!activeGame?.totalDeposit) return 0;
    return activeGame.totalDeposit.toNumber();
  }, [activeGame]);

  // Calculate player's win chance
  const playerWinChance = useMemo(() => {
    if (!activeGame?.bets || !activeGame?.wallets || !walletAddress || totalPot === 0) {
      return 0;
    }

    // Find all bets made by the current player
    const playerBets = activeGame.bets.filter((bet) => {
      const wallet = activeGame.wallets[bet.walletIndex];
      return wallet?.toString() === walletAddress;
    });

    // Sum up player's total bet amount
    const playerTotalBet = playerBets.reduce((sum, bet) => sum + bet.amount.toNumber(), 0);

    // Calculate win chance as percentage
    return (playerTotalBet / totalPot) * 100;
  }, [activeGame, walletAddress, totalPot]);

  // Count unique players
  const playerCount = useMemo(() => {
    if (!activeGame?.wallets) return 0;
    return activeGame.wallets.length;
  }, [activeGame]);

  // Get participants count (same check as MultiParticipantPanel)
  const participantsCount = useMemo(() => {
    if (!activeGame?.bets) return 0;
    return activeGame.bets.length;
  }, [activeGame]);

  // Don't show panel if no game or loading or no participants
  if (isLoading || !activeGame || participantsCount === 0) {
    return null;
  }

  // Determine game status text
  // Smart contract constants.rs: OPEN=0, CLOSED=1, WAITING=2
  const getStatusText = () => {
    if (!activeGame.winner && activeGame.status === 0) {
      // GAME_STATUS_OPEN = 0 - Betting active
      return "Place Your Bet Now!";
    }
    if (!activeGame.winner && activeGame.status === 2) {
      // GAME_STATUS_WAITING = 2 - Waiting for first bet
      return "Waiting for Players to Join";
    }
    return null;
  };

  const statusText = getStatusText();

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      <div className="bg-black/40 backdrop-blur-sm rounded-lg shadow-lg border border-amber-500/30">
        <div className="flex items-center gap-4 p-3">
          {/* Chest Image */}
          <div className="relative">
            <img
              src="/assets/hud/chest.png"
              alt="Treasure Chest"
              className="w-16 h-16 object-contain drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
            />
          </div>

          {/* Stats Container */}
          <div className="flex items-center gap-6">
            {/* Total Pot */}
            <div className="flex flex-col items-center justify-center min-w-35">
              <div className="text-amber-400 text-xs uppercase tracking-wider font-semibold mb-1">
                Total Pot
              </div>
              <div className="text-5xl font-bold text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] leading-none">
                {(totalPot / LAMPORTS_PER_SOL).toFixed(3)} SOL
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-16 bg-amber-500/30" />

            {/* Player Count */}
            <div className="flex flex-col items-center justify-center min-w-25">
              <div className="text-amber-400 text-xs uppercase tracking-wider font-semibold mb-1">
                Players
              </div>
              <div className="text-5xl font-bold text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] leading-none">
                {playerCount}
              </div>
            </div>

            {/* Divider */}
            {playerWinChance > 0 && <div className="w-px h-16 bg-amber-500/30" />}

            {/* Player Win Chance (only show if player has bet) */}
            {playerWinChance > 0 && (
              <div className="flex flex-col items-center justify-center min-w-30">
                <div className="text-green-400 text-xs uppercase tracking-wider font-semibold mb-1">
                  Your Chance
                </div>
                <div className="text-5xl font-bold text-green-300 drop-shadow-[0_0_6px_rgba(134,239,172,0.6)] leading-none">
                  {playerWinChance.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Text Below */}
      {statusText && (
        <div className="text-amber-400 text-2xl font-bold animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
          {statusText}
        </div>
      )}
    </div>
  );
}
