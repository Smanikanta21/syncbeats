import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // In production, we pass `undefined` so socket.io defaults to the current domain (syncbeats.app)
    // and the root namespace. We only provide the custom path.
    const url = process.env.NODE_ENV === "production" ? undefined : "http://10.7.9.42:4000";

    socket = io(url, {
      autoConnect: false,
      transports: ["websocket"],
      path: "/socket.io",
      withCredentials: true,
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}