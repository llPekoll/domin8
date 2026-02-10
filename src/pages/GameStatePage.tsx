import { useGameState } from "../hooks/useGameState";
import { RefreshCw, AlertCircle, Database, Wallet, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export function GameStatePage() {
  const { gameState, gameConfig, vaultBalance, loading, error } = useGameState();

  if (loading && !gameState) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-lg">Loading blockchain data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 max-w-md">
          <div className="flex items-center gap-3 text-red-400 mb-2">
            <AlertCircle className="w-6 h-6" />
            <h2 className="text-xl font-bold">Error Loading Game State</h2>
          </div>
          <p className="text-red-300 mb-4">{error}</p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            Back to Game
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">On-Chain Game State</h1>
            <p className="text-gray-400">Live data from Solana blockchain</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            Back to Game
          </Link>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-gray-300">Game Status</h3>
            </div>
            <p className="text-2xl font-bold">{gameState?.status || "Unknown"}</p>
            <p className="text-sm text-gray-400 mt-1">Round #{gameState?.roundId || 0}</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold text-gray-300">Vault Balance</h3>
            </div>
            <p className="text-2xl font-bold">{vaultBalance.toFixed(4)} SOL</p>
            <p className="text-sm text-gray-400 mt-1">Total locked funds</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-gray-300">Initial Pot</h3>
            </div>
            <p className="text-2xl font-bold">{gameState?.initialPot.toFixed(4) || "0.0000"} SOL</p>
            <p className="text-sm text-gray-400 mt-1">{gameState?.bets.length || 0} bets placed</p>
          </div>
        </div>

        {/* Game Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Game Info */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Game Round Details
            </h2>
            <div className="space-y-3">
              <InfoRow label="Round ID" value={gameState?.roundId.toString() || "N/A"} />
              <InfoRow label="Status" value={gameState?.status || "N/A"} />
              <InfoRow
                label="Start Time"
                value={
                  gameState?.startTimestamp
                    ? new Date(gameState.startTimestamp * 1000).toLocaleString()
                    : "Not started"
                }
              />
              <InfoRow
                label="Prize Sent"
                value={gameState?.prizeSent ? "Yes ✓" : "No ✗"}
              />
              <InfoRow
                label="Winner"
                value={
                  gameState?.winner ? (
                    <span className="font-mono text-xs">
                      {gameState.winner.slice(0, 8)}...{gameState.winner.slice(-8)}
                    </span>
                  ) : (
                    "TBD"
                  )
                }
              />
            </div>
          </div>

          {/* Config Info */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Game Configuration
            </h2>
            <div className="space-y-3">
              <InfoRow
                label="House Fee"
                value={`${(gameConfig?.houseFeeBasisPoints || 0) / 100}%`}
              />
              <InfoRow
                label="Min Bet"
                value={`${gameConfig?.minBetLamports.toFixed(4) || "0"} SOL`}
              />
              <InfoRow
                label="VRF Fee"
                value={`${gameConfig?.vrfFeeLamports.toFixed(4) || "0"} SOL`}
              />
              <InfoRow
                label="Treasury"
                value={
                  <span className="font-mono text-xs">
                    {gameConfig?.treasury.slice(0, 8)}...{gameConfig?.treasury.slice(-8)}
                  </span>
                }
              />
            </div>
          </div>
        </div>

        {/* PDAs */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Program Derived Addresses (PDAs)</h2>
          <div className="space-y-3">
            <PDARow label="Game Round PDA" address={gameState?.gameRoundPda || "N/A"} />
            <PDARow label="Vault PDA" address={gameState?.vaultPda || "N/A"} />
          </div>
        </div>

        {/* Bets Table */}
        {gameState && gameState.bets.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Current Bets ({gameState.bets.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-600">
                    <th className="pb-3 font-semibold text-gray-300">#</th>
                    <th className="pb-3 font-semibold text-gray-300">Wallet</th>
                    <th className="pb-3 font-semibold text-gray-300">Amount</th>
                    <th className="pb-3 font-semibold text-gray-300">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {gameState.bets.map((bet, index) => (
                    <tr key={index} className="border-b border-slate-700/50">
                      <td className="py-3 text-gray-400">{index + 1}</td>
                      <td className="py-3 font-mono text-sm">
                        {bet.wallet.slice(0, 8)}...{bet.wallet.slice(-8)}
                      </td>
                      <td className="py-3 font-bold text-green-400">{bet.betAmount.toFixed(4)} SOL</td>
                      <td className="py-3 text-gray-400 text-sm">
                        {new Date(bet.timestamp * 1000).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {gameState && gameState.bets.length === 0 && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-12 text-center">
            <Database className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No bets placed yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PDARow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
      <span className="text-gray-400">{label}:</span>
      <span className="font-mono text-sm bg-slate-900/50 px-3 py-1 rounded border border-slate-600">
        {address}
      </span>
    </div>
  );
}
