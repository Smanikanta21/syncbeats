import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const serverUrl = getServerUrl();
    
    // If we're using the /api prefix (remote VM), route through /api/socket.io
    const isRelativeApi = serverUrl === '/api';
    const socketUrl = isRelativeApi ? (typeof window !== 'undefined' ? window.location.origin : undefined) : serverUrl;
    const socketPath = isRelativeApi ? '/api/socket.io' : '/socket.io';

    socket = io(socketUrl, {
      autoConnect: false,
      transports: ["polling", "websocket"],
      path: socketPath,
      withCredentials: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });
  }

  return socket;
}
