// Solana and Anchor types for the Domin8 program
"use node";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Program ID (matches deployed program and IDL)
export const DOMIN8_PROGRAM_ID = new PublicKey("JC7KUWuJH7SV9jcFM87J5tY1648G97jT1KShaZRy3tnj");

// Game configuration structure (risk-based architecture)
// Note: PublicKeys are serialized as strings for Convex compatibility
export interface GameConfig {
  admin: string; // Changed from authority
  treasury: string;
  gameRound: number; // NEW: current/next game round number
  houseFee: number; // Changed from houseFeeBasisPoints
  minDepositAmount: number; // Changed from minBetLamports
  maxDepositAmount: number; // NEW: maximum bet amount
  roundTime: number; // NEW: game duration in seconds
  lock: boolean; // Changed from betsLocked
  force: number[]; // NEW: VRF force seed (32 bytes)
}

// Bet info structure (risk architecture - stored inline in game)
export interface BetInfoStruct {
  walletIndex: number;
  amount: number;
  skin: number;
  position: [number, number];
}

// Game round state (risk-based architecture - matches Domin8Game)
// Note: PublicKeys are serialized as strings for Convex compatibility
export interface GameRound {
  gameRound: number; // Changed from roundId
  startDate: number; // Changed from startTimestamp
  endDate: number; // Changed from endTimestamp
  totalDeposit: number; // Changed from totalPot
  rand: number; // NEW: VRF randomness value
  userCount: number; // NEW: unique user count
  force: number[]; // NEW: VRF force seed (32 bytes)
  status: number; // NEW: 0=open, 1=closed (was enum)
  winner: string | null; // PublicKey as base58 string or null
  winnerPrize: number; // Changed from winnerPrizeUnclaimed
  winningBetIndex: number | null; // Index of the winning bet
  wallets: string[]; // NEW: Array of unique wallet addresses
  bets: BetInfoStruct[]; // NEW: Array of bet info structs

  // Computed properties for backward compatibility
  roundId?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  totalPot?: number;
  betCount?: number;
  betAmounts?: number[];
  betSkin?: number[];
  betPosition?: number[][];
}

// PDA seeds (updated for risk-based architecture)
export const PDA_SEEDS = {
  DOMIN8_CONFIG: Buffer.from("domin8_config"), // Changed from game_config
  ACTIVE_GAME: Buffer.from("active_game"), // NEW: replaces game_counter
  DOMIN8_GAME: Buffer.from("domin8_game"), // Changed from game_round
  // Removed: BET_ENTRY (bets now stored inline in game)
  // Removed: VAULT (not used in risk architecture)
} as const;

// Transaction types for logging (updated for risk-based architecture)
export const TRANSACTION_TYPES = {
  END_GAME: "end_game", // Changed from close_betting_window
  SEND_PRIZE_WINNER: "send_prize_winner", // Changed from select_winner_and_payout
  DELETE_GAME: "delete_game", // Changed from cleanup_old_game
} as const;

// Instruction names (updated for risk-based architecture)
export const INSTRUCTION_NAMES = {
  INITIALIZE_CONFIG: "initialize_config", // Changed from initialize
  CREATE_GAME_ROUND: "create_game_round", // Changed from create_game
  BET: "bet", // Changed from place_bet
  END_GAME: "end_game", // Changed from close_betting_window
  SEND_PRIZE_WINNER: "send_prize_winner", // Changed from select_winner_and_payout
  DELETE_GAME: "delete_game", // Changed from cleanup_old_game
} as const;
