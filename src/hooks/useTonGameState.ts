/**
 * TON Game State Hook
 *
 * Replaces useActiveGame.ts + useGameState.ts
 * Polls the TON game child contract for state updates.
 * Uses raw TonClient calls (no Tact wrapper imports to avoid version conflicts).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Address, fromNano } from "@ton/core";
import { getTonClient } from "../lib/tonClient";

const MASTER_ADDRESS = import.meta.env.VITE_TON_MASTER_ADDRESS || "";
const POLL_INTERVAL_ACTIVE = 3000;
const POLL_INTERVAL_IDLE = 10000;

export interface TonBetInfo {
  player: string;
  amount: number;
  skin: number;
  posX: number;
  posY: number;
}

export interface TonGameState {
  gameId: number;
  status: "waiting" | "open" | "closed" | "none";
  mapId: number;
  startDate: number;
  endDate: number;
  totalPot: number;
  betCount: number;
  userCount: number;
  winner: string | null;
  winnerPrize: number;
  prizeSent: boolean;
  gameAddress: string;
  bets: TonBetInfo[];
}

export function useTonGameState() {
  const [gameState, setGameState] = useState<TonGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGameState = useCallback(async () => {
    if (!MASTER_ADDRESS) {
      setError("No master address configured");
      setIsLoading(false);
      return;
    }

    try {
      const client = getTonClient();
      const masterAddr = Address.parse(MASTER_ADDRESS);

      // Get config from master
      const configResult = await client.runMethod(masterAddr, "config", []);
      const configStack = configResult.stack;

      // Parse MasterConfig struct: admin, treasury, houseFee, minBet, maxBet, roundTime, currentRound, lobbyCount, locked
      configStack.readAddress(); // admin
      configStack.readAddress(); // treasury
      configStack.readBigNumber(); // houseFee
      configStack.readBigNumber(); // minBet
      configStack.readBigNumber(); // maxBet
      configStack.readBigNumber(); // roundTime
      const currentRound = Number(configStack.readBigNumber());

      if (currentRound === 0) {
        setGameState(null);
        setIsLoading(false);
        return;
      }

      // Get game address
      const addrResult = await client.runMethod(masterAddr, "gameAddress", [
        { type: "int", value: BigInt(currentRound) },
      ]);
      const gameAddr = addrResult.stack.readAddress();

      // Check if game contract exists
      const contractState = await client.getContractState(gameAddr);
      if (contractState.state !== "active") {
        setGameState(null);
        setIsLoading(false);
        return;
      }

      // Read game state
      const stateResult = await client.runMethod(gameAddr, "state", []);
      const s = stateResult.stack;

      const gameId = Number(s.readBigNumber());
      const status = Number(s.readBigNumber());
      const mapId = Number(s.readBigNumber());
      const startDate = Number(s.readBigNumber());
      const endDate = Number(s.readBigNumber());
      const totalPot = parseFloat(fromNano(s.readBigNumber()));
      const betCount = Number(s.readBigNumber());
      const userCount = Number(s.readBigNumber());
      const winner = s.readAddressOpt()?.toString() || null;
      const winnerPrize = parseFloat(fromNano(s.readBigNumber()));
      const prizeSent = s.readBoolean();

      // Fetch bets (cap at 50 to limit RPC calls)
      const bets: TonBetInfo[] = [];
      for (let i = 0; i < betCount && i < 50; i++) {
        try {
          const betResult = await client.runMethod(gameAddr, "bet", [
            { type: "int", value: BigInt(i) },
          ]);
          const bs = betResult.stack;
          // BetInfo: player, amount, skin, posX, posY
          const player = bs.readAddress().toString();
          const amount = parseFloat(fromNano(bs.readBigNumber()));
          const skin = Number(bs.readBigNumber());
          const posX = Number(bs.readBigNumber());
          const posY = Number(bs.readBigNumber());
          bets.push({ player, amount, skin, posX, posY });
        } catch {
          break;
        }
      }

      const statusMap: Record<number, TonGameState["status"]> = {
        0: "waiting",
        1: "open",
        2: "closed",
      };

      setGameState({
        gameId,
        status: statusMap[status] || "none",
        mapId,
        startDate,
        endDate,
        totalPot,
        betCount,
        userCount,
        winner,
        winnerPrize,
        prizeSent,
        gameAddress: gameAddr.toString(),
        bets,
      });

      setError(null);
    } catch (err) {
      console.error("[TonGameState] Fetch error:", err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGameState();

    const interval =
      gameState?.status === "open" ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;

    pollRef.current = setInterval(fetchGameState, interval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGameState, gameState?.status]);

  return { gameState, isLoading, error, refresh: fetchGameState };
}
