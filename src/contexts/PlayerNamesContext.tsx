import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { useActiveGame } from "../hooks/useActiveGame";

const PlayerNamesContext = createContext<any>(undefined);

export function PlayerNamesProvider({ children }: { children: ReactNode }) {
  const { activeGame } = useActiveGame();
  const { socket } = useSocket();
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  const [playerNames, setPlayerNames] = useState<any[] | undefined>(undefined);

  // Extract unique wallet addresses from game state
  useEffect(() => {
    if (!activeGame || !activeGame.wallets) {
      setWalletAddresses([]);
      return;
    }

    // Convert PublicKey objects to strings and deduplicate
    const addresses = activeGame.wallets
      .map((wallet: any) => wallet.toBase58())
      .filter((addr: string, index: number, self: string[]) => self.indexOf(addr) === index);

    setWalletAddresses(addresses);
  }, [activeGame]);

  // Fetch player names for all wallet addresses via socket
  useEffect(() => {
    if (!socket || walletAddresses.length === 0) {
      setPlayerNames(undefined);
      return;
    }
    socketRequest(socket, "get-players-by-wallets", { walletAddresses }).then((res) => {
      if (res.success) setPlayerNames(res.data);
    });
  }, [socket, walletAddresses]);

  // Note: Player names for Phaser now come via unified participants-update event
  // from server (names resolved server-side). This context is only used by React components.

  return (
    <PlayerNamesContext.Provider value={{ playerNames }}>{children}</PlayerNamesContext.Provider>
  );
}

export function usePlayerNames() {
  const context = useContext(PlayerNamesContext);
  if (!context) throw new Error("usePlayerNames must be used within PlayerNamesProvider");
  return context;
}
