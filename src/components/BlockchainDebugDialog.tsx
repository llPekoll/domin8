/**
 * Blockchain Debug Dialog
 * Shows all program state for debugging during development
 */

import { useState } from "react";
import { useActiveGame } from "../hooks/useActiveGame";
import { CircleHelp, RefreshCw, X, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export function BlockchainDebugDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const { activeGame, isLoading, activeGamePDA } = useActiveGame();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-50 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-colors"
        title="Open Blockchain Debug Panel"
      >
        <CircleHelp className="w-6 h-6" />
      </button>
    );
  }

  const copyAllAsJSON = () => {
    const jsonData = {
      connection: {
        connected: !!activeGame,
        rpcEndpoint: import.meta.env.VITE_SOLANA_RPC_URL,
        programId: import.meta.env.VITE_GAME_PROGRAM_ID,
      },
      gameStatus: {
        currentRoundId: activeGame?.roundId?.toString(),
        gameRoundPDA: activeGamePDA?.toBase58(),
        gameExists: !!activeGame,
      },
      gameRound: activeGame
        ? {
            roundId: activeGame.roundId?.toString(),
            status: formatStatus(activeGame.status),
            startTimestamp: activeGame.startTimestamp?.toString(),
            endTimestamp: activeGame.endTimestamp?.toString(),
            totalPot: activeGame.totalPot?.toString(),
            betCount: activeGame.betCount,
            winner: activeGame.winner?.toString(),
            winningBetIndex: activeGame.winningBetIndex,
            betAmounts: activeGame.betAmounts
              ?.slice(0, activeGame.betCount || 0)
              .map((amt: any) => amt?.toString()),
            betSkin: activeGame.betSkin?.slice(0, activeGame.betCount || 0),
            betPosition: activeGame.betPosition?.slice(0, activeGame.betCount || 0),
          }
        : null,
      timestamp: new Date().toISOString(),
    };

    void navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const formatStatus = (status: any) => {
    if (!status) return "Unknown";
    const keys = Object.keys(status);
    const statusKey = keys[0] || "Unknown";
    // Capitalize first letter for display
    return statusKey.charAt(0).toUpperCase() + statusKey.slice(1);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const ts = Number(timestamp);
    if (ts === 0) return "Not set";
    return new Date(ts * 1000).toLocaleString();
  };

  const formatSOL = (lamports: any) => {
    if (!lamports) return "0";
    return (Number(lamports) / 1e9).toFixed(4) + " SOL";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-purple-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <CircleHelp className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Blockchain Debug Panel</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAllAsJSON}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                jsonCopied
                  ? "bg-green-600 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
              title="Copy all state as JSON"
            >
              {jsonCopied ? "✓ Copied!" : "📋 Copy JSON"}
            </button>
            <button
              onClick={() => window.location.reload()}
              disabled={isLoading}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-300 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Connection Info */}
          <Section title="Connection">
            <InfoRow
              label="Status"
              value={activeGame ? "Connected" : "Disconnected"}
              icon={
                activeGame ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )
              }
            />
            <InfoRow
              label="RPC Endpoint"
              value={import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com"}
              mono
            />
            <InfoRow
              label="Program ID"
              value={import.meta.env.VITE_GAME_PROGRAM_ID}
              mono
              copyable
            />
          </Section>

          {/* Game Status */}
          <Section title="Game Status">
            <InfoRow label="Current Round ID" value={activeGame?.roundId?.toString() || "0"} />
            <InfoRow
              label="Game Round PDA"
              value={activeGamePDA?.toBase58() || "N/A"}
              mono
              copyable
            />
            <InfoRow
              label="Game Exists"
              value={activeGame ? "Yes" : "No"}
              icon={
                activeGame ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                )
              }
            />
          </Section>

          {/* Active Game Round */}
          {activeGame && (
            <Section title="Active Game Round">
              <InfoRow label="Round ID" value={activeGame.roundId?.toString() || "N/A"} />

              {/* All Game Statuses with current highlighted */}
              <div className="py-2">
                <span className="text-gray-400 text-base font-medium">Status:</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["Waiting", "AwaitingWinnerRandomness", "Finished"].map((status) => {
                    const currentStatus = formatStatus(activeGame.status);
                    const isActive = currentStatus.toLowerCase() === status.toLowerCase();
                    return (
                      <span
                        key={status}
                        className={`px-3 py-1.5 rounded-lg text-base font-semibold transition-all ${
                          isActive
                            ? status === "Waiting"
                              ? "bg-blue-500 text-white shadow-lg ring-2 ring-blue-300"
                              : status === "AwaitingWinnerRandomness"
                                ? "bg-yellow-500 text-black shadow-lg ring-2 ring-yellow-300"
                                : status === "Finished"
                                  ? "bg-green-500 text-white shadow-lg ring-2 ring-green-300"
                                  : "bg-purple-500 text-white shadow-lg ring-2 ring-purple-300"
                            : "bg-gray-700/30 text-gray-500 border border-gray-600/50"
                        }`}
                      >
                        {status}
                      </span>
                    );
                  })}
                </div>
              </div>

              <InfoRow label="Start Time" value={formatDate(activeGame.startTimestamp)} />
              <InfoRow label="End Time" value={formatDate(activeGame.endTimestamp)} />
              <InfoRow label="Total Pot" value={formatSOL(activeGame.totalPot)} />
              <InfoRow label="Bet Count" value={activeGame.betCount?.toString() || "0"} />

              {/* Bets List */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <h4 className="text-base font-semibold text-purple-300 mb-3">
                  Bets ({activeGame.betCount || 0})
                </h4>
                {(activeGame.betCount ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: activeGame.betCount ?? 0 }).map((_, index) => {
                      const amount = activeGame.betAmounts?.[index];
                      const skin = activeGame.betSkin?.[index];
                      const position = activeGame.betPosition?.[index];
                      return (
                        <div
                          key={index}
                          className="bg-gray-700/30 rounded-lg px-3 py-2 border border-gray-600/50"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-300 text-base font-medium">
                              Bet #{index + 1}
                            </span>
                            <span className="text-green-400 text-base font-bold">
                              {amount ? formatSOL(amount) : "N/A"}
                            </span>
                          </div>
                          {skin !== undefined && (
                            <div className="text-xs text-gray-500">
                              Skin: {skin} | Position: [{position?.[0]}, {position?.[1]}]
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm italic">No bets placed yet</p>
                )}
              </div>

              <InfoRow
                label="Winner"
                value={activeGame.winner?.toString() || "Not determined"}
                mono
              />
              <InfoRow
                label="Winning Bet Index"
                value={
                  activeGame.winningBetIndex !== undefined && activeGame.winningBetIndex !== null
                    ? activeGame.winningBetIndex.toString()
                    : "N/A"
                }
              />
            </Section>
          )}

          {/* Actions */}
          {!activeGame && (
            <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-semibold mb-2">No Active Game</p>
                  <p className="text-yellow-300/80 text-sm mb-3">
                    You need to create a game before players can place bets.
                  </p>
                  <code className="block bg-black/30 p-2 rounded text-xs text-yellow-200 overflow-x-auto">
                    ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
                    ANCHOR_WALLET=./solana/wallet.json npx ts-node scripts/create-game.ts
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-semibold text-purple-400 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  copyable = false,
  badge,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  badge?: string;
  icon?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-gray-400 text-base font-medium flex-shrink-0">{label}:</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {icon}
        {badge ? (
          <span
            className={`px-3 py-1 rounded-lg text-base font-semibold ${
              badge === "Waiting"
                ? "bg-blue-500/20 text-blue-400"
                : badge === "AwaitingWinnerRandomness"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : badge === "Finished"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-gray-500/20 text-gray-400"
            }`}
          >
            {badge}
          </span>
        ) : (
          <span
            className={`text-gray-200 text-base text-right break-all ${mono ? "font-mono text-sm" : "font-medium"}`}
          >
            {value}
          </span>
        )}
        {copyable && (
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? "✓" : "📋"}
          </button>
        )}
      </div>
    </div>
  );
}
