import { useState } from "react";
import { Bot, Check, Crown, Zap, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { useBotPurchase, type BotTier } from "../../hooks/useBotPurchase";

interface TierCardProps {
  tier: BotTier;
  name: string;
  price: number;
  features: string[];
  isOwned: boolean;
  isActive: boolean;
  canAfford: boolean;
  onPurchase: () => void;
  onSetActive: () => void;
  isPurchasing: boolean;
  isSwitching: boolean;
}

function TierCard({
  tier,
  name,
  price,
  features,
  isOwned,
  isActive,
  canAfford,
  onPurchase,
  onSetActive,
  isPurchasing,
  isSwitching,
}: TierCardProps) {
  const tierColors = {
    rookie: {
      gradient: "from-emerald-600/20 to-emerald-800/20",
      border: "border-emerald-500/40",
      text: "text-emerald-400",
      button: "from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600",
      icon: <Bot className="w-8 h-8" />,
    },
    pro: {
      gradient: "from-blue-600/20 to-blue-800/20",
      border: "border-blue-500/40",
      text: "text-blue-400",
      button: "from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600",
      icon: <Zap className="w-8 h-8" />,
    },
    elite: {
      gradient: "from-amber-600/20 to-amber-800/20",
      border: "border-amber-500/40",
      text: "text-amber-400",
      button: "from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600",
      icon: <Crown className="w-8 h-8" />,
    },
  };

  const colors = tierColors[tier];

  return (
    <div
      className={`relative rounded-xl p-4 bg-linear-to-b ${colors.gradient} border ${colors.border} flex flex-col h-full ${
        isActive ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-green-500" : ""
      } ${isOwned && !isActive ? "ring-1 ring-indigo-500/50" : ""}`}
    >
      {/* Status Badge */}
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          ACTIVE
        </div>
      )}
      {isOwned && !isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          OWNED
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className={`${colors.text}`}>{colors.icon}</div>
        <div>
          <h3 className="text-white font-bold text-lg">{name}</h3>
          <p className={`${colors.text} font-semibold`}>{price} SOL</p>
        </div>
      </div>

      <ul className="space-y-2 mb-4 flex-1">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
            <Check className={`w-4 h-4 ${colors.text} shrink-0 mt-0.5`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* Action Button - pushed to bottom */}
      {isActive ? (
        // Active bot - no action needed
        <Button disabled className="w-full bg-green-600/50 cursor-default">
          <Check className="w-4 h-4 mr-2" />
          Currently Active
        </Button>
      ) : isOwned ? (
        // Owned but not active - can switch to this bot
        <Button
          onClick={onSetActive}
          disabled={isSwitching}
          className="w-full bg-linear-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white"
        >
          {isSwitching ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Switching...
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4 mr-2" />
              Use This Bot
            </>
          )}
        </Button>
      ) : (
        // Not owned - can purchase
        <Button
          onClick={onPurchase}
          disabled={!canAfford || isPurchasing}
          className={`w-full bg-linear-to-r ${colors.button} text-white`}
        >
          {isPurchasing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Purchasing...
            </>
          ) : (
            `Purchase for ${price} SOL`
          )}
        </Button>
      )}

      {!canAfford && !isOwned && (
        <p className="text-red-400 text-xs text-center mt-2">Insufficient balance</p>
      )}
    </div>
  );
}

export function BotPurchasePanel() {
  const {
    activeTier,
    tierInfo,
    purchaseBot,
    setActiveBot,
    canAfford,
    getPrice,
    ownsTier,
  } = useBotPurchase();

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasingTier, setPurchasingTier] = useState<BotTier | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingTier, setSwitchingTier] = useState<BotTier | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    tier: BotTier | null;
  }>({ open: false, tier: null });

  // Show confirmation before purchase
  const requestPurchase = (tier: BotTier) => {
    setConfirmDialog({ open: true, tier });
  };

  // Handle confirmed purchase
  const handleConfirmedPurchase = async () => {
    const { tier } = confirmDialog;
    if (!tier) return;

    setConfirmDialog({ open: false, tier: null });
    setIsPurchasing(true);
    setPurchasingTier(tier);

    try {
      await purchaseBot(tier);
    } finally {
      setIsPurchasing(false);
      setPurchasingTier(null);
    }
  };

  // Handle switching to a different bot
  const handleSetActive = async (tier: BotTier) => {
    setIsSwitching(true);
    setSwitchingTier(tier);

    try {
      await setActiveBot(tier);
    } finally {
      setIsSwitching(false);
      setSwitchingTier(null);
    }
  };

  // Get price info for confirmation dialog
  const getConfirmationPrice = () => {
    if (!confirmDialog.tier) return 0;
    const cost = getPrice(confirmDialog.tier);
    return cost?.costSOL ?? 0;
  };

  const tiers = tierInfo?.tiers || [
    {
      id: "rookie",
      name: "Rookie",
      priceSOL: 0.1,
      features: ["Fixed bet amount", "Single character", "Budget limit", "Auto-betting"],
    },
    {
      id: "pro",
      name: "Pro",
      priceSOL: 0.5,
      features: [
        "Everything in Rookie",
        "Bet range (min/max)",
        "Stop-loss protection",
        "Win streak multiplier",
        "Cooldown between bets",
        "Character rotation",
      ],
    },
    {
      id: "elite",
      name: "Elite",
      priceSOL: 1.0,
      features: [
        "Everything in Pro",
        "Take profit auto-stop",
        "Martingale strategy",
        "Anti-Martingale strategy",
        "Time scheduling",
        "Smart pot sizing",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-indigo-100 text-xl font-semibold mb-1">Auto-Betting Bots</h3>
        <p className="text-indigo-400/70 text-sm">
          Purchase bots with different strategies. Own multiple and switch between them!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier.id as BotTier}
            name={tier.name}
            price={tier.priceSOL}
            features={tier.features}
            isOwned={ownsTier(tier.id as BotTier)}
            isActive={activeTier === tier.id}
            canAfford={canAfford(tier.id as BotTier)}
            onPurchase={() => requestPurchase(tier.id as BotTier)}
            onSetActive={() => handleSetActive(tier.id as BotTier)}
            isPurchasing={isPurchasing && purchasingTier === tier.id}
            isSwitching={isSwitching && switchingTier === tier.id}
          />
        ))}
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, tier: null });
        }}
      >
        <DialogContent className="sm:max-w-100 bg-linear-to-b from-slate-900 to-slate-950 border-amber-500/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Confirm Purchase
            </DialogTitle>
            <DialogDescription className="text-slate-300 pt-2">
              {confirmDialog.tier && (
                <>
                  You are about to purchase the{" "}
                  <span className="font-semibold text-white capitalize">
                    {confirmDialog.tier}
                  </span>{" "}
                  bot for{" "}
                  <span className="font-bold text-amber-400">
                    {getConfirmationPrice()} SOL
                  </span>
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 my-2">
            <p className="text-amber-200 text-sm">
              This transaction will transfer SOL from your wallet. This action cannot be undone.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, tier: null })}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmedPurchase}
              className="bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white"
            >
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-lg p-4">
        <h4 className="text-indigo-200 font-semibold mb-2">How it works</h4>
        <ul className="text-sm text-indigo-300/80 space-y-1">
          <li>1. Purchase one or more bot tiers (one-time payment each)</li>
          <li>2. Switch between bots to use different strategies</li>
          <li>3. Configure your active bot's settings</li>
          <li>4. Enable the bot to start auto-betting</li>
        </ul>
      </div>
    </div>
  );
}
