// lib/socket.ts — Singleton socket client
// Returns the same socket instance across the entire app lifecycle.

import { io, Socket } from 'socket.io-client';

function getServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }

  return '/socket.io';
}


const SERVER_URL = getServerUrl();

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const endpoint = SERVER_URL === '/socket.io' ? undefined : SERVER_URL;
    socket = io(endpoint, {
      autoConnect: false,
      transports: ['websocket'],
      path: '/socket.io',
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
