import { io, Socket } from "socket.io-client";
import { getServerUrl } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const serverUrl = getServerUrl();
    const usesApiProxy = serverUrl === '/api';
    const socketUrl = usesApiProxy
      ? (typeof window !== 'undefined' ? window.location.origin : undefined)
      : serverUrl;

    socket = io(socketUrl, {
      autoConnect: false,
      transports: ["websocket"],
      path: usesApiProxy ? '/api/socket.io' : '/socket.io',
      withCredentials: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });
  }

  return socket;
}
