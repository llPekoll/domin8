import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { User, Trophy, X, Volume2, Music, Flame, Zap } from "lucide-react";
import { logger } from "../lib/logger";
import { SoundManager } from "../game/managers/SoundManager";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName?: string;
  walletAddress: string;
}

type TabType = "profile" | "sound";

export function ProfileDialog({
  open,
  onOpenChange,
  currentName,
  walletAddress
}: ProfileDialogProps) {
  const [displayName, setDisplayName] = useState(currentName || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("profile");

  // Sound settings state
  const [allSoundsMuted, setAllSoundsMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [fireSoundsMuted, setFireSoundsMuted] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);

  const updateDisplayName = useMutation(api.players.updateDisplayName);

  // Initialize sound settings from SoundManager
  useEffect(() => {
    SoundManager.initialize();
    setAllSoundsMuted(SoundManager.isSoundMuted());
    setMusicMuted(SoundManager.isMusicMutedState());
    setFireSoundsMuted(SoundManager.isFireSoundsMutedState());
    setSfxMuted(SoundManager.isSfxMutedState());
  }, [open]);

  // Fetch player data
  const playerData = useQuery(
    api.players.getPlayer,
    { walletAddress }
  );

  // Fetch recent games
  const recentGames = useQuery(
    api.players.getRecentGames,
    { walletAddress, limit: 10 }
  );

  const totalWins = playerData?.totalWins ?? 0;
  const totalGames = playerData?.totalGamesPlayed ?? 0;
  const totalLosses = totalGames - totalWins;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      toast.error("Please enter a display name");
      return;
    }

    if (displayName.trim().length < 3) {
      toast.error("Display name must be at least 3 characters");
      return;
    }

    if (displayName.trim().length > 20) {
      toast.error("Display name must be less than 20 characters");
      return;
    }

    setIsUpdating(true);
    try {
      await updateDisplayName({
        walletAddress,
        displayName: displayName.trim()
      });
      toast.success("Display name updated successfully!");
      onOpenChange(false);
    } catch (error) {
      logger.ui.error("Failed to update display name:", error);
      toast.error("Failed to update display name. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatSol = (lamports: number) => {
    return (lamports / 1_000_000_000).toFixed(3);
  };

  // Sound toggle handlers
  const handleAllSoundsToggle = () => {
    const newValue = !allSoundsMuted;
    setAllSoundsMuted(newValue);
    SoundManager.setMuted(newValue);
  };

  const handleMusicToggle = () => {
    const newValue = !musicMuted;
    setMusicMuted(newValue);
    SoundManager.setMusicMuted(newValue);
  };

  const handleFireSoundsToggle = () => {
    const newValue = !fireSoundsMuted;
    setFireSoundsMuted(newValue);
    SoundManager.setFireSoundsMuted(newValue);
  };

  const handleSfxToggle = () => {
    const newValue = !sfxMuted;
    setSfxMuted(newValue);
    SoundManager.setSfxMuted(newValue);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[650px] p-0 bg-gradient-to-b from-indigo-950/98 to-slate-950/98 backdrop-blur-md border border-indigo-500/40 overflow-hidden">
        {/* Custom close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 text-white hover:text-yellow-400 transition-colors border-2 border-white/50 hover:border-yellow-400 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex min-h-[450px]">
          {/* Sidebar Navigation */}
          <div className="w-[140px] bg-black/40 border-r border-indigo-500/30 py-4 flex flex-col">
            <div className="px-3 mb-4">
              <h2 className="text-indigo-300 text-xs font-semibold uppercase tracking-wider">Settings</h2>
            </div>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                activeTab === "profile"
                  ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                  : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
              }`}
            >
              <User className="w-5 h-5" />
              <span className="font-medium">Profile</span>
            </button>

            <button
              onClick={() => setActiveTab("sound")}
              className={`flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2 ${
                activeTab === "sound"
                  ? "bg-indigo-600/30 border-l-indigo-400 text-indigo-100"
                  : "border-l-transparent text-indigo-400 hover:bg-indigo-900/30 hover:text-indigo-200"
              }`}
            >
              <Volume2 className="w-5 h-5" />
              <span className="font-medium">Sound</span>
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Profile Tab Content */}
            {activeTab === "profile" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-indigo-100 text-xl font-semibold mb-1">Profile Settings</h3>
                  <p className="text-indigo-400/70 text-sm">Customize your display name</p>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                  {/* Display Name */}
                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-indigo-300 text-base">
                      Display Name
                    </Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your display name"
                      className="bg-black/30 border-indigo-500/40 text-indigo-100 text-base placeholder:text-indigo-600 focus:outline-none focus:border-indigo-400"
                      maxLength={20}
                      minLength={3}
                      required
                    />
                    <p className="text-xs text-indigo-400/70">
                      3-20 characters. This will be shown in the game.
                    </p>
                  </div>

                  {/* Recent Games Header with Stats */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-indigo-100 text-lg font-semibold">Recent Games</Label>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-green-400" />
                          <span className="text-green-300 font-bold">{totalWins}</span>
                          <span className="text-indigo-400">W</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-red-300 font-bold">{totalLosses}</span>
                          <span className="text-indigo-400">L</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-black/30 rounded-md border border-indigo-500/40 max-h-[180px] overflow-y-auto">
                      {recentGames === undefined ? (
                        <div className="text-center py-4 text-indigo-400/60 text-sm">Loading...</div>
                      ) : recentGames.length === 0 ? (
                        <div className="text-center py-4 text-indigo-400/60 text-sm">No games played yet</div>
                      ) : (
                        <div className="divide-y divide-indigo-500/20">
                          {recentGames.map((game) => (
                            <div
                              key={game.roundId}
                              className={`px-3 py-2 flex items-center justify-between ${
                                game.isWinner ? "bg-green-900/20" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                  game.isWinner
                                    ? "bg-green-500/30 text-green-300"
                                    : "bg-red-500/30 text-red-300"
                                }`}>
                                  {game.isWinner ? "WIN" : "LOSS"}
                                </span>
                                <span className="text-xs text-indigo-400">
                                  {formatTimestamp(game.timestamp)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-indigo-300">
                                  {game.playerCount}p
                                </span>
                                <span className="text-indigo-100 font-semibold">
                                  {game.isWinner ? "+" : "-"}{formatSol(game.isWinner ? game.prizeWon : game.playerBetAmount)} SOL
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isUpdating}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50"
                  >
                    {isUpdating ? "Updating..." : "Save Changes"}
                  </Button>
                </form>
              </div>
            )}

            {/* Sound Tab Content */}
            {activeTab === "sound" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-indigo-100 text-xl font-semibold mb-1">Sound Settings</h3>
                  <p className="text-indigo-400/70 text-sm">Control game audio</p>
                </div>

                {/* Master Sound Toggle */}
                <div
                  onClick={handleAllSoundsToggle}
                  className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-all ${
                    allSoundsMuted
                      ? "bg-red-900/30 border border-red-500/40"
                      : "bg-green-900/30 border border-green-500/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Volume2 className={`w-6 h-6 ${allSoundsMuted ? "text-red-400" : "text-green-400"}`} />
                    <div>
                      <p className="text-indigo-100 font-semibold">Master Volume</p>
                      <p className="text-indigo-400/70 text-xs">Toggle all audio on/off</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-all ${
                    allSoundsMuted ? "bg-red-600" : "bg-green-600"
                  } relative`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                      allSoundsMuted ? "left-1" : "left-7"
                    }`} />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider">Individual Controls</p>

                  {/* Music Toggle */}
                  <div
                    onClick={handleMusicToggle}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                      musicMuted || allSoundsMuted
                        ? "bg-black/30 border border-indigo-500/20 opacity-50"
                        : "bg-black/30 border border-indigo-500/40 hover:border-indigo-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Music className={`w-5 h-5 ${musicMuted || allSoundsMuted ? "text-indigo-600" : "text-indigo-300"}`} />
                      <div>
                        <p className="text-indigo-100 font-medium text-sm">Battle Music</p>
                        <p className="text-indigo-500 text-xs">Background theme</p>
                      </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full transition-all ${
                      musicMuted || allSoundsMuted ? "bg-indigo-900" : "bg-indigo-500"
                    } relative`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        musicMuted || allSoundsMuted ? "left-0.5" : "left-5"
                      }`} />
                    </div>
                  </div>

                  {/* Fire Sounds Toggle */}
                  <div
                    onClick={handleFireSoundsToggle}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                      fireSoundsMuted || allSoundsMuted
                        ? "bg-black/30 border border-indigo-500/20 opacity-50"
                        : "bg-black/30 border border-indigo-500/40 hover:border-indigo-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Flame className={`w-5 h-5 ${fireSoundsMuted || allSoundsMuted ? "text-indigo-600" : "text-orange-400"}`} />
                      <div>
                        <p className="text-indigo-100 font-medium text-sm">Fire Ambience</p>
                        <p className="text-indigo-500 text-xs">Crackling fire sounds</p>
                      </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full transition-all ${
                      fireSoundsMuted || allSoundsMuted ? "bg-indigo-900" : "bg-orange-500"
                    } relative`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        fireSoundsMuted || allSoundsMuted ? "left-0.5" : "left-5"
                      }`} />
                    </div>
                  </div>

                  {/* SFX Toggle */}
                  <div
                    onClick={handleSfxToggle}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                      sfxMuted || allSoundsMuted
                        ? "bg-black/30 border border-indigo-500/20 opacity-50"
                        : "bg-black/30 border border-indigo-500/40 hover:border-indigo-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Zap className={`w-5 h-5 ${sfxMuted || allSoundsMuted ? "text-indigo-600" : "text-yellow-400"}`} />
                      <div>
                        <p className="text-indigo-100 font-medium text-sm">Sound Effects</p>
                        <p className="text-indigo-500 text-xs">Explosions, impacts, countdown</p>
                      </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full transition-all ${
                      sfxMuted || allSoundsMuted ? "bg-indigo-900" : "bg-yellow-500"
                    } relative`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        sfxMuted || allSoundsMuted ? "left-0.5" : "left-5"
                      }`} />
                    </div>
                  </div>
                </div>

                <p className="text-indigo-500/50 text-xs text-center pt-2">
                  Settings saved automatically
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
