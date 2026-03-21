/**
 * TON Game Contract Hook
 *
 * Replaces useGameContract.ts — interacts with Domin8 smart contracts on TON.
 * Handles: placing bets (battle royale), joining lobbies (1v1), claiming prizes.
 *
 * Uses raw cell building with opcodes from the Tact-generated ABI.
 */

import { useState, useCallback } from "react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { toNano, beginCell } from "@ton/core";
import { useTonWalletHook } from "./useTonWallet";

const MASTER_ADDRESS = import.meta.env.VITE_TON_MASTER_ADDRESS || "";

// Opcodes from generated ABI (contracts/build/domin8_Domin8Game.abi)
const OP_PLACE_BET = 0xaa44039c;
const OP_JOIN_LOBBY = 0xfbbd3a85;
const OP_CLAIM_PRIZE = 0x9d546687;

function buildPayload(opcode: number, writeBody: (b: ReturnType<typeof beginCell>) => void): string {
  const b = beginCell().storeUint(opcode, 32).storeUint(0, 64); // op + queryId
  writeBody(b);
  return b.endCell().toBoc().toString("base64");
}

export function useTonGameContract() {
  const [tonConnectUI] = useTonConnectUI();
  const { connected, walletAddress, tonBalance, refreshBalance } =
    useTonWalletHook();
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isJoiningLobby, setIsJoiningLobby] = useState(false);

  /**
   * Place a bet in the current battle royale game.
   * Sends TON directly to the game child contract.
   */
  const placeBet = useCallback(
    async (
      gameAddress: string,
      amount: number,
      skin: number,
      position: [number, number]
    ) => {
      if (!connected || !walletAddress) {
        throw new Error("Wallet not connected");
      }
      if (amount < 0.01) {
        throw new Error("Minimum bet is 0.01 TON");
      }

      setIsPlacingBet(true);
      try {
        // Bet amount + 0.05 TON gas reserve (contract deducts gas from value)
        const totalAmount = toNano((amount + 0.05).toFixed(9));

        const payload = buildPayload(OP_PLACE_BET, (b) => {
          b.storeUint(skin, 8);
          b.storeUint(position[0], 16);
          b.storeUint(position[1], 16);
        });

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [
            {
              address: gameAddress,
              amount: totalAmount.toString(),
              payload,
            },
          ],
        });

        console.log("[TonGame] Bet placed:", { amount, skin, position });
        setTimeout(() => refreshBalance(), 3000);
        return true;
      } catch (err) {
        console.error("[TonGame] PlaceBet error:", err);
        throw err;
      } finally {
        setIsPlacingBet(false);
      }
    },
    [connected, walletAddress, tonConnectUI, refreshBalance]
  );

  /**
   * Join a 1v1 lobby. Must match Player A's bet amount.
   */
  const joinLobby = useCallback(
    async (lobbyAddress: string, amount: number, skin: number) => {
      if (!connected || !walletAddress) {
        throw new Error("Wallet not connected");
      }

      setIsJoiningLobby(true);
      try {
        const totalAmount = toNano((amount + 0.05).toFixed(9));

        const payload = buildPayload(OP_JOIN_LOBBY, (b) => {
          b.storeUint(skin, 8);
        });

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [
            {
              address: lobbyAddress,
              amount: totalAmount.toString(),
              payload,
            },
          ],
        });

        console.log("[TonGame] Joined lobby:", { amount, skin });
        setTimeout(() => refreshBalance(), 3000);
        return true;
      } catch (err) {
        console.error("[TonGame] JoinLobby error:", err);
        throw err;
      } finally {
        setIsJoiningLobby(false);
      }
    },
    [connected, walletAddress, tonConnectUI, refreshBalance]
  );

  /**
   * Claim prize from a completed game or lobby.
   */
  const claimPrize = useCallback(
    async (gameAddress: string) => {
      if (!connected || !walletAddress) {
        throw new Error("Wallet not connected");
      }

      try {
        const payload = buildPayload(OP_CLAIM_PRIZE, () => {});

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [
            {
              address: gameAddress,
              amount: toNano("0.05").toString(), // gas only
              payload,
            },
          ],
        });

        console.log("[TonGame] Prize claimed");
        setTimeout(() => refreshBalance(), 3000);
        return true;
      } catch (err) {
        console.error("[TonGame] ClaimPrize error:", err);
        throw err;
      }
    },
    [connected, walletAddress, tonConnectUI, refreshBalance]
  );

  /**
   * Validate bet amount
   */
  const validateBet = useCallback(
    (amount: number) => {
      if (!connected) return { valid: false, error: "Not connected" };
      if (amount < 0.01) return { valid: false, error: "Min bet: 0.01 TON" };
      if (amount > 10) return { valid: false, error: "Max bet: 10 TON" };
      if (amount + 0.1 > tonBalance)
        return { valid: false, error: "Insufficient balance" };
      return { valid: true, error: null };
    },
    [connected, tonBalance]
  );

  return {
    connected,
    walletAddress,
    tonBalance,
    masterAddress: MASTER_ADDRESS,
    isPlacingBet,
    isJoiningLobby,

    placeBet,
    joinLobby,
    claimPrize,
    validateBet,
    refreshBalance,
  };
}
