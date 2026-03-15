import { io, Socket } from "socket.io-client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  createElement,
} from "react";

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string) || "http://localhost:3002";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

export const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

/**
 * SocketProvider wraps the app and manages the Socket.io connection.
 * Pass `playerId` (wallet address) once known; the socket reconnects
 * with the new handshake query when the value changes.
 */
export function SocketProvider({
  children,
  playerId,
}: {
  children: ReactNode;
  playerId?: string | null;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const s = io(SERVER_URL, {
      query: {
        playerId: playerId || "",
      },
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    s.on("connect", () => setIsConnected(true));
    s.on("disconnect", () => setIsConnected(false));

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [playerId]);

  return createElement(
    SocketContext.Provider,
    { value: { socket, isConnected } },
    children
  );
}

/**
 * Hook to access the socket instance and connection status.
 */
export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Helper that wraps socket.emit with an ack callback into a Promise.
 *
 * Server handlers are expected to call the ack with
 * `{ success: true, data: ... }` or `{ success: false, error: "..." }`.
 */
export function socketRequest<T = any>(
  socket: Socket,
  event: string,
  data?: any
): Promise<{ success: boolean; data?: T; error?: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Socket request "${event}" timed out after 15s`));
    }, 15_000);

    socket.emit(event, data, (response: any) => {
      clearTimeout(timeout);
      if (response && typeof response === "object") {
        resolve(response);
      } else {
        resolve({ success: true, data: response });
      }
    });
  });
}
