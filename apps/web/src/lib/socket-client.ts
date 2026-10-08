import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth.store";

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

let socket: Socket | null = null;

/**
 * Lazily creates (or reuses) a single Socket.IO client connected with the
 * current access token as the `auth.token` handshake field — verified
 * server-side by InboxGateway using the same JWT secret as JwtAuthGuard.
 * Call `disconnectSocket()` on logout and `getSocket()` again after a fresh
 * login so a stale/expired token isn't reused across sessions.
 */
export function getSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    return null;
  }

  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Reconnect with a fresh token / drop the connection whenever auth state
// changes (login, logout, token refresh).
useAuthStore.subscribe((state, prevState) => {
  if (state.accessToken !== prevState.accessToken) {
    disconnectSocket();
    if (state.accessToken) {
      getSocket();
    }
  }
});
