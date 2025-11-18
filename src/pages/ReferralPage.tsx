import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Copy, Check, Users, TrendingUp, Trophy } from "lucide-react";

export function ReferralPage() {
  const { connected, publicKey } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  // Get or create referral code
  const getOrCreateCode = useMutation(api.referrals.getOrCreateReferralCode);
  const [referralData, setReferralData] = useState<{
    code: string;
    totalReferred: number;
    totalRevenue: number;
    accumulatedRewards: number;
  } | null>(null);

  // Get referred users list
  const referredUsers = useQuery(
    api.referrals.getReferredUsers,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  // Get leaderboard
  const leaderboard = useQuery(api.referrals.getLeaderboard, { limit: 100 });

  // Get user's rank
  const userRank = useQuery(
    api.referrals.getUserRank,
    connected && publicKey ? { walletAddress: publicKey.toString() } : "skip"
  );

  // Load referral code on mount
  useEffect(() => {
    if (connected && publicKey) {
      void getOrCreateCode({ walletAddress: publicKey.toString() }).then((data) => {
        setReferralData(data);
      });
    }
  }, [connected, publicKey]); // Removed getOrCreateCode from dependencies to prevent infinite loop

  // Copy referral link to clipboard
  const handleCopyLink = async () => {
    if (!referralData) return;

    const referralLink = `${window.location.origin}?ref=${referralData.code}`;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format SOL amount (convert lamports to SOL)
  const formatSOL = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  // Format wallet address (truncate middle)
  const formatWallet = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen w-full bg-black">
        <Header />
        <main className="pt-16 px-4 container mx-auto">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-indigo-200 mb-4">Referral System</h1>
              <p className="text-indigo-300 mb-4">Connect your wallet to access referrals</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black">
      <Header />

      <main className="pt-16 px-4 pb-8 container mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-indigo-200 mb-2">Referral System</h1>
          <p className="text-indigo-300">Share your referral link and earn from your network</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-medium text-indigo-300">Total Referred</h3>
            </div>
            <p className="text-3xl font-bold text-indigo-100">{referralData?.totalReferred || 0}</p>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-medium text-indigo-300">Claimable Rewards</h3>
            </div>
            <p className="text-3xl font-bold text-indigo-100">
              {referralData ? formatSOL(referralData.accumulatedRewards) : "0.0000"} SOL
            </p>
            <p className="text-xs text-indigo-400 mt-1">
              1.5% of {referralData ? formatSOL(referralData.totalRevenue) : "0.0000"} SOL bet
              volume
            </p>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <h3 className="text-sm font-medium text-indigo-300">Your Rank</h3>
            </div>
            <p className="text-3xl font-bold text-indigo-100">#{userRank?.rank || "-"}</p>
          </div>
        </div>

        {/* Referral Link Section */}
        <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-indigo-100 mb-4">Your Referral Link</h2>

          {referralData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/30 border border-indigo-700/30 rounded-lg p-3">
                  <code className="text-indigo-200 text-sm break-all">
                    {window.location.origin}?ref={referralData.code}
                  </code>
                </div>
                <button
                  onClick={() => void handleCopyLink()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <p className="text-indigo-300 text-sm">
                Share this link with friends. When they sign up and place bets, you'll earn tracking
                revenue from their betting volume.
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-indigo-300">Loading referral code...</p>
            </div>
          )}
        </div>

        {/* Referred Users List */}
        <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-indigo-100 mb-4">Your Referred Users</h2>

          {!referredUsers || referredUsers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-indigo-300">
                No referred users yet. Share your link to get started!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-indigo-800/30">
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      User
                    </th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      Wallet
                    </th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      Signup Date
                    </th>
                    <th className="text-right py-3 px-4 text-indigo-300 font-medium text-sm">
                      Total Bet Volume
                    </th>
                    <th className="text-center py-3 px-4 text-indigo-300 font-medium text-sm">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {referredUsers.map((user) => (
                    <tr
                      key={user.walletAddress}
                      className="border-b border-indigo-800/20 hover:bg-indigo-900/20 transition-colors"
                    >
                      <td className="py-3 px-4 text-indigo-100">{user.displayName}</td>
                      <td className="py-3 px-4 text-indigo-200 font-mono text-sm">
                        {formatWallet(user.walletAddress)}
                      </td>
                      <td className="py-3 px-4 text-indigo-300 text-sm">
                        {new Date(user.signupDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right text-indigo-100 font-semibold">
                        {formatSOL(user.totalBetVolume)} SOL
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            user.status === "active"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-indigo-100 mb-4">Top Referrers</h2>

          {!leaderboard || !Array.isArray(leaderboard) || leaderboard.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-indigo-300">No referrers yet. Be the first!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-indigo-800/30">
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      Rank
                    </th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      User
                    </th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">
                      Wallet
                    </th>
                    <th className="text-right py-3 px-4 text-indigo-300 font-medium text-sm">
                      Referred Users
                    </th>
                    <th className="text-right py-3 px-4 text-indigo-300 font-medium text-sm">
                      Clamable Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => {
                    const isCurrentUser = entry.walletAddress === publicKey.toString();
                    return (
                      <tr
                        key={entry.walletAddress}
                        className={`border-b border-indigo-800/20 transition-colors ${
                          isCurrentUser
                            ? "bg-indigo-600/20 hover:bg-indigo-600/30"
                            : "hover:bg-indigo-900/20"
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {entry.rank <= 3 && (
                              <Trophy
                                className={`w-5 h-5 ${
                                  entry.rank === 1
                                    ? "text-yellow-400"
                                    : entry.rank === 2
                                      ? "text-gray-400"
                                      : "text-orange-600"
                                }`}
                              />
                            )}
                            <span
                              className={`font-bold ${
                                entry.rank <= 3 ? "text-indigo-100" : "text-indigo-200"
                              }`}
                            >
                              #{entry.rank}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-indigo-100">
                          {entry.displayName}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs bg-indigo-600/50 px-2 py-0.5 rounded">
                              You
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-indigo-200 font-mono text-sm">
                          {formatWallet(entry.walletAddress)}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-100 font-semibold">
                          {entry.totalReferred}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-100 font-semibold">
                          {formatSOL(entry.totalRevenue)} SOL
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
