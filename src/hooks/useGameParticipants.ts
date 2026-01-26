/**
 * Hook for subscribing to current game participants
 *
 * Provides unified participant data combining:
 * - Wallet address
 * - Display name (resolved from players table)
 * - Character info
 * - Bet amounts
 * - Boss status
 *
 * One entry per "character on screen":
 * - Boss: ONE entry (locked character, betAmount = sum of all bets)
 * - Non-boss: ONE entry PER BET (each bet = separate character)
 *
 * Flow:
 * 1. useActiveGame provides real-time blockchain data
 * 2. When bets change, we call syncFromBlockchain mutation
 * 3. Convex resolves names and stores participants
 * 4. useQuery subscribes to participants table for updates
 */

import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useActiveGame } from "./useActiveGame";

export interface GameParticipant {
  _id: string;
  odid: string;
  walletAddress: string;
  displayName: string;
  gameRound: number;
  characterId: number;
  characterKey: string;
  betIndex: number;
  betAmount: number; // In SOL
  position: number[]; // [x, y]
  isBoss: boolean;
  spawnIndex: number;
}

export function useGameParticipants() {
  const { activeGame } = useActiveGame();
  const syncFromBlockchain = useMutation(api.currentGameParticipants.syncFromBlockchain);

  // Track last synced state to avoid duplicate syncs
  const lastSyncKeyRef = useRef<string>("");
  const hasSyncedOnceRef = useRef<boolean>(false);

  const gameRound = activeGame?.gameRound
    ? Number(activeGame.gameRound.toString())
    : 0;

  // Sync participants to Convex when blockchain data changes OR on initial load
  useEffect(() => {
    if (!activeGame?.bets || !activeGame?.wallets || activeGame.bets.length === 0) {
      return;
    }

    // Create a signature of current bets + gameRound to detect changes
    const syncKey = `${gameRound}-${activeGame.bets.length}-${activeGame.bets
      .map((b) => `${b.walletIndex}-${b.amount.toString()}-${b.skin}`)
      .join("|")}`;

    // Skip if we already synced this exact state (but always sync at least once)
    if (syncKey === lastSyncKeyRef.current && hasSyncedOnceRef.current) {
      return;
    }

    lastSyncKeyRef.current = syncKey;
    hasSyncedOnceRef.current = true;

    // Convert blockchain data to format expected by mutation
    const bets = activeGame.bets.map((b) => ({
      walletIndex: b.walletIndex,
      amount: Number(b.amount.toString()),
      skin: b.skin,
      position: Array.isArray(b.position) ? b.position : [b.position[0], b.position[1]],
    }));

    const wallets = activeGame.wallets.map((w) => w.toBase58());

    console.log(`[useGameParticipants] 🔄 Syncing ${bets.length} bets to Convex (round ${gameRound})`);

    // Sync to Convex (fire and forget - useQuery will update when data arrives)
    // Note: bossWallet is resolved server-side to avoid race conditions
    syncFromBlockchain({
      gameRound,
      bets,
      wallets,
    }).catch((err) => {
      console.error("[useGameParticipants] Sync failed:", err);
    });
  }, [activeGame?.bets, activeGame?.wallets, gameRound, syncFromBlockchain]);

  // Subscribe to participants for current game round
  const participants = useQuery(
    api.currentGameParticipants.getParticipants,
    gameRound > 0 ? { gameRound } : "skip"
  );

  return {
    participants: (participants ?? []) as GameParticipant[],
    isLoading: participants === undefined,
    gameRound,
  };
}
