/**
 * Hook for sending game creation webhook when first bet is placed
 *
 * Detects when game status transitions from WAITING (2) to OPEN (0)
 * and sends a notification via Convex webhook.
 */
import { useRef, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ActiveGameState } from "./useActiveGame";

export function useGameCreatedWebhook(currentRoundState: ActiveGameState | null) {
  // Track previous game status for detecting WAITING → OPEN transition
  const prevStatusRef = useRef<number | null>(null);
  const prevRoundIdRef = useRef<string | null>(null);

  // Webhook notification for game creation
  const notifyGameCreated = useAction(api.webhooks.notifyGameCreated);

  // Get player data for the first bettor's display name
  const firstBettorWallet = currentRoundState?.wallets?.[0]?.toBase58() || null;
  const firstBettorPlayer = useQuery(
    api.players.getPlayer,
    firstBettorWallet ? { walletAddress: firstBettorWallet } : "skip"
  );

  // Detect WAITING (2) → OPEN (0) transition and send game creation webhook
  useEffect(() => {
    if (!currentRoundState) return;

    const currentStatus = currentRoundState.status;
    const currentRoundId = currentRoundState.gameRound?.toString();
    const prevStatus = prevStatusRef.current;
    const prevRoundId = prevRoundIdRef.current;

    // Update refs for next comparison
    prevStatusRef.current = currentStatus;
    prevRoundIdRef.current = currentRoundId;

    // Detect transition: status 2 (WAITING) → 0 (OPEN) on the same round
    // This happens when the first bet is placed
    const isStatusTransition = prevStatus === 2 && currentStatus === 0;
    const isSameRound = prevRoundId === currentRoundId;

    if (isStatusTransition && isSameRound && currentRoundId) {
      console.log(`🎮 [useGameCreatedWebhook] Game started! Status transition WAITING → OPEN for round ${currentRoundId}`);

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
          console.log(`🎮 [useGameCreatedWebhook] Game creation webhook sent:`, result);
        })
        .catch((error) => {
          console.error(`🎮 [useGameCreatedWebhook] Failed to send game creation webhook:`, error);
        });
    }
  }, [currentRoundState?.status, currentRoundState?.gameRound?.toString(), firstBettorWallet, firstBettorPlayer, notifyGameCreated]);
}
