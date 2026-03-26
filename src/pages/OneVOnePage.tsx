import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "../components/Header";
import { ChatPanel } from "../components/ChatPanel";
import { CreateLobby } from "../components/onevone/CreateLobby";
import { LobbyDetailsDialog } from "../components/onevone/LobbyDetailsDialog";
import { useActiveWallet } from "../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../lib/socket";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { useAssets } from "../contexts/AssetsContext";
import { setCharactersData } from "../game/main";
import type { Character } from "../types/character";

type FilterType = "all" | "my_games" | "price_low" | "price_high" | "newest" | "oldest";

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2 | 3; // 0 = Open, 1 = Awaiting VRF, 2 = Ready, 3 = Resolved
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
  isPrivate?: boolean;
  prizeAmount?: number; // Actual prize won in lamports
  winStreak?: number; // Win streak for double-down
}

export function OneVOnePage() {
  const { connected, activePublicKey: publicKey, activeWallet: wallet } = useActiveWallet();
  const { characters } = useAssets();
  const { socket } = useSocket();
  const createLobbyAction = useCallback(
    async (args: any) => {
      if (!socket) throw new Error("Not connected");
      const res = await socketRequest(socket, "create-lobby", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );
  const joinLobbyAction = useCallback(
    async (args: any) => {
      if (!socket) throw new Error("Not connected");
      const res = await socketRequest(socket, "join-lobby", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // Sync characters to Phaser's global state for game scenes
  useEffect(() => {
    if (characters && characters.length > 0) {
      logger.game.debug("[OneVOnePage] Syncing characters to Phaser global state", {
        count: characters.length,
      });
      setCharactersData(characters);
    }
  }, [characters]);

  // Track selected character for 1v1 lobbies
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [characterIndex, setCharacterIndex] = useState(0);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  // Arena modal state
  const [arenaModalOpen, setArenaModalOpen] = useState(false);
  const [activeLobbyId, setActiveLobbyId] = useState<number | null>(null);

  // Shared lobby dialog state (opened via URL share link)
  const [sharedLobbyDialogOpen, setSharedLobbyDialogOpen] = useState(false);
  const [joiningLobby, setJoiningLobby] = useState(false); // Track if currently joining a lobby
  const shareToken = searchParams.get("join");

  // Get current player's wallet address as string (for query)
  const currentPlayerWallet = publicKey?.toString();

  // Get open lobbies from API server (real-time updates)
  // Pass current player wallet so they can see their own private lobbies
  const [openLobbiesQuery, setOpenLobbiesQuery] = useState<any[] | null>(null);
  useEffect(() => {
    if (!socket) return;
    const args = currentPlayerWallet ? { currentPlayerWallet } : {};
    socketRequest(socket, "get-open-lobbies", args).then((res) => {
      if (res.success) setOpenLobbiesQuery(res.data);
    });
    // Listen for real-time lobby updates
    const handleLobbyUpdate = () => {
      socketRequest(socket, "get-open-lobbies", args).then((res) => {
        if (res.success) setOpenLobbiesQuery(res.data);
      });
    };
    socket.on("lobby-updated", handleLobbyUpdate);
    return () => { socket.off("lobby-updated", handleLobbyUpdate); };
  }, [socket, currentPlayerWallet]);
  const openLobbies = useMemo(() => openLobbiesQuery || [], [openLobbiesQuery]);

  // Debug: Log lobby data including characterA
  useEffect(() => {
    if (openLobbies.length > 0) {
      console.log(
        "[1v1 Debug] Open lobbies from API server:",
        openLobbies.map((l) => ({
          lobbyId: l.lobbyId,
          characterA: l.characterA,
          characterB: l.characterB,
          playerA: l.playerA?.slice(0, 8) + "...",
          status: l.status,
        }))
      );
    }
  }, [openLobbies]);

  // Get lobby by share token (for URL-based access) via socket
  const [sharedLobby, setSharedLobby] = useState<any>(null);
  useEffect(() => {
    if (!socket || !shareToken) {
      setSharedLobby(null);
      return;
    }
    socketRequest(socket, "get-lobby-by-share-token", { shareToken }).then((res) => {
      if (res.success) setSharedLobby(res.data);
    });
  }, [socket, shareToken]);

  // Get completed lobbies for history via socket
  const [completedLobbiesQuery, setCompletedLobbiesQuery] = useState<any[] | null>(null);
  useEffect(() => {
    if (!socket) return;
    socketRequest(socket, "get-completed-lobbies", { limit: 20 }).then((res) => {
      if (res.success) setCompletedLobbiesQuery(res.data);
    });
  }, [socket]);
  const completedLobbies = useMemo(() => completedLobbiesQuery || [], [completedLobbiesQuery]);

  // Filtered and sorted lobbies
  const filteredOpenLobbies = useMemo(() => {
    let filtered = [...openLobbies];

    // Filter by my games
    if (activeFilter === "my_games") {
      filtered = filtered.filter((l) => l.playerA === publicKey?.toString());
    }

    // Sort by price
    if (activeFilter === "price_low") {
      filtered.sort((a, b) => a.amount - b.amount);
    } else if (activeFilter === "price_high") {
      filtered.sort((a, b) => b.amount - a.amount);
    }

    // Sort by date (assuming lobbyId correlates with creation time)
    if (activeFilter === "newest") {
      filtered.sort((a, b) => b.lobbyId - a.lobbyId);
    } else if (activeFilter === "oldest") {
      filtered.sort((a, b) => a.lobbyId - b.lobbyId);
    }

    return filtered;
  }, [openLobbies, activeFilter, publicKey]);

  const filteredCompletedLobbies = useMemo(() => {
    let filtered = [...completedLobbies];

    // Filter by my games
    if (activeFilter === "my_games") {
      filtered = filtered.filter(
        (l) => l.playerA === publicKey?.toString() || l.playerB === publicKey?.toString()
      );
    }

    // Sort by price
    if (activeFilter === "price_low") {
      filtered.sort((a, b) => a.amount - b.amount);
    } else if (activeFilter === "price_high") {
      filtered.sort((a, b) => b.amount - a.amount);
    }

    // Sort by date
    if (activeFilter === "newest") {
      filtered.sort((a, b) => b.lobbyId - a.lobbyId);
    } else if (activeFilter === "oldest") {
      filtered.sort((a, b) => a.lobbyId - b.lobbyId);
    }

    return filtered;
  }, [completedLobbies, activeFilter, publicKey]);

  // Collect all unique wallet addresses from lobbies to fetch player names
  const allWalletAddresses = useMemo(() => {
    const wallets = new Set<string>();

    for (const lobby of openLobbies) {
      wallets.add(lobby.playerA);
      if (lobby.playerB) wallets.add(lobby.playerB);
    }

    for (const lobby of completedLobbies) {
      wallets.add(lobby.playerA);
      if (lobby.playerB) wallets.add(lobby.playerB);
    }

    if (sharedLobby) {
      wallets.add(sharedLobby.playerA);
      if (sharedLobby.playerB) wallets.add(sharedLobby.playerB);
    }

    return Array.from(wallets);
  }, [openLobbies, completedLobbies, sharedLobby]);

  // Fetch player display names for all wallets via socket
  const [playerNames, setPlayerNames] = useState<any[] | null>(null);
  useEffect(() => {
    if (!socket || allWalletAddresses.length === 0) {
      setPlayerNames(null);
      return;
    }
    socketRequest(socket, "get-players-by-wallets", { walletAddresses: allWalletAddresses }).then((res) => {
      if (res.success) setPlayerNames(res.data);
    });
  }, [socket, allWalletAddresses.join(",")]);

  // Helper function to get display name or truncated wallet
  const getPlayerDisplayName = useCallback(
    (walletAddress: string, isCurrentUser = false): string => {
      if (isCurrentUser) return "You";

      const player = playerNames?.find((p) => p.walletAddress === walletAddress);
      if (player?.displayName) {
        return player.displayName;
      }

      // Fallback to truncated wallet address
      return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    },
    [playerNames]
  );

  // Get specific lobby state when in arena (for real-time updates during fight) via socket
  const [lobbyStateQuery, setLobbyStateQuery] = useState<any>(null);
  useEffect(() => {
    if (!socket || activeLobbyId === null) {
      setLobbyStateQuery(null);
      return;
    }
    socketRequest(socket, "get-lobby-state", { lobbyId: activeLobbyId }).then((res) => {
      if (res.success) setLobbyStateQuery(res.data);
    });
    // Listen for real-time lobby state updates
    const handleStateUpdate = (data: any) => {
      if (data.lobbyId === activeLobbyId) {
        setLobbyStateQuery(data);
      }
    };
    socket.on("lobby-state-updated", handleStateUpdate);
    return () => { socket.off("lobby-state-updated", handleStateUpdate); };
  }, [socket, activeLobbyId]);

  // Only use the lobby state if modal is open
  const activeLobbyState = arenaModalOpen && activeLobbyId !== null ? lobbyStateQuery : null;

  // Handle share link URL parameter - open lobby details dialog when navigating via share link
  useEffect(() => {
    if (shareToken && sharedLobby) {
      if (sharedLobby.status === 0) {
        // Lobby is open and available to join
        logger.ui.info("[1v1] Opening shared lobby from URL", {
          shareToken,
          lobbyId: sharedLobby.lobbyId,
        });
        setSharedLobbyDialogOpen(true);
      } else {
        // Lobby is no longer available (already joined or resolved)
        toast.error("This lobby is no longer available");
        // Clear the URL parameter
        setSearchParams({});
      }
    }
  }, [shareToken, sharedLobby, setSearchParams]);

  // Reopen dialog after Privy login if we still have a shareToken
  // This handles the case where dialog closes during Privy login flow
  useEffect(() => {
    if (
      connected &&
      shareToken &&
      sharedLobby &&
      sharedLobby.status === 0 &&
      !sharedLobbyDialogOpen
    ) {
      logger.ui.info("[1v1] Reopening shared lobby dialog after login", {
        shareToken,
        lobbyId: sharedLobby.lobbyId,
      });
      setSharedLobbyDialogOpen(true);
    }
  }, [connected, shareToken, sharedLobby, sharedLobbyDialogOpen]);

  // Handle closing shared lobby dialog - only clear URL if user is connected (intentional close)
  // If not connected, keep the URL so dialog can reopen after Privy login
  const handleSharedLobbyDialogClose = useCallback(() => {
    setSharedLobbyDialogOpen(false);
    setJoiningLobby(false); // Reset joining state
    // Only clear URL parameter if user is connected (intentional close)
    // or if they're not connected and explicitly closing (not due to Privy modal)
    if (connected) {
      setSearchParams({});
    }
  }, [setSearchParams, connected]);

  // Update selected character when index changes
  useEffect(() => {
    if (characters && characters.length > 0) {
      const idx = characterIndex % characters.length;
      const char = characters[idx];

      // Debug: Log character selection
      console.log("[1v1 Debug] Character selection updated:", {
        characterIndex: idx,
        selectedCharacterId: char.id,
        selectedCharacterName: char.name,
        allCharacterIds: characters.map((c: any) => c.id),
      });

      setSelectedCharacter(char);
    }
  }, [characters, characterIndex]);

  const handleCharacterChange = useCallback(
    (direction: "prev" | "next") => {
      if (!characters || characters.length === 0) return;
      setCharacterIndex((prev) => {
        if (direction === "prev") {
          return prev === 0 ? characters.length - 1 : prev - 1;
        } else {
          return prev === characters.length - 1 ? 0 : prev + 1;
        }
      });
    },
    [characters]
  );

  // When user creates a lobby, open the arena modal
  const handleLobbyCreated = useCallback((lobbyId: number) => {
    logger.ui.info("[1v1] Lobby created, opening arena modal", { lobbyId });
    setActiveLobbyId(lobbyId);
    setArenaModalOpen(true);
  }, []);

  // When user selects a lobby from the list (to preview or view their own)
  const handleLobbySelected = useCallback((lobbyId: number) => {
    logger.ui.info("[1v1] Lobby selected, opening dialog", { lobbyId });
    setActiveLobbyId(lobbyId);
    setArenaModalOpen(true);
  }, []);

  // When user joins a lobby, keep the arena modal open (don't re-open)
  const handleLobbyJoined = useCallback(
    (lobbyId: number) => {
      logger.ui.info("[1v1] Joined lobby", { lobbyId });
      // If the modal is already showing this lobby, keep it open
      // Otherwise, open the modal with the new lobby
      if (activeLobbyId !== lobbyId) {
        setActiveLobbyId(lobbyId);
        setArenaModalOpen(true);
      }
      // Close shared lobby dialog and clear URL param if open
      setSharedLobbyDialogOpen(false);
      setSearchParams({});
    },
    [activeLobbyId, setSearchParams]
  );

  // Generic handler for joining any lobby (from dialog)
  const handleJoinLobbyFromDialog = useCallback(
    async (lobbyId: number, characterFromDialog?: Character) => {
      // Find the lobby from activeLobbyState (real-time data) or sharedLobby
      const lobbyToJoin = activeLobbyState || sharedLobby;

      // Use character passed from dialog, or fall back to parent state
      const characterToUse = characterFromDialog || selectedCharacter;

      if (!lobbyToJoin || lobbyToJoin.lobbyId !== lobbyId) {
        toast.error("Lobby not found");
        return;
      }

      if (!connected || !characterToUse || !wallet || !publicKey) {
        toast.error("Please connect wallet and select a character");
        return;
      }

      if (lobbyToJoin.playerA === publicKey.toString()) {
        toast.error("You cannot join your own lobby");
        return;
      }

      setJoiningLobby(true);

      try {
        // Import utilities
        const { getSharedConnection } = await import("../lib/sharedConnection");
        const { buildJoinLobbyTransaction, get1v1LobbyPDA } =
          await import("../lib/solana-1v1-transactions");

        const connection = getSharedConnection();
        const currentWallet = publicKey.toString();

        logger.ui.info("[1v1] Joining lobby from dialog", {
          lobbyId: lobbyToJoin.lobbyId,
          playerB: currentWallet,
          character: characterToUse.id,
        });

        // Derive the lobby PDA from lobbyId
        const lobbyPda = get1v1LobbyPDA(lobbyToJoin.lobbyId);
        const transaction = await buildJoinLobbyTransaction(
          publicKey,
          lobbyToJoin.lobbyId,
          characterToUse.id,
          lobbyPda,
          connection
        );

        logger.solana.debug("[1v1] Transaction ready for signing");

        // Sign and send using Privy's signAndSendAllTransactions
        const chainId = `solana:devnet` as `${string}:${string}`;
        const serialized = Buffer.from(transaction.serialize());

        let signAndSendResult;
        try {
          signAndSendResult = await wallet.signAndSendAllTransactions([
            {
              chain: chainId,
              transaction: serialized,
            },
          ]);
        } catch (privyError: unknown) {
          const errorMessage =
            privyError instanceof Error ? privyError.message : String(privyError);
          logger.solana.error("[1v1] Privy wallet error:", { message: errorMessage });
          throw new Error(`Privy wallet error: ${errorMessage}`);
        }

        if (!signAndSendResult || signAndSendResult.length === 0) {
          throw new Error("Failed to get signature from Privy wallet");
        }

        const signatureBytes = signAndSendResult[0].signature;
        if (!signatureBytes) {
          throw new Error("No signature in Privy response");
        }

        const { default: bs58 } = await import("bs58");
        const signature = bs58.encode(signatureBytes);

        logger.solana.info("[1v1] Join transaction signed and sent", { signature });
        toast.loading("Waiting for transaction confirmation...", { id: "join-tx-confirm" });

        const confirmation = await connection.confirmTransaction(signature, "confirmed");

        if (confirmation.value.err) {
          throw new Error("Transaction failed: " + confirmation.value.err.toString());
        }

        toast.success("Transaction confirmed!", { id: "join-tx-confirm" });

        // Call API server action to update lobby in database
        const result = await joinLobbyAction({
          playerBWallet: currentWallet,
          lobbyId: lobbyToJoin.lobbyId,
          characterB: characterToUse.id,
          transactionHash: signature,
        });

        if (result.success) {
          logger.ui.info("[1v1] Lobby joined successfully", { lobbyId: result.lobbyId });
          toast.success("You joined the lobby! Starting fight...", { duration: 5000 });

          // Notify that lobby was joined (keeps dialog open with real-time updates)
          handleLobbyJoined(result.lobbyId);
        } else {
          toast.error("Failed to update lobby in database");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("[1v1] Failed to join lobby:", error);
        toast.error("Failed to join lobby: " + errorMsg);
      } finally {
        setJoiningLobby(false);
      }
    },
    [
      connected,
      wallet,
      publicKey,
      selectedCharacter,
      activeLobbyState,
      sharedLobby,
      joinLobbyAction,
      handleLobbyJoined,
    ]
  );

  // Handle arena modal close
  const handleArenaClose = useCallback(() => {
    setArenaModalOpen(false);
    setJoiningLobby(false); // Reset joining state
    // Keep activeLobbyId for a moment in case user wants to reopen
  }, []);

  // Handle fight completion (from modal)
  const handleFightComplete = useCallback(() => {
    logger.ui.info("[1v1] Fight complete");
    setArenaModalOpen(false);
    setActiveLobbyId(null);
  }, []);

  // Double down handler for winner
  const handleDoubleDown = useCallback(
    async (amount: number, winStreak: number = 1) => {
      if (!connected || !publicKey || !selectedCharacter || !wallet) {
        toast.error("Please connect wallet and select a character");
        return;
      }

      logger.ui.info("Double Down requested", { amount, winStreak });
      const toastId = toast.loading("Processing Double Down...");

      try {
        // Import utilities
        const { getSharedConnection } = await import("../lib/sharedConnection");
        const { buildCreateLobbyTransaction } = await import("../lib/solana-1v1-transactions");

        const connection = getSharedConnection();

        // Build create_lobby transaction
        const transaction = await buildCreateLobbyTransaction(
          publicKey,
          amount, // Amount is already in lamports
          selectedCharacter.id,
          0, // Default map ID
          connection
        );

        // Serialize transaction for Privy
        const serializedTx = transaction.serialize();

        // Sign and send via Privy
        const txResult = await wallet.signAndSendTransaction({
          transaction: serializedTx,
          chain: "solana:mainnet",
        });

        // Handle signature - could be string or Uint8Array
        let signature: string;
        if (typeof txResult.signature === "string") {
          signature = txResult.signature;
        } else if (txResult.signature instanceof Uint8Array) {
          const bs58 = await import("bs58");
          signature = bs58.default.encode(txResult.signature);
        } else {
          throw new Error("Invalid signature format from wallet");
        }

        logger.solana.info("Double Down transaction sent", { signature });
        toast.loading("Confirming Double Down transaction...", { id: toastId });

        const confirmation = await connection.confirmTransaction(signature, "confirmed");

        if (confirmation.value.err) {
          throw new Error("Transaction failed: " + confirmation.value.err.toString());
        }

        logger.solana.info("Double Down confirmed", { signature });

        // Call API server action to create lobby (with win streak for double-down)
        const result = await createLobbyAction({
          playerAWallet: publicKey.toString(),
          amount: amount,
          characterA: selectedCharacter.id,
          mapId: 0,
          transactionHash: signature,
          winStreak: winStreak, // Carry over win streak
        });

        if (result.success) {
          toast.success(`Double Down successful! Lobby #${result.lobbyId} created.`, {
            id: toastId,
          });
          // Open the new lobby in the arena
          setActiveLobbyId(result.lobbyId);
          // Modal stays open with new lobby
        } else {
          throw new Error("Failed to create lobby in database");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("Double Down failed:", error);
        toast.error("Double Down failed: " + errorMsg, { id: toastId });
      }
    },
    [connected, publicKey, selectedCharacter, wallet, createLobbyAction]
  );

  return (
    <div className="min-h-screen w-full bg-linear-to-b from-gray-950/90 via-gray-900/90 to-black/90">
      <Header />

      {/* Main Content Area with Chat Sidebar */}
      <div className="pt-20 pb-8 px-3 md:px-6 flex gap-4">
        {/* Chat Sidebar - Left (sticky) */}
        <div className="hidden lg:block w-80 shrink-0 sticky top-20 self-start">
          <ChatPanel embedded />
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Games List - Single column for both connected and not connected */}
          {connected && publicKey ? (
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Header Section - Create Game */}
              <CreateLobby
                selectedCharacter={selectedCharacter}
                characters={characters || []}
                onCharacterChange={handleCharacterChange}
                onLobbyCreated={handleLobbyCreated}
              />
              {/* Header with Filters */}
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                {/* Title Row */}
                <div className="flex items-center gap-2">
                  <h2 className="text-lg md:text-xl font-bold text-amber-100">ALL GAMES</h2>
                  <span className="text-amber-400 font-mono text-sm">
                    {filteredOpenLobbies.length + filteredCompletedLobbies.length}
                  </span>
                  <span className="hidden md:flex px-3 py-1 bg-amber-900/30 border border-amber-700/50 rounded-full text-amber-300 text-xs items-center gap-1">
                    <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                    Payouts settled in SOL
                  </span>
                </div>

                {/* Spacer - only on desktop */}
                <div className="hidden md:block flex-1"></div>

                {/* Filter Buttons - horizontal scroll on mobile */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  <button
                    onClick={() => setActiveFilter("my_games")}
                    className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                      activeFilter === "my_games"
                        ? "bg-amber-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    My Games
                  </button>
                  <button
                    onClick={() =>
                      setActiveFilter(activeFilter === "price_low" ? "price_high" : "price_low")
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeFilter === "price_low" || activeFilter === "price_high"
                        ? "bg-amber-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Price
                    {activeFilter === "price_low" && <span>↑</span>}
                    {activeFilter === "price_high" && <span>↓</span>}
                  </button>
                  <button
                    onClick={() => setActiveFilter(activeFilter === "newest" ? "oldest" : "newest")}
                    className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                      activeFilter === "newest" || activeFilter === "oldest"
                        ? "bg-amber-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Date
                    {activeFilter === "newest" && <span>↓</span>}
                    {activeFilter === "oldest" && <span>↑</span>}
                  </button>
                  {activeFilter !== "all" && (
                    <button
                      onClick={() => setActiveFilter("all")}
                      className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {/* My Open Lobbies First */}
                {filteredOpenLobbies
                  .filter((l) => l.playerA === publicKey.toString() && l.status === 0)
                  .map((lobby) => (
                    <div
                      key={lobby._id}
                      className={`rounded-xl p-3 md:p-4 cursor-pointer transition-all ${
                        lobby.isPrivate
                          ? "bg-linear-to-r from-purple-900/40 to-purple-950/40 border border-purple-500/30 hover:border-purple-400/50"
                          : "bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 hover:border-amber-600/50"
                      }`}
                      onClick={() => handleLobbySelected(lobby.lobbyId)}
                    >
                      {/* Mobile Layout */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-linear-to-br from-amber-500 to-amber-700 border-2 border-amber-400 flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">Y</span>
                          </div>
                          <span className="text-white font-semibold text-sm truncate">You</span>
                          <span className="text-gray-500">⚔️</span>
                          <span className="text-gray-500 text-sm italic">Waiting...</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                            <span className="text-white font-bold text-sm">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          {lobby.isPrivate && <span className="text-purple-300 text-xs">🔒</span>}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const shareUrl = `${window.location.origin}/1v1?join=${lobby.shareToken}`;
                              navigator.clipboard.writeText(shareUrl);
                              toast.success("Share link copied!");
                            }}
                            className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full bg-linear-to-br from-amber-500 to-amber-700 border-2 border-amber-400 flex items-center justify-center">
                              <span className="text-white font-bold text-lg">Y</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-amber-600 text-2.5 text-white font-bold px-1.5 py-0.5 rounded-full border border-amber-400">
                              {lobby.characterA || 1}
                            </div>
                          </div>
                          <p className="text-white font-semibold">You</p>
                        </div>
                        <div className="px-4">
                          <span className="text-2xl">⚔️</span>
                        </div>
                        <div className="flex items-center gap-3 flex-1 justify-end">
                          <p className="text-gray-500 font-semibold italic">Waiting...</p>
                          <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center">
                            <span className="text-gray-500 text-2xl">?</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-6">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                            <span className="text-white font-bold">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          {lobby.isPrivate && (
                            <span className="px-2 py-1 bg-purple-600/40 border border-purple-500/50 rounded text-purple-200 text-xs">
                              🔒
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const shareUrl = `${window.location.origin}/1v1?join=${lobby.shareToken}`;
                              navigator.clipboard.writeText(shareUrl);
                              toast.success("Share link copied!");
                            }}
                            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                          </button>
                          <button className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                {/* Other Open Lobbies */}
                {filteredOpenLobbies
                  .filter((l) => l.playerA !== publicKey.toString() && l.status === 0)
                  .map((lobby) => (
                    <div
                      key={lobby._id}
                      className={`rounded-xl p-3 md:p-4 cursor-pointer transition-all ${
                        lobby.isPrivate
                          ? "bg-linear-to-r from-purple-900/40 to-purple-950/40 border border-purple-500/30 hover:border-purple-400/50"
                          : "bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 hover:border-amber-600/50"
                      }`}
                      onClick={() => handleLobbySelected(lobby.lobbyId)}
                    >
                      {/* Mobile Layout */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-linear-to-br from-amber-600 to-amber-800 border-2 border-amber-500/50 flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-sm">
                              {getPlayerDisplayName(lobby.playerA).slice(0, 1).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-white font-semibold text-sm truncate max-w-20">
                            {getPlayerDisplayName(lobby.playerA)}
                          </span>
                          <span className="text-gray-500">⚔️</span>
                          <span className="text-gray-500 text-sm">?</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                            <span className="text-white font-bold text-sm">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLobbySelected(lobby.lobbyId);
                            }}
                            className="px-3 py-1.5 bg-linear-to-r from-amber-500 to-amber-600 text-white font-semibold text-sm rounded-lg"
                          >
                            Join
                          </button>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full bg-linear-to-br from-amber-600 to-amber-800 border-2 border-amber-500/50 flex items-center justify-center">
                              <span className="text-white font-bold text-lg">
                                {getPlayerDisplayName(lobby.playerA).slice(0, 1).toUpperCase()}
                              </span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-amber-600 text-2.5 text-white font-bold px-1.5 py-0.5 rounded-full border border-amber-400">
                              {lobby.characterA || 1}
                            </div>
                          </div>
                          <p className="text-white font-semibold">
                            {getPlayerDisplayName(lobby.playerA)}
                          </p>
                        </div>
                        <div className="px-4">
                          <span className="text-2xl">⚔️</span>
                        </div>
                        <div className="flex items-center gap-3 flex-1 justify-end">
                          <p className="text-gray-500 font-semibold italic">Waiting...</p>
                          <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center">
                            <span className="text-gray-500 text-2xl">?</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-6">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                            <span className="text-white font-bold">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          {lobby.isPrivate && (
                            <span className="px-2 py-1 bg-purple-600/40 border border-purple-500/50 rounded text-purple-200 text-xs">
                              🔒
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLobbySelected(lobby.lobbyId);
                            }}
                            className="px-6 py-2 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold rounded-lg transition-all"
                          >
                            Join
                          </button>
                          <button className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                {/* Completed Lobbies */}
                {filteredCompletedLobbies.slice(0, 20).map((lobby) => {
                  const isPlayerAWinner = lobby.winner === lobby.playerA;
                  const isPlayerBWinner = lobby.winner === lobby.playerB;
                  const isCurrentUserPlayerA = lobby.playerA === publicKey?.toString();
                  const isCurrentUserPlayerB = lobby.playerB === publicKey?.toString();
                  const playerAName = getPlayerDisplayName(lobby.playerA, isCurrentUserPlayerA);
                  const playerBName = lobby.playerB
                    ? getPlayerDisplayName(lobby.playerB, isCurrentUserPlayerB)
                    : null;

                  return (
                    <div
                      key={lobby._id}
                      className="bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 rounded-xl p-3 md:p-4 hover:border-amber-600/50 transition-colors cursor-pointer"
                      onClick={() => handleLobbySelected(lobby.lobbyId)}
                    >
                      {/* Mobile Layout */}
                      <div className="flex md:hidden items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative shrink-0">
                            <div
                              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                                isPlayerAWinner
                                  ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                  : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                              }`}
                            >
                              <span className="text-white font-bold text-sm">
                                {playerAName.slice(0, 1).toUpperCase()}
                              </span>
                            </div>
                            {isPlayerAWinner && (
                              <span className="absolute -top-1 -right-1 text-xs">👑</span>
                            )}
                          </div>
                          <span
                            className={`text-sm truncate max-w-15 ${isPlayerAWinner ? "text-amber-300" : "text-gray-400"}`}
                          >
                            {playerAName}
                          </span>
                          {/* Win streak badge - show when Player A wins and has at least 2 consecutive wins */}
                          {isPlayerAWinner && (lobby.winStreak ?? 0) >= 1 && (
                            <span className="px-1.5 py-0.5 bg-linear-to-r from-orange-600 to-red-600 rounded text-2.5 text-white font-bold whitespace-nowrap">
                              🔥 {(lobby.winStreak ?? 0) + 1} streak
                            </span>
                          )}
                          <span className="text-gray-500 opacity-60">⚔️</span>
                          <span
                            className={`text-sm truncate max-w-15 ${isPlayerBWinner ? "text-amber-300" : "text-gray-400"}`}
                          >
                            {playerBName ?? "---"}
                          </span>
                          <div className="relative shrink-0">
                            <div
                              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                                isPlayerBWinner
                                  ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                  : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                              }`}
                            >
                              <span className="text-white font-bold text-sm">
                                {playerBName ? playerBName.slice(0, 1).toUpperCase() : "?"}
                              </span>
                            </div>
                            {isPlayerBWinner && (
                              <span className="absolute -top-1 -right-1 text-xs">👑</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                            <span className="text-white font-bold text-sm">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLobbySelected(lobby.lobbyId);
                            }}
                            className="p-1.5 bg-gray-800 hover:bg-amber-700/50 rounded-lg"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="relative">
                            <div
                              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                                isPlayerAWinner
                                  ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                  : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                              }`}
                            >
                              <span className="text-white font-bold text-lg">
                                {playerAName.slice(0, 1).toUpperCase()}
                              </span>
                            </div>
                            {isPlayerAWinner && (
                              <div className="absolute -top-1 -right-1 text-sm">👑</div>
                            )}
                          </div>
                          <p
                            className={`font-semibold ${isPlayerAWinner ? "text-amber-300" : "text-gray-400"}`}
                          >
                            {playerAName}
                          </p>
                          {/* Win streak badge - show when Player A wins and has at least 2 consecutive wins */}
                          {isPlayerAWinner && (lobby.winStreak ?? 0) >= 1 && (
                            <span className="px-2 py-1 bg-linear-to-r from-orange-600 to-red-600 rounded text-xs text-white font-bold">
                              🔥 {(lobby.winStreak ?? 0) + 1} Win Streak
                            </span>
                          )}
                        </div>
                        <div className="px-4">
                          <span className="text-2xl opacity-60">⚔️</span>
                        </div>
                        <div className="flex items-center gap-3 flex-1 justify-end">
                          <p
                            className={`font-semibold ${isPlayerBWinner ? "text-amber-300" : "text-gray-400"}`}
                          >
                            {playerBName ?? "---"}
                          </p>
                          <div className="relative">
                            <div
                              className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                                isPlayerBWinner
                                  ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                  : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                              }`}
                            >
                              <span className="text-white font-bold text-lg">
                                {playerBName ? playerBName.slice(0, 1).toUpperCase() : "?"}
                              </span>
                            </div>
                            {isPlayerBWinner && (
                              <div className="absolute -top-1 -right-1 text-sm">👑</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-6">
                          <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                            <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                            <span className="text-white font-bold">
                              {(lobby.amount / 1e9).toFixed(3)}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLobbySelected(lobby.lobbyId);
                            }}
                            className="p-2 bg-gray-800 hover:bg-amber-700/50 rounded-lg transition-colors"
                          >
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-gray-400 hover:text-amber-300"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredOpenLobbies.length === 0 && filteredCompletedLobbies.length === 0 && (
                  <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-gray-700/30">
                    <p className="text-gray-400">
                      {activeFilter === "my_games"
                        ? "You haven't created or joined any games yet."
                        : "No games yet. Create one to get started!"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Single column layout when not connected - show waiting games first, then resolved */
            <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
              {/* Not connected banner */}
              <div className="p-3 md:p-4 bg-linear-to-r from-amber-900/40 to-amber-950/40 border border-amber-700/50 rounded-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-center md:text-left">
                    <h1 className="text-2xl md:text-4xl font-black text-amber-200 tracking-wide">
                      1V1 BATTLE
                    </h1>
                    <p className="text-amber-300/70 text-xs md:text-sm mt-1">
                      Connect your wallet to create or join games
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-600/20 border border-amber-500/30 rounded-lg">
                    <span className="text-amber-400 text-sm">Payouts settled in SOL</span>
                    <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Waiting Games (Open Lobbies) */}
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <h2 className="text-lg md:text-xl font-bold text-amber-100">ALL GAMES</h2>
                  <span className="text-amber-400 font-mono text-sm">
                    {openLobbies.filter((l) => l.status === 0 && !l.isPrivate).length +
                      completedLobbies.length}
                  </span>
                  <span className="hidden md:flex px-3 py-1 bg-amber-900/30 border border-amber-700/50 rounded-full text-amber-300 text-xs items-center gap-1">
                    <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                    Payouts settled in SOL
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Open Lobbies */}
                  {openLobbies
                    .filter((l) => l.status === 0 && !l.isPrivate)
                    .map((lobby) => {
                      const playerAName = getPlayerDisplayName(lobby.playerA);
                      return (
                        <div
                          key={lobby._id}
                          className="bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 rounded-xl p-3 md:p-4 hover:border-amber-600/50 transition-colors"
                        >
                          {/* Mobile Layout */}
                          <div className="flex md:hidden items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-linear-to-br from-amber-600 to-amber-800 border-2 border-amber-500/50 flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-sm">
                                  {playerAName.slice(0, 1).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-white font-semibold text-sm truncate max-w-20">
                                {playerAName}
                              </span>
                              <span className="text-gray-500">⚔️</span>
                              <span className="text-gray-500 text-sm">?</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                                <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                                <span className="text-white font-bold text-sm">
                                  {(lobby.amount / 1e9).toFixed(3)}
                                </span>
                              </div>
                              <button className="px-3 py-1.5 bg-linear-to-r from-amber-500 to-amber-600 text-white font-semibold text-sm rounded-lg">
                                Join
                              </button>
                            </div>
                          </div>

                          {/* Desktop Layout */}
                          <div className="hidden md:flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="relative">
                                <div className="w-12 h-12 rounded-full bg-linear-to-br from-amber-600 to-amber-800 border-2 border-amber-500/50 flex items-center justify-center overflow-hidden">
                                  <span className="text-white font-bold text-lg">
                                    {playerAName.slice(0, 1).toUpperCase()}
                                  </span>
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-amber-600 text-2.5 text-white font-bold px-1.5 py-0.5 rounded-full border border-amber-400">
                                  {lobby.characterA || 1}
                                </div>
                              </div>
                              <p className="text-white font-semibold">{playerAName}</p>
                            </div>
                            <div className="px-4">
                              <span className="text-2xl">⚔️</span>
                            </div>
                            <div className="flex items-center gap-3 flex-1 justify-end">
                              <p className="text-gray-500 font-semibold italic">Waiting...</p>
                              <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center">
                                <span className="text-gray-500 text-2xl">?</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 ml-6">
                              <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                                <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                                <span className="text-white font-bold">
                                  {(lobby.amount / 1e9).toFixed(3)}
                                </span>
                              </div>
                              <button className="px-6 py-2 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold rounded-lg transition-all">
                                Join
                              </button>
                              <button className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className="text-gray-400"
                                >
                                  <circle cx="12" cy="12" r="3" />
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {/* Completed Lobbies */}
                  {completedLobbies.slice(0, 20).map((lobby) => {
                    const isPlayerAWinner = lobby.winner === lobby.playerA;
                    const isPlayerBWinner = lobby.winner === lobby.playerB;
                    const isCurrentUserPlayerA = lobby.playerA === publicKey?.toString();
                    const isCurrentUserPlayerB = lobby.playerB === publicKey?.toString();
                    const playerAName = getPlayerDisplayName(lobby.playerA, isCurrentUserPlayerA);
                    const playerBName = lobby.playerB
                      ? getPlayerDisplayName(lobby.playerB, isCurrentUserPlayerB)
                      : null;

                    return (
                      <div
                        key={lobby._id}
                        className="bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 rounded-xl p-3 md:p-4 hover:border-amber-600/50 transition-colors cursor-pointer"
                        onClick={() => handleLobbySelected(lobby.lobbyId)}
                      >
                        {/* Mobile Layout */}
                        <div className="flex md:hidden items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative shrink-0">
                              <div
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                                  isPlayerAWinner
                                    ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                    : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                                }`}
                              >
                                <span className="text-white font-bold text-sm">
                                  {playerAName.slice(0, 1).toUpperCase()}
                                </span>
                              </div>
                              {isPlayerAWinner && (
                                <span className="absolute -top-1 -right-1 text-xs">👑</span>
                              )}
                            </div>
                            <span
                              className={`text-sm truncate max-w-15 ${isPlayerAWinner ? "text-amber-300" : "text-gray-400"}`}
                            >
                              {playerAName}
                            </span>
                            {/* Win streak badge - show when Player A wins and has at least 2 consecutive wins */}
                            {isPlayerAWinner && (lobby.winStreak ?? 0) >= 1 && (
                              <span className="px-1.5 py-0.5 bg-linear-to-r from-orange-600 to-red-600 rounded text-2.5 text-white font-bold whitespace-nowrap">
                                🔥 {(lobby.winStreak ?? 0) + 1} streak
                              </span>
                            )}
                            <span className="text-gray-500 opacity-60">⚔️</span>
                            <span
                              className={`text-sm truncate max-w-15 ${isPlayerBWinner ? "text-amber-300" : "text-gray-400"}`}
                            >
                              {playerBName ?? "---"}
                            </span>
                            <div className="relative shrink-0">
                              <div
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                                  isPlayerBWinner
                                    ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                    : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                                }`}
                              >
                                <span className="text-white font-bold text-sm">
                                  {playerBName ? playerBName.slice(0, 1).toUpperCase() : "?"}
                                </span>
                              </div>
                              {isPlayerBWinner && (
                                <span className="absolute -top-1 -right-1 text-xs">👑</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-lg">
                              <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                              <span className="text-white font-bold text-sm">
                                {(lobby.amount / 1e9).toFixed(3)}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLobbySelected(lobby.lobbyId);
                              }}
                              className="p-1.5 bg-gray-800 hover:bg-amber-700/50 rounded-lg"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-gray-400"
                              >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden md:flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="relative">
                              <div
                                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                                  isPlayerAWinner
                                    ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                    : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                                }`}
                              >
                                <span className="text-white font-bold text-lg">
                                  {playerAName.slice(0, 1).toUpperCase()}
                                </span>
                              </div>
                              <div
                                className={`absolute -bottom-1 -right-1 text-2.5 font-bold px-1.5 py-0.5 rounded-full border ${
                                  isPlayerAWinner
                                    ? "bg-amber-600 text-white border-amber-400"
                                    : "bg-gray-700 text-gray-300 border-gray-600"
                                }`}
                              >
                                {lobby.characterA || 1}
                              </div>
                              {isPlayerAWinner && (
                                <div className="absolute -top-1 -right-1 text-sm">👑</div>
                              )}
                            </div>
                            <p
                              className={`font-semibold ${isPlayerAWinner ? "text-amber-300" : "text-gray-400"}`}
                            >
                              {playerAName}
                            </p>
                            {/* Win streak badge - show when Player A wins and has at least 2 consecutive wins */}
                            {isPlayerAWinner && (lobby.winStreak ?? 0) >= 1 && (
                              <span className="px-2 py-1 bg-linear-to-r from-orange-600 to-red-600 rounded text-xs text-white font-bold">
                                🔥 {(lobby.winStreak ?? 0) + 1} Win Streak
                              </span>
                            )}
                          </div>
                          <div className="px-4">
                            <span className="text-2xl opacity-60">⚔️</span>
                          </div>
                          <div className="flex items-center gap-3 flex-1 justify-end">
                            <p
                              className={`font-semibold ${isPlayerBWinner ? "text-amber-300" : "text-gray-400"}`}
                            >
                              {playerBName ?? "---"}
                            </p>
                            <div className="relative">
                              <div
                                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                                  isPlayerBWinner
                                    ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                                    : "bg-linear-to-br from-gray-600 to-gray-800 border-gray-500/50"
                                }`}
                              >
                                <span className="text-white font-bold text-lg">
                                  {playerBName ? playerBName.slice(0, 1).toUpperCase() : "?"}
                                </span>
                              </div>
                              {lobby.playerB && (
                                <div
                                  className={`absolute -bottom-1 -right-1 text-2.5 font-bold px-1.5 py-0.5 rounded-full border ${
                                    isPlayerBWinner
                                      ? "bg-amber-600 text-white border-amber-400"
                                      : "bg-gray-700 text-gray-300 border-gray-600"
                                  }`}
                                >
                                  {lobby.characterB || 1}
                                </div>
                              )}
                              {isPlayerBWinner && (
                                <div className="absolute -top-1 -left-1 text-sm">👑</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-6">
                            <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                              <img src="/sol-logo.svg" alt="SOL" className="w-4 h-4" />
                              <span className="text-white font-bold">
                                {(lobby.amount / 1e9).toFixed(3)}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLobbySelected(lobby.lobbyId);
                              }}
                              className="p-2 bg-gray-800 hover:bg-amber-700/50 rounded-lg transition-colors"
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-gray-400 hover:text-amber-300"
                              >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {openLobbies.filter((l) => l.status === 0 && !l.isPrivate).length === 0 &&
                    completedLobbies.length === 0 && (
                      <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-gray-700/30">
                        <p className="text-gray-400">No games yet</p>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Arena Modal - Shows the Phaser game in a dialog (uses LobbyDetailsDialog with real-time state) */}
      <LobbyDetailsDialog
        isOpen={arenaModalOpen}
        onClose={handleArenaClose}
        lobby={activeLobbyState as LobbyData | null}
        currentPlayerWallet={publicKey?.toString() || ""}
        selectedCharacter={selectedCharacter}
        onJoin={(lobbyId, character) => void handleJoinLobbyFromDialog(lobbyId, character)}
        onFightComplete={handleFightComplete}
        onDoubleDown={(amount, winStreak) => void handleDoubleDown(amount, winStreak)}
        isJoining={joiningLobby}
      />

      {/* Shared Lobby Dialog - Opens when navigating via share link */}
      <LobbyDetailsDialog
        isOpen={sharedLobbyDialogOpen && !!sharedLobby}
        onClose={handleSharedLobbyDialogClose}
        lobby={sharedLobby as LobbyData | null}
        currentPlayerWallet={publicKey?.toString() || ""}
        selectedCharacter={selectedCharacter}
        onJoin={(lobbyId, character) => handleJoinLobbyFromDialog(lobbyId, character)}
        isJoining={joiningLobby}
      />
    </div>
  );
}
