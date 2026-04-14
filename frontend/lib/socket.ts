// lib/socket.ts — Singleton socket client
// Returns the same socket instance across the entire app lifecycle.

import { io, Socket } from 'socket.io-client';

function getServerUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }
  
  // In browser, use the current hostname to connect to the API
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:4000`;
  }
  
  return 'http://localhost:4000';
}

const SERVER_URL = getServerUrl();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
