import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const isProd = process.env.NODE_ENV === "production";
    // Use localhost in dev, and specific path in production
    const url = isProd ? "/socket.io" : "http://10.7.9.42:4000";

    socket = io(url, {
      autoConnect: false,
      transports: ["websocket"],
      // If the URL itself is '/socket.io', we might not need the path option twice, 
      // but keeping it depends on your server's proxy configuration.
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