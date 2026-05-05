import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = getServerUrl();

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