import { toast } from "sonner";

/**
 * Fund wallet — TON version
 * No Privy/MoonPay. Just copies address so user can send TON manually.
 */
export function useFundWallet() {
  const handleAddFunds = async (walletAddress: string) => {
    if (!walletAddress) {
      toast.error("No wallet address found");
      return;
    }

    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.info("Wallet address copied!", {
        description: "Send TON to this address to fund your wallet",
        duration: 5000,
      });
    } catch {
      toast.error("Failed to copy address");
    }
  };

  return { handleAddFunds };
}
