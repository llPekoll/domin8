import { Wallet, Zap, Trophy, Sparkles } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "~/components/ui/button";

export function ConnectWalletOverlay() {
  const { login } = usePrivy();

  const handleConnect = () => {
    try {
      login();
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Gradient overlay - subtle darkening */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50 pointer-events-none"></div>

      {/* Centered CTA Card */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-gradient-to-b from-gray-900/95 to-black/95 backdrop-blur-xl border-2 border-amber-500/50 rounded-2xl shadow-2xl max-w-md w-full p-8 pointer-events-auto">
          {/* Animated Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Pulsing glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full blur-2xl opacity-60 animate-pulse"></div>
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform">
                <Wallet className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-center text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 mb-3 animate-pulse">
            Join the Battle!
          </h2>

          {/* Subheadline */}
          <p className="text-center text-gray-300 text-lg mb-8">
            Connect your wallet to compete and win real SOL
          </p>

          {/* Quick Features */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/40">
              <Zap className="w-8 h-8 text-amber-400" />
              <p className="text-white font-bold text-sm text-center">Instant Play</p>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/40">
              <Trophy className="w-8 h-8 text-amber-400" />
              <p className="text-white font-bold text-sm text-center">Real Prizes</p>
            </div>
          </div>

          {/* Main CTA Button */}
          <Button
            onClick={handleConnect}
            className="relative w-full bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 hover:from-amber-400 hover:via-orange-500 hover:to-amber-400 text-white font-black py-6 text-2xl shadow-2xl transition-all uppercase tracking-wider overflow-hidden group transform hover:scale-105 active:scale-95"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <Sparkles className="w-6 h-6 mr-2 inline-block animate-pulse" />
            Connect Wallet
            <Sparkles className="w-6 h-6 ml-2 inline-block animate-pulse" />
          </Button>

          {/* Supporting text */}
          <p className="text-center text-sm text-gray-400 mt-4">
            No wallet? No problem! Use email or social login
          </p>
        </div>
      </div>
    </div>
  );
}
