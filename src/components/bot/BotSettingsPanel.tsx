import { useState, useEffect } from "react";
import { Bot, Power, Wallet, Target, TrendingUp, Shield, Loader2, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useBotSettings, type BotConfiguration } from "../../hooks/useBotSettings";
import { useBotSession } from "../../hooks/useBotSession";
import { useBotPurchase } from "../../hooks/useBotPurchase";
import { useAssets } from "../../contexts/AssetsContext";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Character } from "~/types/character";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: "green" | "blue" | "amber";
}

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  description,
  disabled,
  variant = "green",
}: ToggleSwitchProps) {
  const colors = {
    green: {
      active: "bg-green-600",
      inactive: "bg-gray-600",
      border: enabled ? "border-green-500/40" : "border-gray-600/40",
      bg: enabled ? "bg-green-900/30" : "bg-gray-800/30",
    },
    blue: {
      active: "bg-blue-600",
      inactive: "bg-gray-600",
      border: enabled ? "border-blue-500/40" : "border-gray-600/40",
      bg: enabled ? "bg-blue-900/30" : "bg-gray-800/30",
    },
    amber: {
      active: "bg-amber-600",
      inactive: "bg-gray-600",
      border: enabled ? "border-amber-500/40" : "border-gray-600/40",
      bg: enabled ? "bg-amber-900/30" : "bg-gray-800/30",
    },
  };

  const c = colors[variant];

  return (
    <div
      onClick={disabled ? undefined : onToggle}
      className={`flex items-center justify-between p-3 rounded-lg border ${c.border} ${c.bg} ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"
      }`}
    >
      <div>
        <p className="text-white font-medium">{label}</p>
        {description && <p className="text-gray-400 text-sm">{description}</p>}
      </div>
      <div className={`relative w-12 h-6 rounded-full ${enabled ? c.active : c.inactive}`}>
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
            enabled ? "left-7" : "left-1"
          }`}
        />
      </div>
    </div>
  );
}

export function BotSettingsPanel() {
  const { activeTier } = useBotPurchase();
  const { config, isActive, budgetInfo, saveSettings, toggleBot, refillBudget, canActivate } =
    useBotSettings();
  const { sessionSignerEnabled, isLoading: sessionLoading, toggleBotSession } = useBotSession();
  const { characters } = useAssets();

  // Local state for form
  const [localConfig, setLocalConfig] = useState<Partial<BotConfiguration>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [refillAmount, setRefillAmount] = useState("0.1");
  const [isRefilling, setIsRefilling] = useState(false);

  // Sync local state with config
  useEffect(() => {
    if (config) {
      setLocalConfig({
        fixedBetAmount: config.fixedBetAmount,
        selectedCharacter: config.selectedCharacter,
        budgetLimit: config.budgetLimit,
        betMin: config.betMin,
        betMax: config.betMax,
        stopLoss: config.stopLoss,
        winStreakMultiplier: config.winStreakMultiplier,
        cooldownRounds: config.cooldownRounds,
        takeProfit: config.takeProfit,
        martingaleEnabled: config.martingaleEnabled,
        antiMartingaleEnabled: config.antiMartingaleEnabled,
        scheduleStart: config.scheduleStart,
        scheduleEnd: config.scheduleEnd,
        smartSizing: config.smartSizing,
      });
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    await saveSettings(localConfig);
    setIsSaving(false);
  };

  const handleToggleBot = async () => {
    setIsToggling(true);
    await toggleBot(!isActive);
    setIsToggling(false);
  };

  const handleRefill = async () => {
    const amount = parseFloat(refillAmount);
    if (isNaN(amount) || amount < 0.01) return;
    setIsRefilling(true);
    await refillBudget(amount);
    setIsRefilling(false);
  };

  const isPro = activeTier === "pro" || activeTier === "elite";
  const isElite = activeTier === "elite";

  const updateField = (field: keyof BotConfiguration, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));
  };

  // Convert lamports to SOL for display
  const lamportsToSol = (lamports: number | undefined) =>
    lamports ? (lamports / LAMPORTS_PER_SOL).toString() : "";
  const solToLamports = (sol: string) => {
    const num = parseFloat(sol);
    return isNaN(num) ? 0 : Math.floor(num * LAMPORTS_PER_SOL);
  };

  return (
    <div className="space-y-6">
      {/* Header with Bot Status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-indigo-100 text-xl font-semibold mb-1">Bot Settings</h3>
          <p className="text-indigo-400/70 text-sm">
            Configure your {activeTier?.toUpperCase()} bot
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="flex items-center gap-2 text-green-400 text-sm font-medium">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Active
            </span>
          ) : (
            <span className="text-gray-400 text-sm">Inactive</span>
          )}
        </div>
      </div>

      {/* Session Signer Toggle */}
      <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h4 className="text-indigo-200 font-semibold">Bot Authorization</h4>
        </div>
        <p className="text-sm text-indigo-300/70 mb-4">
          Enable the bot to sign transactions on your behalf. Your private key is never exposed.
        </p>
        <ToggleSwitch
          enabled={sessionSignerEnabled}
          onToggle={() => void toggleBotSession()}
          label="Session Signer"
          description={sessionSignerEnabled ? "Bot can place bets" : "Bot cannot place bets"}
          disabled={sessionLoading}
          variant="blue"
        />
      </div>

      {/* Budget Management */}
      <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Wallet className="w-5 h-5 text-amber-400" />
          <h4 className="text-amber-200 font-semibold">Budget</h4>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-black/30 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Limit</p>
            <p className="text-amber-300 font-bold">{budgetInfo.limitSOL.toFixed(3)} SOL</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Spent</p>
            <p className="text-red-300 font-bold">{budgetInfo.spentSOL.toFixed(3)} SOL</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3 text-center">
            <p className="text-gray-400 text-xs mb-1">Remaining</p>
            <p className="text-green-300 font-bold">{budgetInfo.remainingSOL.toFixed(3)} SOL</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
          <div
            className="bg-amber-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(budgetInfo.percentUsed, 100)}%` }}
          />
        </div>

        {/* Refill */}
        <div className="flex gap-2">
          <Input
            type="number"
            value={refillAmount}
            onChange={(e) => setRefillAmount(e.target.value)}
            placeholder="0.1"
            min="0.01"
            step="0.01"
            className="bg-black/30 border-amber-500/40 text-amber-100"
          />
          <Button
            onClick={void handleRefill}
            disabled={isRefilling}
            className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600"
          >
            {isRefilling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Rookie Settings */}
      <div className="space-y-4">
        <h4 className="text-indigo-200 font-semibold flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Basic Settings
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-indigo-300">Fixed Bet Amount (SOL)</Label>
            <Input
              type="number"
              value={lamportsToSol(localConfig.fixedBetAmount)}
              onChange={(e) => updateField("fixedBetAmount", solToLamports(e.target.value))}
              placeholder="0.001"
              min="0.001"
              step="0.001"
              className="bg-black/30 border-indigo-500/40 text-indigo-100 mt-1"
            />
          </div>
          <div>
            <Label className="text-indigo-300">Character</Label>
            <select
              value={localConfig.selectedCharacter || 1}
              onChange={(e) => updateField("selectedCharacter", parseInt(e.target.value))}
              className="w-full mt-1 px-3 py-2 bg-black/30 border border-indigo-500/40 rounded-md text-indigo-100"
            >
              {characters?.map((char: Character) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pro Settings */}
      {isPro && (
        <div className="space-y-4">
          <h4 className="text-blue-200 font-semibold flex items-center gap-2">
            <Target className="w-4 h-4" />
            Pro Settings
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-blue-300">Min Bet (SOL)</Label>
              <Input
                type="number"
                value={lamportsToSol(localConfig.betMin)}
                onChange={(e) => updateField("betMin", solToLamports(e.target.value))}
                placeholder="0.001"
                className="bg-black/30 border-blue-500/40 text-blue-100 mt-1"
              />
            </div>
            <div>
              <Label className="text-blue-300">Max Bet (SOL)</Label>
              <Input
                type="number"
                value={lamportsToSol(localConfig.betMax)}
                onChange={(e) => updateField("betMax", solToLamports(e.target.value))}
                placeholder="0.1"
                className="bg-black/30 border-blue-500/40 text-blue-100 mt-1"
              />
            </div>
            <div>
              <Label className="text-blue-300">Stop Loss (SOL)</Label>
              <Input
                type="number"
                value={lamportsToSol(localConfig.stopLoss)}
                onChange={(e) => updateField("stopLoss", solToLamports(e.target.value))}
                placeholder="0.5"
                className="bg-black/30 border-blue-500/40 text-blue-100 mt-1"
              />
            </div>
            <div>
              <Label className="text-blue-300">Win Streak Multiplier</Label>
              <Input
                type="number"
                value={localConfig.winStreakMultiplier || ""}
                onChange={(e) => updateField("winStreakMultiplier", parseFloat(e.target.value))}
                placeholder="1.5"
                min="1"
                max="5"
                step="0.1"
                className="bg-black/30 border-blue-500/40 text-blue-100 mt-1"
              />
            </div>
            <div>
              <Label className="text-blue-300">Cooldown (rounds)</Label>
              <Input
                type="number"
                value={localConfig.cooldownRounds || ""}
                onChange={(e) => updateField("cooldownRounds", parseInt(e.target.value))}
                placeholder="0"
                min="0"
                max="10"
                className="bg-black/30 border-blue-500/40 text-blue-100 mt-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Elite Settings */}
      {isElite && (
        <div className="space-y-4">
          <h4 className="text-amber-200 font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Elite Settings
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-amber-300">Take Profit (SOL)</Label>
              <Input
                type="number"
                value={lamportsToSol(localConfig.takeProfit)}
                onChange={(e) => updateField("takeProfit", solToLamports(e.target.value))}
                placeholder="1.0"
                className="bg-black/30 border-amber-500/40 text-amber-100 mt-1"
              />
            </div>
            <div>
              <Label className="text-amber-300">Schedule (UTC hours)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  value={localConfig.scheduleStart ?? ""}
                  onChange={(e) => updateField("scheduleStart", parseInt(e.target.value))}
                  placeholder="Start"
                  min="0"
                  max="23"
                  className="bg-black/30 border-amber-500/40 text-amber-100"
                />
                <Input
                  type="number"
                  value={localConfig.scheduleEnd ?? ""}
                  onChange={(e) => updateField("scheduleEnd", parseInt(e.target.value))}
                  placeholder="End"
                  min="0"
                  max="23"
                  className="bg-black/30 border-amber-500/40 text-amber-100"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <ToggleSwitch
              enabled={localConfig.martingaleEnabled ?? false}
              onToggle={() => updateField("martingaleEnabled", !localConfig.martingaleEnabled)}
              label="Martingale"
              description="Double bet after each loss"
              variant="amber"
            />
            <ToggleSwitch
              enabled={localConfig.antiMartingaleEnabled ?? false}
              onToggle={() =>
                updateField("antiMartingaleEnabled", !localConfig.antiMartingaleEnabled)
              }
              label="Anti-Martingale"
              description="Double bet after each win"
              variant="amber"
            />
            <ToggleSwitch
              enabled={localConfig.smartSizing ?? false}
              onToggle={() => updateField("smartSizing", !localConfig.smartSizing)}
              label="Smart Sizing"
              description="Bet more when pot is small"
              variant="amber"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-indigo-500/30">
        <Button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
        <Button
          onClick={() => void handleToggleBot()}
          disabled={isToggling || !canActivate}
          className={`flex-1 ${
            isActive
              ? "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600"
              : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600"
          }`}
        >
          {isToggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Power className="w-4 h-4 mr-2" />
              {isActive ? "Stop Bot" : "Start Bot"}
            </>
          )}
        </Button>
      </div>

      {!canActivate && !isActive && (
        <p className="text-amber-400 text-sm text-center">
          Enable session signer and set budget to activate the bot
        </p>
      )}
    </div>
  );
}
