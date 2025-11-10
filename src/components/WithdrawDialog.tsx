import { useState } from "react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { X, ArrowUpRight, AlertCircle, Wallet as WalletIcon } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { getSharedConnection } from "../lib/sharedConnection";
import { toast } from "sonner";
import { Button } from "./ui/button";
import bs58 from "bs58";

interface WithdrawDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawDialog({ isOpen, onClose }: WithdrawDialogProps) {
  const { walletAddress, wallet, solBalance, refreshBalance, externalWalletAddress, externalWalletAccountType } = usePrivyWallet();
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const validateAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const handleMaxClick = () => {
    // Reserve 0.001 SOL for transaction fees
    const maxAmount = Math.max(0, solBalance - 0.001);
    setAmount(maxAmount.toFixed(6));
  };

  const handleUseExternalWallet = () => {
    if (externalWalletAddress) {
      setRecipientAddress(externalWalletAddress);
    } else {
      toast.info("No external wallet connected. Connect Phantom or another wallet first.");
    }
  };

  const handleWithdraw = async () => {
    if (!wallet || !walletAddress) {
      toast.error("Wallet not connected");
      return;
    }

    // Validation
    if (!recipientAddress.trim()) {
      toast.error("Please enter a recipient address");
      return;
    }

    if (!validateAddress(recipientAddress)) {
      toast.error("Invalid Solana address");
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (withdrawAmount > solBalance) {
      toast.error("Insufficient balance");
      return;
    }

    // Warn if trying to withdraw everything (need to keep some for rent)
    if (withdrawAmount > solBalance - 0.001) {
      toast.error("Please keep at least 0.001 SOL for transaction fees");
      return;
    }

    try {
      setIsProcessing(true);
      toast.loading("Processing withdrawal...", { id: "withdraw" });

      const recipientPubkey = new PublicKey(recipientAddress);
      const connection = getSharedConnection();

      // Get latest blockhash
      const latestBlockhash = await connection.getLatestBlockhash();

      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: new PublicKey(walletAddress),
        toPubkey: recipientPubkey,
        lamports: Math.floor(withdrawAmount * LAMPORTS_PER_SOL),
      });

      // Create transaction
      const transaction = new Transaction();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = new PublicKey(walletAddress);
      transaction.add(transferInstruction);

      toast.loading("Signing and sending transaction...", { id: "withdraw" });

      // Serialize the transaction
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Determine network/chainId
      const network = import.meta.env.VITE_SOLANA_NETWORK || "devnet";
      const chainId = `solana:${network}` as `${string}:${string}`;

      // Use Privy's signAndSendAllTransactions
      if (!wallet.signAndSendAllTransactions) {
        throw new Error("Wallet does not support signing and sending transactions");
      }

      const results = await wallet.signAndSendAllTransactions([
        {
          chain: chainId,
          transaction: serializedTx,
        },
      ]);

      if (!results || results.length === 0 || !results[0].signature) {
        throw new Error("Transaction failed - no signature returned");
      }

      // Convert signature from Uint8Array to base58 string
      const signatureBytes = results[0].signature;
      const signature = bs58.encode(signatureBytes);

      toast.success(`Successfully withdrawn ${withdrawAmount} SOL!`, { id: "withdraw" });
      console.log("Withdrawal transaction:", signature);

      // Refresh balance
      await refreshBalance();

      // Reset form and close
      setRecipientAddress("");
      setAmount("");
      onClose();
    } catch (error: any) {
      console.error("Withdraw error:", error);
      toast.error(error.message || "Failed to withdraw funds", { id: "withdraw" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[50vh] -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Withdraw Funds</h2>
                <p className="text-sm text-gray-400">Send SOL to any address</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={isProcessing}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Balance Display */}
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-400">Available Balance</div>
              <div className="text-xs text-gray-500 font-mono">
                {walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}
              </div>
            </div>
            <div className="text-2xl font-bold text-white">{solBalance.toFixed(6)} SOL</div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Recipient Address */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Recipient Address
                </label>
                {externalWalletAddress && (
                  <button
                    onClick={handleUseExternalWallet}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    disabled={isProcessing}
                  >
                    <WalletIcon className="w-3.5 h-3.5" />
                    Use my {externalWalletAccountType} Address
                  </button>
                )}
              </div>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Enter Solana wallet address"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={isProcessing}
              />
              {recipientAddress && !validateAddress(recipientAddress) && (
                <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Invalid Solana address</span>
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">Amount (SOL)</label>
                <button
                  onClick={handleMaxClick}
                  className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                  disabled={isProcessing}
                >
                  MAX
                </button>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.000001"
                min="0"
                max={solBalance}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={isProcessing}
              />
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-200">
                  <p className="font-medium mb-1">Important</p>
                  <p className="text-yellow-300/80">
                    Double-check the recipient address. Transactions on Solana are irreversible.
                    Keep some SOL for future transaction fees.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold"
              disabled={
                isProcessing ||
                !recipientAddress ||
                !amount ||
                !validateAddress(recipientAddress) ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) > solBalance
              }
            >
              {isProcessing ? "Processing..." : "Withdraw"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
