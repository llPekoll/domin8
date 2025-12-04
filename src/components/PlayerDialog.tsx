import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { X, Sparkles, Users, Coins } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { CharacterSelector } from "./CharacterSelector";
import { AuraSelector } from "./AuraSelector";
import type { Character } from "../types/character";

type TabType = "characters" | "auras";

interface PlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: TabType;
  onCharacterSelected?: (character: Character) => void;
  onAuraEquipped?: (auraId: number | null) => void;
}

export function PlayerDialog({
  open,
  onOpenChange,
  defaultTab = "characters",
  onCharacterSelected,
  onAuraEquipped,
}: PlayerDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const { walletAddress } = usePrivyWallet();

  // Selected character state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Reset to default tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  // Player data for points display
  const playerData = useQuery(api.players.getPlayer, walletAddress ? { walletAddress } : "skip");
  const playerPoints = playerData?.totalPoints ?? 0;

  // Handle character selection
  const handleSelectCharacter = (character: Character) => {
    setSelectedCharacterId(character._id);
    onCharacterSelected?.(character);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[700px] p-0 bg-gradient-to-b from-indigo-950/98 to-slate-950/98 backdrop-blur-md border border-indigo-500/40 overflow-hidden"
      >
        <DialogTitle className="sr-only">Customize Character</DialogTitle>

        {/* Custom close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 text-white hover:text-yellow-400 transition-colors border-2 border-white/50 hover:border-yellow-400 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex min-h-[500px]">
          {/* Sidebar Navigation */}
          <div className="w-[140px] bg-black/40 border-r border-indigo-500/30 py-4 flex flex-col">
            <div className="px-3 mb-4">
              <h2 className="text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                Customize
              </h2>
            </div>

            <button
              onClick={() => setActiveTab("characters")}
              className={`flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                activeTab === "characters"
                  ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                  : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Characters</span>
            </button>

            <button
              onClick={() => setActiveTab("auras")}
              className={`flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                activeTab === "auras"
                  ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                  : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Auras</span>
            </button>

            {/* Points Display */}
            <div className="mt-auto px-3 py-3 border-t border-indigo-500/30">
              <div className="flex items-center gap-2 text-sm">
                <Coins className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-300 font-bold">{playerPoints.toLocaleString()}</span>
              </div>
              <p className="text-indigo-500 text-xs mt-1">Your Points</p>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === "characters" && (
              <CharacterSelector
                selectedCharacterId={selectedCharacterId}
                onCharacterSelected={handleSelectCharacter}
              />
            )}

            {activeTab === "auras" && <AuraSelector onAuraEquipped={onAuraEquipped} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
