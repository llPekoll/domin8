import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { X, Lock, Check, Coins } from "lucide-react";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { useShopPurchase } from "../hooks/useShopPurchase";

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

interface AuraSelectorProps {
  onAuraEquipped?: (auraId: number | null) => void;
}

export function AuraSelector({ onAuraEquipped }: AuraSelectorProps) {
  const { walletAddress } = usePrivyWallet();

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
  const playerData = useQuery(api.players.getPlayer, walletAddress ? { walletAddress } : "skip");

  // Aura mutations
  const unlockWithPoints = useMutation(api.auras.unlockWithPoints);
  const equipAura = useMutation(api.auras.equipAura);

  // Shop purchase hook for SOL purchases
  const { purchaseItem, isPurchasing } = useShopPurchase();

  // Player points
  const playerPoints = playerData?.totalPoints ?? 0;

  // Check if player owns an aura
  const ownsAura = (auraId: number) => {
    return playerAuras?.some((pa) => pa.auraId === auraId) ?? false;
  };

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

  // Handle purchase with SOL
  const handlePurchaseWithSol = async (auraId: number, priceInLamports: number) => {
    if (!walletAddress) return;

    const result = await purchaseItem("aura", auraId, priceInLamports);
    if (result.success) {
      toast.success(`Purchased ${result.itemName}!`);
    } else {
      toast.error(result.error || "Failed to purchase aura");
    }
  };

  // Handle equip aura
  const handleEquipAura = async (auraId: number | null) => {
    if (!walletAddress) return;

    try {
      await equipAura({ walletAddress, auraId: auraId ?? undefined });
      onAuraEquipped?.(auraId);
      toast.success(auraId ? "Aura equipped!" : "Aura removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to equip aura");
    }
  };

  // Format SOL price
  const formatSol = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(2);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-indigo-100 text-xl font-semibold mb-1">Select Aura</h3>
        <p className="text-indigo-400/70 text-sm">Unlock and equip auras for your character</p>
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
          const canAffordPoints = playerPoints >= (aura.pointsCost ?? 0);
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
              <p className="text-xs text-center text-indigo-200 mt-2 font-medium">{aura.name}</p>
              <p className={`text-xs text-center capitalize ${rarityColor}`}>{aura.rarity}</p>

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
                    <button
                      onClick={() => handleEquipAura(aura.id)}
                      className="w-full h-7 text-xs bg-indigo-600/50 border border-indigo-500 hover:bg-indigo-500 rounded-md text-indigo-100"
                    >
                      Equip
                    </button>
                  )
                ) : (
                  <div className="space-y-1">
                    {/* Points unlock */}
                    <button
                      onClick={() => handleUnlockWithPoints(aura.id)}
                      disabled={!canAffordPoints}
                      className={`w-full h-6 text-xs flex items-center justify-center rounded-md border ${
                        canAffordPoints
                          ? "bg-yellow-600/50 border-yellow-500 hover:bg-yellow-500 text-yellow-100"
                          : "bg-gray-700/50 border-gray-600 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      <Coins className="w-3 h-3 mr-1" />
                      {aura.pointsCost?.toLocaleString()}
                    </button>

                    {/* SOL purchase */}
                    {aura.purchasePrice && (
                      <button
                        onClick={() => handlePurchaseWithSol(aura.id, aura.purchasePrice!)}
                        disabled={isPurchasing}
                        className="w-full h-6 text-xs bg-orange-600 border border-orange-500 hover:bg-orange-500 text-white rounded-md disabled:opacity-50"
                      >
                        {isPurchasing ? "..." : `${formatSol(aura.purchasePrice!)} SOL`}
                      </button>
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
  );
}
