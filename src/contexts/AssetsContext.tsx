import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const AssetsContext = createContext<any>(undefined);

export function AssetsProvider({ children }: { children: ReactNode }) {
  const characters = useQuery(api.characters.getActiveCharacters);
  const maps = useQuery(api.maps.getAllActiveMaps);

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
