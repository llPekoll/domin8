import { useFundWallet as usePrivyFundWallet } from "@privy-io/react-auth/solana";
import { toast } from "sonner";

export function useFundWallet() {
  const { fundWallet } = usePrivyFundWallet();

  const handleAddFunds = async (walletAddress: string) => {
    if (!walletAddress) {
      toast.error("No wallet address found");
      return;
    }

    try {
      await fundWallet({
        address: walletAddress,
        options: {
          chain: `solana:${import.meta.env.VITE_SOLANA_NETWORK}`,
          amount: "0.01",
        },
      });
    } catch (error: any) {
      if (error?.message?.includes("not enabled")) {
        try {
          await navigator.clipboard.writeText(walletAddress);
          toast.info("Funding not yet enabled. Wallet address copied!", {
            description: "Send SOL to this address to fund your wallet",
            duration: 5000,
          });
        } catch {
          toast.error("Funding not enabled. Enable MoonPay in Privy Dashboard.", {
            description: "Go to dashboard.privy.io → Plugins → MoonPay Fiat On-Ramp",
            duration: 5000,
          });
        }
      } else {
        toast.error("Failed to open funding flow");
      }
    }
  };

  return { handleAddFunds };
}
