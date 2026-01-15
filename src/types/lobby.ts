export interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: number;
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
}
