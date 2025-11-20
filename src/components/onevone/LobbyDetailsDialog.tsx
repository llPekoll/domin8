import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import type { Character } from "../../types/character";

interface LobbyData {
  _id: string;
  lobbyId: number;
  playerA: string;
  amount: number;
  characterA: number;
  mapId: number;
  status: 0 | 1 | 2;
}

interface LobbyDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lobby: LobbyData | null;
  onJoin: (lobbyId: number) => void;
}

export function LobbyDetailsDialog({ isOpen, onClose, lobby, onJoin }: LobbyDetailsDialogProps) {
  if (!lobby) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-indigo-500 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-indigo-400">
            Lobby #{lobby.lobbyId}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Player Info */}
          <div className="bg-black/50 p-4 rounded-lg border border-indigo-500/30">
            <p className="text-sm text-gray-400 mb-1">Challenger</p>
            <p className="font-mono text-indigo-300 break-all">{lobby.playerA}</p>
          </div>

          {/* Game Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/50 p-3 rounded-lg border border-indigo-500/30">
              <p className="text-xs text-gray-400 mb-1">Bet Amount</p>
              <p className="text-lg font-bold text-yellow-400">{(lobby.amount / 1e9).toFixed(2)} SOL</p>
            </div>
            <div className="bg-black/50 p-3 rounded-lg border border-indigo-500/30">
              <p className="text-xs text-gray-400 mb-1">Map ID</p>
              <p className="text-lg font-bold text-indigo-300">#{lobby.mapId}</p>
            </div>
          </div>

          {/* Character Preview (Placeholder) */}
          <div className="bg-black/50 p-4 rounded-lg border border-indigo-500/30 text-center">
            <p className="text-sm text-gray-400 mb-2">Character #{lobby.characterA}</p>
            <div className="h-32 flex items-center justify-center bg-gray-800 rounded">
               <span className="text-gray-500">Character Preview</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => onJoin(lobby.lobbyId)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-900/20"
          >
            Join Battle ({(lobby.amount / 1e9).toFixed(2)} SOL)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
