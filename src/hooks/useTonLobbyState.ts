/**
 * TON Lobby State Hook
 *
 * Reads 1v1 lobby state from the Domin8Lobby child contract.
 * Uses raw TonClient calls to avoid @ton/core version conflicts.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Address, fromNano } from "@ton/core";
import { getTonClient } from "../lib/tonClient";

const MASTER_ADDRESS = import.meta.env.VITE_TON_MASTER_ADDRESS || "";

export interface TonLobbyState {
  lobbyId: number;
  status: "open" | "joined" | "settled" | "none";
  playerA: string;
  playerB: string | null;
  amount: number;
  mapId: number;
  skinA: number;
  skinB: number;
  winner: string | null;
  createdAt: number;
  lobbyAddress: string;
}

export function useTonLobbyState(lobbyId?: number) {
  const [lobbyState, setLobbyState] = useState<TonLobbyState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLobbyState = useCallback(async () => {
    if (!MASTER_ADDRESS || !lobbyId) {
      setLobbyState(null);
      return;
    }

    setIsLoading(true);
    try {
      const client = getTonClient();
      const masterAddr = Address.parse(MASTER_ADDRESS);

      // Call master's getLobbyAddress getter via runMethod
      const addrResult = await client.runMethod(masterAddr, "lobbyAddress", [
        { type: "int", value: BigInt(lobbyId) },
      ]);
      const lobbyAddr = addrResult.stack.readAddress();

      const contractState = await client.getContractState(lobbyAddr);
      if (contractState.state !== "active") {
        setLobbyState(null);
        return;
      }

      // Call lobby's state getter
      const stateResult = await client.runMethod(lobbyAddr, "state", []);
      const stack = stateResult.stack;

      // Parse LobbyState struct from stack
      const lobbyIdVal = Number(stack.readBigNumber());
      const status = Number(stack.readBigNumber());
      const playerA = stack.readAddress().toString();
      const playerB = stack.readAddressOpt()?.toString() || null;
      const amount = parseFloat(fromNano(stack.readBigNumber()));
      const mapId = Number(stack.readBigNumber());
      const skinA = Number(stack.readBigNumber());
      const skinB = Number(stack.readBigNumber());
      const winner = stack.readAddressOpt()?.toString() || null;
      const createdAt = Number(stack.readBigNumber());

      const statusMap: Record<number, TonLobbyState["status"]> = {
        0: "open",
        1: "joined",
        2: "settled",
      };

      setLobbyState({
        lobbyId: lobbyIdVal,
        status: statusMap[status] || "none",
        playerA,
        playerB,
        amount,
        mapId,
        skinA,
        skinB,
        winner,
        createdAt,
        lobbyAddress: lobbyAddr.toString(),
      });
    } catch (err) {
      console.error("[TonLobby] Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [lobbyId]);

  useEffect(() => {
    if (!lobbyId) return;
    fetchLobbyState();
    pollRef.current = setInterval(fetchLobbyState, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [lobbyId, fetchLobbyState]);

  return { lobbyState, isLoading, refresh: fetchLobbyState };
}
