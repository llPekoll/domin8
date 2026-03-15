/**
 * Hook for sending game creation notification when first bet is placed
 *
 * Detects when game status transitions from WAITING (2) to OPEN (0)
 * and sends a notification to Discord and Telegram.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { ActiveGameState } from "./useActiveGame";

export function useGameCreatedNotification(currentRoundState: ActiveGameState | null) {
  // Track previous game status for detecting WAITING -> OPEN transition
  const prevStatusRef = useRef<number | null>(null);
  const prevRoundIdRef = useRef<string | null>(null);
  const { socket } = useSocket();

  // Webhook notification for game creation via socket
  const notifyGameCreated = useCallback(
    async (args: any) => {
      if (!socket) return;
      const res = await socketRequest(socket, "notify-game-created", args);
      return res.data;
    },
    [socket]
  );

  // Get player data for the first bettor's display name via socket
  const firstBettorWallet = currentRoundState?.wallets?.[0]?.toBase58() || null;
  const [firstBettorPlayer, setFirstBettorPlayer] = useState<any>(null);
  useEffect(() => {
    if (!socket || !firstBettorWallet) {
      setFirstBettorPlayer(null);
      return;
    }
    socketRequest(socket, "get-player", { walletAddress: firstBettorWallet }).then((res) => {
      if (res.success) setFirstBettorPlayer(res.data);
    });
  }, [socket, firstBettorWallet]);

  // Detect WAITING (2) -> OPEN (0) transition and send game creation webhook
  useEffect(() => {
    if (!currentRoundState) return;

    const currentStatus = currentRoundState.status;
    const currentRoundId = currentRoundState.gameRound?.toString();
    const prevStatus = prevStatusRef.current;
    const prevRoundId = prevRoundIdRef.current;

    // Update refs for next comparison
    prevStatusRef.current = currentStatus;
    prevRoundIdRef.current = currentRoundId;

    // Detect transition: status 2 (WAITING) -> 0 (OPEN) on the same round
    // This happens when the first bet is placed
    const isStatusTransition = prevStatus === 2 && currentStatus === 0;
    const isSameRound = prevRoundId === currentRoundId;

    if (isStatusTransition && isSameRound && currentRoundId) {
      console.log(`[useGameCreatedNotification] Game started! Status transition WAITING -> OPEN for round ${currentRoundId}`);

      // Get game data for webhook
      const startTimestamp = currentRoundState.startDate?.toNumber() || Math.floor(Date.now() / 1000);
      const endTimestamp = currentRoundState.endDate?.toNumber() || startTimestamp + 60;
      const totalPot = currentRoundState.totalDeposit?.toNumber() || 0;
      const mapId = typeof currentRoundState.map === "number" ? currentRoundState.map : (currentRoundState.map as any)?.id || 0;

      // Get first bettor info (the game creator)
      const creatorAddress = firstBettorWallet || "unknown";
      const creatorDisplayName = firstBettorPlayer?.displayName || creatorAddress.slice(0, 8);

      // Send webhook notification
      notifyGameCreated({
        roundId: parseInt(currentRoundId, 10),
        transactionSignature: "blockchain-detected", // No specific tx signature available here
        startTimestamp,
        endTimestamp,
        totalPot,
        creatorAddress,
        creatorDisplayName,
        map: mapId,
      })
        .then((result) => {
          console.log(`[useGameCreatedNotification] Game creation webhook sent:`, result);
        })
        .catch((error) => {
          console.error(`[useGameCreatedNotification] Failed to send game creation webhook:`, error);
        });
    }
  }, [currentRoundState?.status, currentRoundState?.gameRound?.toString(), firstBettorWallet, firstBettorPlayer, notifyGameCreated]);
}
