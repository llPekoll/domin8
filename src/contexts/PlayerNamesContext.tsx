import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useActiveGame } from "../hooks/useActiveGame";

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
  }, [activeGame]);

  // Fetch player names for all wallet addresses
  const playerNames = useQuery(
    api.players.getPlayersByWallets,
    walletAddresses.length > 0 ? { walletAddresses } : "skip"
  );

  // Note: Player names for Phaser now come via unified participants-update event
  // from Convex (names resolved server-side). This context is only used by React components.

  return (
    <PlayerNamesContext.Provider value={{ playerNames }}>{children}</PlayerNamesContext.Provider>
  );
}

export function usePlayerNames() {
  const context = useContext(PlayerNamesContext);
  if (!context) throw new Error("usePlayerNames must be used within PlayerNamesProvider");
  return context;
}
