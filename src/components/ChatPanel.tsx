import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePrivyWallet } from "../hooks/usePrivyWallet";
import { Send, Trophy, MessageCircle, GripHorizontal } from "lucide-react";

const MAX_MESSAGE_LENGTH = 200;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;
const DEFAULT_HEIGHT = 400;
const STORAGE_KEY = "chat-panel-height";

interface ChatPanelProps {
  fullHeight?: boolean;
  embedded?: boolean; // For inline layout (not fixed positioned)
  resizable?: boolean; // Enable vertical resizing
}

export function ChatPanel({ fullHeight = false, embedded = false, resizable = false }: ChatPanelProps) {
  const { walletAddress, connected } = usePrivyWallet();
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Resizable height state
  const [height, setHeight] = useState(() => {
    if (typeof window !== "undefined" && resizable) {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_HEIGHT), MAX_HEIGHT) : DEFAULT_HEIGHT;
    }
    return DEFAULT_HEIGHT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = "touches" in e ? e.touches[0].clientY : e.clientY;
    resizeStartHeight.current = height;
  }, [height]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - resizeStartY.current;
      const newHeight = Math.min(Math.max(resizeStartHeight.current + deltaY, MIN_HEIGHT), MAX_HEIGHT);
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, height.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleMouseMove);
    document.addEventListener("touchend", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleMouseMove);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [isResizing, height]);

  // Fetch messages with real-time updates
  const messages = useQuery(api.chat.getRecentMessages) || [];
  const sendMessage = useMutation(api.chat.sendMessage);

  // Get player data for display name
  const playerData = useQuery(
    api.players.getPlayer,
    walletAddress ? { walletAddress } : "skip"
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle message submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!walletAddress || !inputValue.trim() || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        await sendMessage({
          walletAddress,
          message: inputValue.trim(),
          displayName: playerData?.displayName || undefined,
        });
        setInputValue("");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);
        // Clear error after 3 seconds
        setTimeout(() => setError(null), 3000);
      } finally {
        setIsSubmitting(false);
      }
    },
    [walletAddress, inputValue, isSubmitting, sendMessage, playerData?.displayName]
  );

  // Format sender display
  const formatSender = (wallet?: string, name?: string) => {
    if (name) return name;
    if (wallet) return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
    return "System";
  };

  // Container classes based on props
  const containerClasses = embedded
    ? "w-full h-full flex flex-col bg-black/60 backdrop-blur-sm rounded-lg border border-amber-500/30"
    : fullHeight
      ? "fixed top-20 left-4 bottom-4 w-80 z-40 flex flex-col bg-black/60 backdrop-blur-sm rounded-lg border border-amber-500/30"
      : resizable
        ? "fixed top-20 left-4 w-80 z-40 flex flex-col bg-black/60 backdrop-blur-sm rounded-lg border border-amber-500/30"
        : "fixed top-20 left-4 w-80 z-40 flex flex-col bg-black/60 backdrop-blur-sm rounded-lg border border-amber-500/30";

  const containerStyle = embedded
    ? { height: "calc(100vh - 120px)" }
    : fullHeight
      ? {}
      : resizable
        ? { height: `${height}px` }
        : { maxHeight: "280px" };

  // Messages container height
  const messagesStyle = embedded || fullHeight || resizable
    ? { minHeight: "100px" }
    : { maxHeight: "160px", minHeight: "100px" };

  return (
    <div className={containerClasses} style={containerStyle}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20 shrink-0">
        <MessageCircle className="w-5 h-5 text-amber-400" />
        <span className="text-amber-100 text-lg font-bold uppercase tracking-wider">
          Chat
        </span>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
        style={messagesStyle}
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 text-lg text-center py-4">No messages yet</div>
        ) : (
          messages.map((msg) => (
            <div key={msg._id} className="text-lg">
              {msg.type === "winner" ? (
                // Winner announcement
                <div className="flex items-start gap-2 py-2 px-2 rounded bg-amber-900/30 border border-amber-500/20">
                  <Trophy className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                  <span className="text-yellow-300">{msg.message}</span>
                </div>
              ) : (
                // User message
                <div className="py-1">
                  <span className="text-amber-400 font-medium">
                    {formatSender(msg.senderWallet, msg.senderName)}:
                  </span>{" "}
                  <span className="text-gray-200">{msg.message}</span>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {connected ? (
        <form onSubmit={handleSubmit} className="px-3 py-3 border-t border-amber-500/20 shrink-0">
          {error && (
            <div className="text-red-400 text-sm mb-1 truncate">{error}</div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="Type a message..."
              disabled={isSubmitting}
              className="flex-1 bg-black/50 border border-amber-600/40 rounded px-3 py-2 text-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isSubmitting}
              className="bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded transition-colors"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="text-gray-500 text-sm mt-1 text-right">
            {inputValue.length}/{MAX_MESSAGE_LENGTH}
          </div>
        </form>
      ) : (
        <div className="px-3 py-3 border-t border-amber-500/20 text-gray-500 text-lg text-center shrink-0">
          Connect wallet to chat
        </div>
      )}

      {/* Resize Handle */}
      {resizable && (
        <div
          className={`flex items-center justify-center py-1 cursor-ns-resize hover:bg-amber-500/20 transition-colors border-t border-amber-500/20 ${isResizing ? "bg-amber-500/30" : ""}`}
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
        >
          <GripHorizontal className="w-5 h-5 text-amber-500/50" />
        </div>
      )}
    </div>
  );
}
