/**
 * usePrivyWallet — Compatibility shim for TON
 *
 * Maps the old Privy/Solana interface to TonConnect.
 * All existing components that call usePrivyWallet() keep working.
 */

import { useCallback, useEffect, useRef } from "react";
import { useActiveWallet } from "../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../lib/socket";
import { EventBus } from "../game/EventBus";
import { LEVEL_THRESHOLDS } from "../lib/xpUtils";

function getLevelInfo(level: number) {
  return LEVEL_THRESHOLDS.find((l) => l.level === level) || LEVEL_THRESHOLDS[0];
}

// Re-export for convenience
export { useActiveWallet } from "../contexts/ActiveWalletContext";

export function usePrivyWallet() {
  const ctx = useActiveWallet();
  const { socket } = useSocket();
  const dailyLoginClaimedRef = useRef<string | null>(null);

  // Daily login XP claim (kept from original — uses socket, not Privy)
  const claimDailyLoginXp = useCallback(
    async (args: { walletAddress: string }) => {
      if (!socket) return { awarded: false };
      const res = await socketRequest(socket, "claim-daily-login-xp", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );

  useEffect(() => {
    if (!ctx.connected || !ctx.walletAddress) return;
    if (dailyLoginClaimedRef.current === ctx.walletAddress) return;

    const claim = async () => {
      try {
        const result = await claimDailyLoginXp({
          walletAddress: ctx.walletAddress!,
        });
        if (result?.awarded && result.levelUp && result.newLevel) {
          EventBus.emit("level-up", {
            newLevel: result.newLevel,
            levelTitle: getLevelInfo(result.newLevel).title,
          });
        }
        dailyLoginClaimedRef.current = ctx.walletAddress;
      } catch {
        // silently fail
      }
    };
    void claim();
  }, [ctx.connected, ctx.walletAddress, claimDailyLoginXp]);

  return {
    connected: ctx.connected,
    publicKey: null as any, // No Solana PublicKey — use walletAddress instead
    walletAddress: ctx.walletAddress,
    externalWalletAddress: null as string | null,
    externalWalletAccountType: null as string | null,
    wallet: null as any,
    ready: ctx.ready,
    solBalance: ctx.tonBalance,
    tonBalance: ctx.tonBalance,
    isLoadingBalance: ctx.isLoadingBalance,
    refreshBalance: ctx.refreshBalance,
  };
}
