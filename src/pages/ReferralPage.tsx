import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Copy, Check, Users, TrendingUp, Trophy, Wallet, Clock, Mail, X, Loader2, ExternalLink, History } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

export function ReferralPage() {
  const { connected, publicKey } = usePrivyWallet();
  const [copied, setCopied] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const sendPayoutIssueEmail = useAction(api.email.sendPayoutIssueEmail);

  // Get or create referral code
  const getOrCreateCode = useMutation(api.referrals.getOrCreateReferralCode);
  const [referralData, setReferralData] = useState<{
    code: string;
    totalReferred: number;
    totalRevenue: number;
    accumulatedRewards: number;
    totalPaidOut: number;
    lastPayoutDate?: number;
    lastPayoutAmount?: number;
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

  // Get payout history
  const payoutHistory = useQuery(
    api.referrals.getPayoutHistory,
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

  // Handle sending payout issue email
  const handleSendPayoutIssue = async () => {
    if (!publicKey || !referralData || !contactMessage.trim()) return;

    setSendingEmail(true);
    try {
      const pendingAmount = referralData.accumulatedRewards - referralData.totalPaidOut;
      await sendPayoutIssueEmail({
        walletAddress: publicKey.toString(),
        message: contactMessage,
        pendingAmount,
        email: contactEmail || undefined,
      });
      setEmailSent(true);
      setContactMessage("");
      setContactEmail("");
      setTimeout(() => {
        setContactDialogOpen(false);
        setEmailSent(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setSendingEmail(false);
    }
  };

  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen w-full bg-black/50">
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
    <div className="min-h-screen w-full bg-black/50">
      <Header />

      <main className="pt-16 px-4 pb-8 container mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-indigo-200 mb-2">Referral System</h1>
          <p className="text-indigo-300">Share your referral link and earn from your network</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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
              <h3 className="text-sm font-medium text-indigo-300">All-Time Earned</h3>
            </div>
            <p className="text-3xl font-bold text-green-400">
              {referralData ? formatSOL(referralData.accumulatedRewards) : "0.0000"} SOL
            </p>
            <p className="text-xs text-indigo-400 mt-1">
              1% of {referralData ? formatSOL(referralData.totalRevenue) : "0.0000"} SOL volume
            </p>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-indigo-300">Total Paid Out</h3>
            </div>
            <p className="text-3xl font-bold text-blue-400">
              {referralData ? formatSOL(referralData.totalPaidOut) : "0.0000"} SOL
            </p>
            {referralData?.lastPayoutDate && (
              <p className="text-xs text-indigo-400 mt-1">
                Last: {new Date(referralData.lastPayoutDate).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              <h3 className="text-sm font-medium text-indigo-300">Pending Payout</h3>
            </div>
            <p className="text-3xl font-bold text-yellow-400">
              {referralData ? formatSOL(referralData.accumulatedRewards - referralData.totalPaidOut) : "0.0000"} SOL
            </p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-indigo-400">Paid monthly</p>
              <button
                onClick={() => setContactDialogOpen(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Mail className="w-3 h-3" />
                Issue?
              </button>
            </div>
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

        {/* Payout History */}
        <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-indigo-100">Payout History</h2>
          </div>

          {!payoutHistory || payoutHistory.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-indigo-400">No payouts yet. Payouts are sent monthly.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-indigo-800/30">
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">Date</th>
                    <th className="text-right py-3 px-4 text-indigo-300 font-medium text-sm">Amount</th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">Transaction</th>
                    <th className="text-left py-3 px-4 text-indigo-300 font-medium text-sm">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutHistory.map((payout) => (
                    <tr
                      key={payout._id}
                      className="border-b border-indigo-800/20 hover:bg-indigo-900/20 transition-colors"
                    >
                      <td className="py-3 px-4 text-indigo-200 text-sm">
                        {new Date(payout.paidAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right text-green-400 font-semibold">
                        +{formatSOL(payout.amount)} SOL
                      </td>
                      <td className="py-3 px-4">
                        {payout.txHash ? (
                          <a
                            href={`https://solscan.io/tx/${payout.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-sm"
                          >
                            {payout.txHash.slice(0, 8)}...
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-indigo-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-indigo-400 text-sm">
                        {payout.note || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      Total Revenue
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

      {/* Contact Dialog */}
      <Dialog.Root open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-indigo-800/50 rounded-lg p-6 w-full max-w-md z-50">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-xl font-bold text-indigo-100">
                Report Payout Issue
              </Dialog.Title>
              <Dialog.Close className="text-indigo-400 hover:text-indigo-300">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            {emailSent ? (
              <div className="text-center py-8">
                <Check className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <p className="text-indigo-100 font-medium">Message sent!</p>
                <p className="text-indigo-400 text-sm">We'll get back to you soon.</p>
              </div>
            ) : (
              <>
                <Dialog.Description className="text-indigo-300 text-sm mb-4">
                  If you haven't received your monthly payout, let us know and we'll look into it.
                </Dialog.Description>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-indigo-300 mb-1">
                      Your Email (optional)
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-black/30 border border-indigo-700/30 rounded-lg px-3 py-2 text-indigo-100 placeholder-indigo-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-indigo-300 mb-1">
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Describe the issue..."
                      rows={4}
                      className="w-full bg-black/30 border border-indigo-700/30 rounded-lg px-3 py-2 text-indigo-100 placeholder-indigo-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="bg-indigo-950/30 border border-indigo-800/30 rounded-lg p-3">
                    <p className="text-xs text-indigo-400">
                      <strong>Wallet:</strong>{" "}
                      <span className="font-mono">{publicKey ? formatWallet(publicKey.toString()) : "-"}</span>
                    </p>
                    <p className="text-xs text-indigo-400 mt-1">
                      <strong>Pending:</strong>{" "}
                      {referralData ? formatSOL(referralData.accumulatedRewards - referralData.totalPaidOut) : "0"} SOL
                    </p>
                  </div>

                  <button
                    onClick={() => void handleSendPayoutIssue()}
                    disabled={sendingEmail || !contactMessage.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {sendingEmail ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
