import { TrendingUp, TrendingDown, Trophy, Target, Clock, BarChart3 } from "lucide-react";
import { useBotSettings } from "../../hooks/useBotSettings";

export function BotStatsPanel() {
  const { stats, recentPerformance } = useBotSettings();

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-indigo-400">
        <p>No stats available yet. Start the bot to see performance data.</p>
      </div>
    );
  }

  const isProfit = stats.totalProfit >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-indigo-100 text-xl font-semibold mb-1">Bot Performance</h3>
        <p className="text-indigo-400/70 text-sm">Track your bot's betting history and results</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalBets}</p>
          <p className="text-indigo-400 text-sm">Total Bets</p>
        </div>

        <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalWins}</p>
          <p className="text-green-400 text-sm">Wins</p>
        </div>

        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalLosses}</p>
          <p className="text-red-400 text-sm">Losses</p>
        </div>

        <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.winRate}%</p>
          <p className="text-blue-400 text-sm">Win Rate</p>
        </div>
      </div>

      {/* Profit/Loss Card */}
      <div
        className={`rounded-lg p-6 text-center ${
          isProfit
            ? "bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/40"
            : "bg-gradient-to-r from-red-900/40 to-rose-900/40 border border-red-500/40"
        }`}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          {isProfit ? (
            <TrendingUp className="w-6 h-6 text-green-400" />
          ) : (
            <TrendingDown className="w-6 h-6 text-red-400" />
          )}
          <span className={`text-lg font-medium ${isProfit ? "text-green-400" : "text-red-400"}`}>
            Total {isProfit ? "Profit" : "Loss"}
          </span>
        </div>
        <p
          className={`text-4xl font-bold ${isProfit ? "text-green-300" : "text-red-300"}`}
        >
          {isProfit ? "+" : "-"}{Math.abs(stats.totalProfitSOL).toFixed(4)} SOL
        </p>
      </div>

      {/* Current Streaks */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-green-300 font-medium">Win Streak</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.consecutiveWins}</p>
        </div>
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-red-300 font-medium">Loss Streak</span>
          </div>
          <p className="text-3xl font-bold text-white">{stats.consecutiveLosses}</p>
        </div>
      </div>

      {/* Recent Performance */}
      {recentPerformance && recentPerformance.length > 0 && (
        <div>
          <h4 className="text-indigo-200 font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Bets
          </h4>
          <div className="bg-black/30 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-indigo-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-indigo-300">Round</th>
                  <th className="px-4 py-2 text-right text-indigo-300">Bet</th>
                  <th className="px-4 py-2 text-right text-indigo-300">Result</th>
                  <th className="px-4 py-2 text-right text-indigo-300">P&L</th>
                </tr>
              </thead>
              <tbody>
                {recentPerformance.slice(0, 10).map((bet, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-indigo-500/20 hover:bg-indigo-900/20"
                  >
                    <td className="px-4 py-2 text-gray-300">#{bet.roundId}</td>
                    <td className="px-4 py-2 text-right text-gray-300">
                      {bet.betAmountSOL.toFixed(4)} SOL
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          bet.result === "win"
                            ? "bg-green-500/20 text-green-400"
                            : bet.result === "loss"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {bet.result}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        bet.profit >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {bet.profit >= 0 ? "+" : ""}
                      {bet.profitSOL.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
