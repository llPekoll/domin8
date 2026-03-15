// Solana and Anchor types for the Domin8 program
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import Domin8PrgmIDL from "../../../target/idl/domin8_prgm.json";

// Extract Program ID from IDL
export const DOMIN8_PROGRAM_ID = new PublicKey(Domin8PrgmIDL.address);

// Game configuration structure
export interface GameConfig {
  admin: string;
  treasury: string;
  gameRound: number;
  houseFee: number;
  minDepositAmount: number;
  maxDepositAmount: number;
  roundTime: number;
  lock: boolean;
  force: number[];
}

// Bet info structure (stored inline in game)
export interface BetInfoStruct {
  walletIndex: number;
  amount: number;
  skin: number;
  position: [number, number];
}

// Game round state
export interface GameRound {
  gameRound: number;
  startDate: number;
  endDate: number;
  totalDeposit: number;
  rand: string;
  map: number;
  userCount: number;
  force: number[];
  status: number; // 0=open, 1=closed, 2=waiting
  winner: string | null;
  winnerPrize: number;
  winningBetIndex: number | null;
  wallets: string[];
  bets: BetInfoStruct[];
  prizeSent?: boolean;

  // Computed properties for backward compatibility
  roundId?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  totalPot?: number;
  betCount?: number;
  betAmounts?: number[];
  betSkin?: number[];
  betPosition?: number[][];
  betWalletIndex?: number[];
}

// PDA seeds
export const PDA_SEEDS = {
  DOMIN8_CONFIG: Buffer.from("domin8_config"),
  ACTIVE_GAME: Buffer.from("active_game"),
  DOMIN8_GAME: Buffer.from("domin8_game"),
} as const;

// Transaction types for logging
export const TRANSACTION_TYPES = {
  END_GAME: "end_game",
  SEND_PRIZE_WINNER: "send_prize_winner",
  DELETE_GAME: "delete_game",
} as const;

// Instruction names
export const INSTRUCTION_NAMES = {
  INITIALIZE_CONFIG: "initialize_config",
  CREATE_GAME_ROUND: "create_game_round",
  BET: "bet",
  END_GAME: "end_game",
  SEND_PRIZE_WINNER: "send_prize_winner",
  DELETE_GAME: "delete_game",
} as const;

// Game status constants (matching smart contract)
export const GAME_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  WAITING: 2,
} as const;

// Game timing constants (in milliseconds)
export const GAME_TIMING = {
  CRON_INTERVAL: 50_000,
  SEND_PRIZE_DELAY: 2_000,
  CREATE_GAME_DELAY: 18_000,
} as const;

// Scheduled job actions
export const JOB_ACTIONS = {
  END_GAME: "end_game",
  SEND_PRIZE: "send_prize",
  CREATE_GAME: "create_game",
} as const;
