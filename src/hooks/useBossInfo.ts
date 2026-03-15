import { useState, useEffect } from "react";
import { useSocket, socketRequest } from "../lib/socket";

/**
 * Hook to get boss information (previous winner)
 * Returns whether the current user is the boss and their locked character ID
 */
export function useBossInfo(currentWallet: string | null) {
  const { socket } = useSocket();
  const [bossInfo, setBossInfo] = useState<{
    bossWallet: string | null;
    bossCharacterId: number | null;
  } | undefined>(undefined);

  useEffect(() => {
    if (!socket) return;

    socketRequest(socket, "get-boss-info").then((res) => {
      if (res.success && res.data) {
        setBossInfo(res.data);
      } else {
        setBossInfo({ bossWallet: null, bossCharacterId: null });
      }
    });
  }, [socket]);

  // Listen for real-time boss updates
  useEffect(() => {
    if (!socket) return;

    const handleBossUpdate = (data: { bossWallet: string | null; bossCharacterId: number | null }) => {
      setBossInfo(data);
    };

    socket.on("boss-updated", handleBossUpdate);

    return () => {
      socket.off("boss-updated", handleBossUpdate);
    };
  }, [socket]);

  const isBoss =
    currentWallet !== null &&
    bossInfo?.bossWallet !== null &&
    bossInfo?.bossWallet === currentWallet;

  // Debug logging
  if (bossInfo !== undefined) {
    console.log("[BOSS CHECK]", {
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
