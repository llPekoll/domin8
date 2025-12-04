import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  Lock,
  Check,
  Users,
  Crown,
  Coins,
} from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useNFTCharacters } from "../hooks/useNFTCharacters";
import { useAssets } from "../contexts/AssetsContext";
import type { Character } from "../types/character";

type TabType = "characters" | "auras";

interface PlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: TabType;
  onCharacterSelected?: (character: Character) => void;
  onAuraEquipped?: (auraId: number | null) => void;
}

// Rarity colors
const RARITY_COLORS: Record<string, string> = {
  common: "text-gray-300 border-gray-500",
  rare: "text-blue-400 border-blue-500",
  legendary: "text-yellow-400 border-yellow-500",
};

const RARITY_BG: Record<string, string> = {
  common: "bg-gray-900/50",
  rare: "bg-blue-900/30",
  legendary: "bg-yellow-900/20",
};

export function PlayerDialog({
  open,
  onOpenChange,
  defaultTab = "characters",
  onCharacterSelected,
  onAuraEquipped,
}: PlayerDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const { walletAddress, externalWalletAddress } = usePrivyWallet();
  const { characters: allCharacters } = useAssets();

  // NFT character checking
  const { unlockedCharacters } = useNFTCharacters(externalWalletAddress, walletAddress);

  // Check if a character is locked (NFT-gated but user doesn't own)
  const isCharacterLocked = useCallback(
    (character: Character) => {
      if (!character.nftCollection) return false;
      if (unlockedCharacters?.some((c) => c._id === character._id)) return false;
      return true;
    },
    [unlockedCharacters]
  );

  // Selected items for preview
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedAuraId, setSelectedAuraId] = useState<number | null>(null);

  // Reset to default tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  // Aura queries
  const allAuras = useQuery(api.auras.getAll);
  const playerAuras = useQuery(
    api.auras.getPlayerAuras,
    walletAddress ? { walletAddress } : "skip"
  );
  const equippedAura = useQuery(
    api.auras.getEquippedAura,
    walletAddress ? { walletAddress } : "skip"
  );
  const playerData = useQuery(
    api.players.getPlayer,
    walletAddress ? { walletAddress } : "skip"
  );

  // Aura mutations
  const unlockWithPoints = useMutation(api.auras.unlockWithPoints);
  const equipAura = useMutation(api.auras.equipAura);

  // Player points
  const playerPoints = playerData?.totalPoints ?? 0;

  // Check if player owns an aura
  const ownsAura = (auraId: number) => {
    return playerAuras?.some((pa) => pa.auraId === auraId) ?? false;
  };

  // Get current character
  const currentCharacter = useMemo(() => {
    if (!allCharacters || !selectedCharacterId) return null;
    return allCharacters.find((c) => c._id === selectedCharacterId) ?? null;
  }, [allCharacters, selectedCharacterId]);

  // Handle unlock with points
  const handleUnlockWithPoints = async (auraId: number) => {
    if (!walletAddress) return;

    try {
      const result = await unlockWithPoints({ walletAddress, auraId });
      toast.success(`Unlocked ${result.auraName}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlock aura");
    }
  };

  // Handle equip aura
  const handleEquipAura = async (auraId: number | null) => {
    if (!walletAddress) return;

    try {
      await equipAura({ walletAddress, auraId: auraId ?? undefined });
      setSelectedAuraId(auraId);
      onAuraEquipped?.(auraId);
      toast.success(auraId ? "Aura equipped!" : "Aura removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to equip aura");
    }
  };

  // Handle character selection
  const handleSelectCharacter = (character: Character) => {
    setSelectedCharacterId(character._id);
    onCharacterSelected?.(character);
  };

  // Format SOL price
  const formatSol = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(2);
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
                <span className="text-yellow-300 font-bold">
                  {playerPoints.toLocaleString()}
                </span>
              </div>
              <p className="text-indigo-500 text-xs mt-1">Your Points</p>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Characters Tab */}
            {activeTab === "characters" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-indigo-100 text-xl font-semibold mb-1">
                    Select Character
                  </h3>
                  <p className="text-indigo-400/70 text-sm">
                    Choose your fighter for battle
                  </p>
                </div>

                {/* Character Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {allCharacters?.map((character) => {
                    const isSelected = selectedCharacterId === character._id;
                    const isLocked = isCharacterLocked(character);
                    const isNFTCharacter = !!character.nftCollection;

                    return (
                      <button
                        key={character._id}
                        onClick={() => !isLocked && handleSelectCharacter(character)}
                        disabled={isLocked}
                        className={`relative p-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-indigo-400 bg-indigo-600/30"
                            : isLocked
                              ? "border-gray-600 bg-gray-900/50 opacity-50 cursor-not-allowed"
                              : "border-indigo-500/30 bg-black/30 hover:border-indigo-400/60 hover:bg-indigo-900/20"
                        }`}
                      >
                        {/* Character Preview */}
                        <div className="w-full aspect-square flex items-center justify-center overflow-hidden">
                          <img
                            src={`/assets/characters/${character.name}Splash.gif`}
                            alt={character.name}
                            className={`w-16 h-16 object-contain ${isLocked ? "grayscale" : ""}`}
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Character Name */}
                        <p className="text-xs text-center text-indigo-200 mt-1 truncate">
                          {character.name}
                        </p>

                        {/* NFT Badge - Crown for NFT chars (yellow if owned, gray if locked) */}
                        {isNFTCharacter && (
                          <div className="absolute top-1 right-1">
                            <Crown className={`w-4 h-4 ${isLocked ? "text-gray-500" : "text-yellow-500"}`} />
                          </div>
                        )}

                        {/* Lock overlay for locked characters */}
                        {isLocked && (
                          <div className="absolute top-1 left-1">
                            <Lock className="w-4 h-4 text-gray-400" />
                          </div>
                        )}

                        {/* Selected Check */}
                        {isSelected && !isLocked && (
                          <div className="absolute top-1 left-1 bg-indigo-500 rounded-full p-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auras Tab */}
            {activeTab === "auras" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-indigo-100 text-xl font-semibold mb-1">
                    Select Aura
                  </h3>
                  <p className="text-indigo-400/70 text-sm">
                    Unlock and equip auras for your character
                  </p>
                </div>

                {/* Aura Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {/* None Option */}
                  <button
                    onClick={() => handleEquipAura(null)}
                    className={`relative p-3 rounded-lg border-2 transition-all ${
                      !equippedAura
                        ? "border-indigo-400 bg-indigo-600/30"
                        : "border-indigo-500/30 bg-black/30 hover:border-indigo-400/60"
                    }`}
                  >
                    <div className="w-full aspect-square flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full border-2 border-dashed border-indigo-500/50 flex items-center justify-center">
                        <X className="w-6 h-6 text-indigo-500" />
                      </div>
                    </div>
                    <p className="text-xs text-center text-indigo-200 mt-2">None</p>
                    {!equippedAura && (
                      <div className="absolute top-1 left-1 bg-indigo-500 rounded-full p-0.5">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>

                  {/* Aura Cards */}
                  {allAuras?.map((aura) => {
                    const isOwned = ownsAura(aura.id);
                    const isEquipped = equippedAura?.id === aura.id;
                    const canAfford = playerPoints >= (aura.pointsCost ?? 0);
                    const rarityColor = RARITY_COLORS[aura.rarity] ?? RARITY_COLORS.common;
                    const rarityBg = RARITY_BG[aura.rarity] ?? RARITY_BG.common;

                    return (
                      <div
                        key={aura.id}
                        className={`relative p-3 rounded-lg border-2 transition-all ${
                          isEquipped
                            ? "border-indigo-400 bg-indigo-600/30"
                            : isOwned
                              ? `border-indigo-500/50 ${rarityBg} hover:border-indigo-400/60`
                              : `border-gray-600/50 ${rarityBg} opacity-75`
                        }`}
                      >
                        {/* Aura Preview */}
                        <div className="w-full aspect-square flex items-center justify-center">
                          <img
                            src={`/assets/auras/Aura-${aura.assetKey}-Splash.gif`}
                            alt={aura.name}
                            className={`w-12 h-12 object-contain ${!isOwned ? "grayscale" : ""}`}
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>

                        {/* Lock icon top-left for locked auras */}
                        {!isOwned && (
                          <div className="absolute top-1 left-1">
                            <Lock className="w-4 h-4 text-gray-400" />
                          </div>
                        )}

                        {/* Aura Name & Rarity */}
                        <p className="text-xs text-center text-indigo-200 mt-2 font-medium">
                          {aura.name}
                        </p>
                        <p className={`text-xs text-center capitalize ${rarityColor}`}>
                          {aura.rarity}
                        </p>

                        {/* Equipped Badge */}
                        {isEquipped && (
                          <div className="absolute top-1 left-1 bg-indigo-500 rounded-full p-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="mt-2">
                          {isOwned ? (
                            !isEquipped && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEquipAura(aura.id)}
                                className="w-full h-7 text-xs bg-indigo-600/50 border-indigo-500 hover:bg-indigo-500"
                              >
                                Equip
                              </Button>
                            )
                          ) : (
                            <div className="space-y-1">
                              {/* Points unlock */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUnlockWithPoints(aura.id)}
                                disabled={!canAfford}
                                className={`w-full h-6 text-xs ${
                                  canAfford
                                    ? "bg-yellow-600/50 border-yellow-500 hover:bg-yellow-500 text-yellow-100"
                                    : "bg-gray-700/50 border-gray-600 text-gray-400 cursor-not-allowed"
                                }`}
                              >
                                <Coins className="w-3 h-3 mr-1" />
                                {aura.pointsCost?.toLocaleString()}
                              </Button>

                              {/* SOL purchase */}
                              {aura.purchasePrice && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    // TODO: Implement SOL purchase
                                    toast.info("SOL purchase coming soon!");
                                  }}
                                  className="w-full h-6 text-xs bg-purple-600/50 border-purple-500 hover:bg-purple-500 text-purple-100"
                                >
                                  {formatSol(aura.purchasePrice)} SOL
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Info Text */}
                <p className="text-indigo-500/70 text-xs text-center pt-2">
                  Earn points by playing games (1 point per 0.001 SOL bet)
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
