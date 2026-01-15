import { Bot, Crown, Zap } from "lucide-react";
import { useBotPurchase } from "../hooks/useBotPurchase";
import { useBotSettings } from "../hooks/useBotSettings";

interface BotControlTabProps {
  onClick: () => void;
}

export function BotControlTab({ onClick }: BotControlTabProps) {
  const { activeTier, hasPurchased } = useBotPurchase();
  const { isActive } = useBotSettings();

  const getTierIcon = () => {
    if (!activeTier) return <Bot className="w-4 h-4" />;
    switch (activeTier) {
      case "elite":
        return <Crown className="w-4 h-4" />;
      case "pro":
        return <Zap className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getTierColor = () => {
    if (!activeTier) return "text-indigo-400";
    switch (activeTier) {
      case "elite":
        return "text-amber-400";
      case "pro":
        return "text-blue-400";
      default:
        return "text-emerald-400";
    }
  };

  const getBorderColor = () => {
    if (isActive) return "border-green-500/50 ring-1 ring-green-500/30";
    if (!activeTier) return "border-indigo-500/40";
    switch (activeTier) {
      case "elite":
        return "border-amber-500/40";
      case "pro":
        return "border-blue-500/40";
      default:
        return "border-emerald-500/40";
    }
  };

  return (
    <button
      onClick={onClick}
      className={`
        -mb-1 mr-4 flex items-center gap-2 px-4 py-2 rounded-t-lg transition-all
        bg-gradient-to-b from-indigo-900/80 to-indigo-950/80
        border border-b-0 ${getBorderColor()}
        hover:from-indigo-800/80 hover:to-indigo-900/80
        cursor-pointer
      `}
    >
      <span className={getTierColor()}>{getTierIcon()}</span>
      <span className="text-sm font-medium text-indigo-200">
        {hasPurchased
          ? `${activeTier?.charAt(0).toUpperCase()}${activeTier?.slice(1)} Bot`
          : "Auto-Bot"}
      </span>
      {isActive && (
        <span className="relative flex h-2 w-2 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
    </button>
  );
}
