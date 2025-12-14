import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useFundWallet } from "../hooks/useFundWallet";
import { SoundControl } from "./SoundControl";

export function HeaderMobile() {
  const { connected, publicKey, solBalance, isLoadingBalance } = usePrivyWallet();
  const { handleAddFunds } = useFundWallet();

  const handleBalanceClick = () => {
    if (publicKey) {
      void handleAddFunds(publicKey.toString());
    }
  };

  return (
    <header className="flex-shrink-0 bg-black/60 backdrop-blur-sm border-b border-indigo-500/20">
      <div className="flex items-center justify-between px-3 py-2">
        {/* Logo */}
        <div className="flex items-center">
          <img src="/assets/logo.webp" alt="Enrageded" className="h-8 w-auto" />
        </div>

        {/* Right Side - Sound + Balance */}
        <div className="flex items-center gap-3">
          {/* Sound Control */}
          <SoundControl />

          {/* Balance (tap to add funds) */}
          {connected && (
            <button
              onClick={handleBalanceClick}
              className="flex items-center gap-1.5 bg-indigo-900/50 hover:bg-indigo-800/50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {isLoadingBalance ? (
                <span className="text-indigo-300 text-sm">...</span>
              ) : solBalance !== null ? (
                <>
                  <img
                    src="/sol-logo.svg"
                    alt="SOL"
                    className="w-3.5 h-3.5"
                    style={{
                      filter:
                        "brightness(0) saturate(100%) invert(81%) sepia(13%) saturate(891%) hue-rotate(196deg) brightness(95%) contrast(92%)",
                    }}
                  />
                  <span className="text-indigo-100 font-semibold text-sm">
                    {solBalance.toFixed(3)}
                  </span>
                </>
              ) : (
                <span className="text-indigo-300 text-sm">--</span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
