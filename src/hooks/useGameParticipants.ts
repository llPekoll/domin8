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
 * 2. When bets change, we call syncFromBlockchain via socket
 * 3. Server resolves names and stores participants
 * 4. We listen for participant updates via socket events
 */

import { useEffect, useRef, useState } from "react";
import { useSocket, socketRequest } from "../lib/socket";
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
  const { socket } = useSocket();
  const { activeGame } = useActiveGame();

  // Track last synced state to avoid duplicate syncs
  const lastSyncKeyRef = useRef<string>("");
  const hasSyncedOnceRef = useRef<boolean>(false);

  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const gameRound = activeGame?.gameRound
    ? Number(activeGame.gameRound.toString())
    : 0;

  // Sync participants to server when blockchain data changes
  useEffect(() => {
    if (!socket || !activeGame?.bets || !activeGame?.wallets || activeGame.bets.length === 0) {
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

    // Convert blockchain data to format expected by server
    const bets = activeGame.bets.map((b) => ({
      walletIndex: b.walletIndex,
      amount: Number(b.amount.toString()),
      skin: b.skin,
      position: Array.isArray(b.position) ? b.position : [b.position[0], b.position[1]],
    }));

    const wallets = activeGame.wallets.map((w) => w.toBase58());

    console.log(`[useGameParticipants] Syncing ${bets.length} bets to server (round ${gameRound})`);

    // Sync to server - response includes fresh participants
    socketRequest(socket, "sync-participants-from-blockchain", {
      gameRound,
      bets,
      wallets,
    }).then((res) => {
      if (res.success && res.data?.participants) {
        setParticipants(res.data.participants as GameParticipant[]);
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error("[useGameParticipants] Sync failed:", err);
    });
  }, [socket, activeGame?.bets, activeGame?.wallets, gameRound]);

  // Fetch participants when game round changes
  useEffect(() => {
    if (!socket || gameRound <= 0) {
      setParticipants([]);
      setIsLoading(false);
      return;
    }

    socketRequest(socket, "get-participants", { gameRound }).then((res) => {
      if (res.success && res.data) {
        setParticipants(res.data as GameParticipant[]);
      }
      setIsLoading(false);
    });
  }, [socket, gameRound]);

  // Listen for real-time participant updates
  useEffect(() => {
    if (!socket) return;

    const handleParticipantsUpdate = (data: { gameRound: number; participants: GameParticipant[] }) => {
      if (data.gameRound === gameRound) {
        setParticipants(data.participants);
      }
    };

    socket.on("participants-updated", handleParticipantsUpdate);

    return () => {
      socket.off("participants-updated", handleParticipantsUpdate);
    };
  }, [socket, gameRound]);

  return {
    participants,
    isLoading,
    gameRound,
  };
}
