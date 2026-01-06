import { useState, useEffect, useCallback } from "react";
import { Wallet } from "lucide-react";

interface MWAConnectButtonProps {
  onConnect?: (publicKey: string) => void;
  onError?: (error: Error) => void;
}

// Detect Android via user agent (works for PWA, web, and Capacitor)
const isAndroid = /Android/i.test(navigator.userAgent);

/**
 * MWA Connect Button using wallet-standard
 */
export function MWAConnectButton({ onConnect, onError }: MWAConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [mwaWallet, setMwaWallet] = useState<any>(null);
  const [status, setStatus] = useState<string>("Looking for wallet...");

  // Find the MWA wallet via wallet-standard
  useEffect(() => {
    if (!isAndroid) {
      console.log("[MWAButton] Skipped - not Android");
      return;
    }

    // Dynamic import to avoid bundling issues
    import("@wallet-standard/app").then(({ getWallets }) => {
      const { get, on } = getWallets();

      const findMwa = () => {
        const wallets = get();
        console.log("[MWAButton] Available wallets:", wallets.map(w => w.name));
        const mwa = wallets.find(w => w.name === "Mobile Wallet Adapter");
        if (mwa) {
          console.log("[MWAButton] Found MWA wallet");
          setMwaWallet(mwa);
          setStatus("Ready");
        }
      };

      findMwa();
      on("register", findMwa);
    }).catch((err) => {
      console.error("[MWAButton] Failed to load wallet-standard:", err);
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (!mwaWallet) {
      onError?.(new Error("Mobile Wallet Adapter not available"));
      return;
    }

    setIsConnecting(true);
    setStatus("Connecting...");

    try {
      const connectFeature = mwaWallet.features["standard:connect"];
      if (!connectFeature) throw new Error("Wallet doesn't support connect");

      console.log("[MWAButton] Calling connect...");
      const result = await connectFeature.connect();
      console.log("[MWAButton] Result:", result);

      if (result?.accounts?.length > 0) {
        const account = result.accounts[0];
        const bs58 = await import("bs58");
        const rawAddress = account.address as unknown;
        let address: string;

        if (typeof rawAddress === "string") {
          address = rawAddress;
        } else if (rawAddress instanceof Uint8Array) {
          address = bs58.default.encode(rawAddress);
        } else {
          address = bs58.default.encode(new Uint8Array(Object.values(rawAddress as any)));
        }

        setConnectedAddress(address);
        setStatus("Connected!");
        onConnect?.(address);
      } else {
        throw new Error("No accounts returned");
      }
    } catch (error: any) {
      console.error("[MWAButton] Error:", error);
      setStatus("Failed");
      onError?.(error);
    } finally {
      setIsConnecting(false);
    }
  }, [mwaWallet, onConnect, onError]);

  if (!isAndroid) return null;

  if (connectedAddress) {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-900/50 border border-green-500 rounded-xl">
        <Wallet className="w-5 h-5 text-green-400" />
        <span className="text-green-300 text-sm">
          {connectedAddress.slice(0, 4)}...{connectedAddress.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting || !mwaWallet}
      className="relative w-full flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-lg rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:transform-none overflow-hidden group"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
      <Wallet className="w-6 h-6" />
      <span>{isConnecting ? status : mwaWallet ? "Connect Seeker Wallet" : status}</span>
    </button>
  );
}
