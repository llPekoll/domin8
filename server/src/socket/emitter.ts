/**
 * Socket.io broadcast functions
 */
import type { Server } from "socket.io";
import { getParticipants } from "../game/gameQueries.js";

let io: Server | null = null;

export function setEmitterIO(socketIO: Server) {
  io = socketIO;
}

/**
 * Broadcast participants update to all clients
 */
export async function emitParticipantsUpdate(gameRound: number) {
  if (!io) return;
  try {
    const participants = await getParticipants(gameRound);
    io.emit("participants-update", { gameRound, participants });
  } catch (error) {
    console.error("[Emitter] Error emitting participants:", error);
  }
}

/**
 * Broadcast chat message to all clients
 */
export function emitChatMessage(message: {
  id?: number;
  senderWallet?: string;
  senderName?: string;
  message: string;
  type: string;
  gameType?: string;
  timestamp: number;
}) {
  if (!io) return;
  io.emit("chat-message", message);
}

/**
 * Broadcast game state update to all clients
 */
export function emitGameStateUpdate(gameState: any) {
  if (!io) return;
  io.emit("game-state-update", gameState);
}

/**
 * Broadcast lobby update to all clients
 */
export function emitLobbyUpdate(lobby: any) {
  if (!io) return;
  io.emit("lobby-update", lobby);
}
