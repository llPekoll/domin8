import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Hook to get boss information (previous winner)
 * Returns whether the current user is the boss and their locked character ID
 */
export function useBossInfo(currentWallet: string | null) {
  const bossInfo = useQuery(api.stats.getBossInfo);

  const isBoss =
    currentWallet !== null &&
    bossInfo?.bossWallet !== null &&
    bossInfo?.bossWallet === currentWallet;

  // Debug logging - more visible
  if (bossInfo !== undefined) {
    console.log("🎯 [BOSS CHECK]", {
      currentWallet: currentWallet?.slice(0, 8) + "..." + currentWallet?.slice(-4),
      bossWallet: bossInfo?.bossWallet?.slice(0, 8) + "..." + bossInfo?.bossWallet?.slice(-4),
      match: bossInfo?.bossWallet === currentWallet,
      isBoss,
    });
  }

  return {
    isBoss,
    bossCharacterId: bossInfo?.bossCharacterId ?? null,
    bossWallet: bossInfo?.bossWallet ?? null,
    isLoading: bossInfo === undefined,
  };
}
