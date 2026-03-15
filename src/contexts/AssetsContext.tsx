import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useSocket, socketRequest } from "../lib/socket";

const AssetsContext = createContext<any>(undefined);

export function AssetsProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [characters, setCharacters] = useState<any[] | undefined>(undefined);
  const [maps, setMaps] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    if (!socket) return;
    socketRequest(socket, "get-active-characters").then((res) => {
      if (res.success) setCharacters(res.data);
    });
    socketRequest(socket, "get-all-active-maps").then((res) => {
      if (res.success) setMaps(res.data);
    });
  }, [socket]);

  const getMapById = (mapId: number) => {
    return maps?.find((map) => map.id === mapId) || null;
  };

  const getCharacterById = (characterId: number) => {
    return characters?.find((char) => char.id === characterId) || null;
  };

  return (
    <AssetsContext.Provider value={{ characters, maps, getMapById, getCharacterById }}>
      {children}
    </AssetsContext.Provider>
  );
}

export function useAssets() {
  const context = useContext(AssetsContext);
  if (!context) throw new Error("useAssets must be used within AssetsProvider");
  return context;
}
