import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useActiveGame } from "../hooks/useActiveGame";
import { logger } from "../lib/logger";
import { EventBus } from "../game/EventBus";

const PlayerNamesContext = createContext<any>(undefined);

export function PlayerNamesProvider({ children }: { children: ReactNode }) {
  const { activeGame } = useActiveGame();
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);

  // Extract unique wallet addresses from game state
  useEffect(() => {
    if (!activeGame || !activeGame.wallets) {
      setWalletAddresses([]);
      return;
    }

    // Convert PublicKey objects to strings and deduplicate
    const addresses = activeGame.wallets
      .map((wallet) => wallet.toBase58())
      .filter((addr, index, self) => self.indexOf(addr) === index);

    setWalletAddresses(addresses);
    
    logger.game.debug("[PlayerNamesContext] Extracted wallet addresses:", addresses.length);
  }, [activeGame]);

  // Fetch player names for all wallet addresses
  const playerNames = useQuery(
    api.players.getPlayersByWallets,
    walletAddresses.length > 0 ? { walletAddresses } : "skip"
  );

  // Pass player names to Phaser when they change
  useEffect(() => {
    if (!playerNames) return;

    logger.game.debug("[PlayerNamesContext] Broadcasting player names to Phaser:", playerNames.length);
    EventBus.emit("player-names-update", playerNames);
  }, [playerNames]);

  return (
    <PlayerNamesContext.Provider value={{ playerNames }}>
      {children}
    </PlayerNamesContext.Provider>
  );
}

export function usePlayerNames() {
  const context = useContext(PlayerNamesContext);
  if (!context) throw new Error("usePlayerNames must be used within PlayerNamesProvider");
  return context;
}
