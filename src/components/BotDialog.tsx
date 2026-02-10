import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Bot, Settings, BarChart3, ShoppingCart, X } from "lucide-react";
import { useBotPurchase } from "../hooks/useBotPurchase";
import { useBotSettings } from "../hooks/useBotSettings";
import { BotPurchasePanel } from "./bot/BotPurchasePanel";
import { BotSettingsPanel } from "./bot/BotSettingsPanel";
import { BotStatsPanel } from "./bot/BotStatsPanel";

type TabType = "purchase" | "settings" | "stats";

interface BotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BotDialog({ open, onOpenChange }: BotDialogProps) {
  const { hasPurchased, activeTier } = useBotPurchase();
  const { isActive } = useBotSettings();

  // Default to purchase tab if no bot, otherwise settings
  const defaultTab: TabType = hasPurchased ? "settings" : "purchase";
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  // Reset to appropriate tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(hasPurchased ? "settings" : "purchase");
    }
  }, [open, hasPurchased]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[750px] p-0 bg-linear-to-b from-indigo-950/98 to-slate-950/98 backdrop-blur-md border border-indigo-500/40 overflow-hidden"
      >
        {/* Custom close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 text-white hover:text-yellow-400 transition-colors border-2 border-white/50 hover:border-yellow-400 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex min-h-[550px]">
          {/* Sidebar Navigation */}
          <div className="w-40 bg-black/40 border-r border-indigo-500/30 py-4 flex flex-col">
            <div className="px-4 mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-400" />
              <h2 className="text-indigo-300 text-sm font-semibold uppercase tracking-wider">
                Auto-Bot
              </h2>
            </div>

            {/* Current tier badge */}
            {activeTier && (
              <div className="px-4 mb-4">
                <span
                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase ${
                    activeTier === "elite"
                      ? "bg-amber-500/20 text-amber-400"
                      : activeTier === "pro"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {activeTier}
                </span>
                {isActive && (
                  <span className="ml-2 inline-flex items-center">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  </span>
                )}
              </div>
            )}

            <nav className="flex-1">
              {/* Purchase Tab - Always visible */}
              <button
                onClick={() => setActiveTab("purchase")}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                  activeTab === "purchase"
                    ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                    : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="font-medium">
                  {hasPurchased ? "Bots" : "Purchase"}
                </span>
              </button>

              {/* Settings Tab - Only if purchased */}
              {hasPurchased && (
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                    activeTab === "settings"
                      ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                      : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Settings</span>
                </button>
              )}

              {/* Stats Tab - Only if purchased */}
              {hasPurchased && (
                <button
                  onClick={() => setActiveTab("stats")}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                    activeTab === "stats"
                      ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                      : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
                  }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span className="font-medium">Stats</span>
                </button>
              )}
            </nav>

            {/* Help text at bottom */}
            <div className="px-4 mt-auto">
              <p className="text-indigo-500 text-xs">
                Bot places bets automatically when you're away
              </p>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto max-h-[550px]">
            {activeTab === "purchase" && <BotPurchasePanel />}
            {activeTab === "settings" && hasPurchased && <BotSettingsPanel />}
            {activeTab === "stats" && hasPurchased && <BotStatsPanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
