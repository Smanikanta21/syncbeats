// lib/socket-handlers/youtube-sync.ts
import { Server, Socket } from "socket.io";

interface YouTubeSyncState {
  videoId: string;
  position: number;
  isPlaying: boolean;
  timestamp: number;
}

const roomStates = new Map<string, YouTubeSyncState>();

export function setupYouTubeSyncHandlers(io: Server) {
  io.of("/youtube-sync").on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join a room
    socket.on("youtube:join-room", (data: { roomId: string; videoId: string }) => {
      socket.join(data.roomId);
      console.log(`Client ${socket.id} joined room ${data.roomId}`);

      // Send current state to new client
      const state = roomStates.get(data.roomId);
      if (state) {
        socket.emit("youtube:sync-state", state);
      }
    });

    // Broadcast play event
    socket.on("youtube:play", (data: { roomId: string; videoId: string }) => {
      const state: YouTubeSyncState = {
        videoId: data.videoId,
        position: 0,
        isPlaying: true,
        timestamp: Date.now(),
      };
      roomStates.set(data.roomId, state);

      socket.to(data.roomId).emit("youtube:play", {
        videoId: data.videoId,
        timestamp: Date.now(),
      });

      console.log(`▶️ Play event in room ${data.roomId}: ${data.videoId}`);
    });

    // Broadcast pause event
    socket.on("youtube:pause", (data: { roomId: string }) => {
      const state = roomStates.get(data.roomId);
      if (state) {
        state.isPlaying = false;
        state.timestamp = Date.now();
        roomStates.set(data.roomId, state);
      }

      socket.to(data.roomId).emit("youtube:pause", {
        timestamp: Date.now(),
      });

      console.log(`⏸️ Pause event in room ${data.roomId}`);
    });

    // Broadcast position for sync
    socket.on(
      "youtube:position",
      (data: { roomId: string; position: number; videoId: string; timestamp: number }) => {
        const state: YouTubeSyncState = {
          videoId: data.videoId,
          position: data.position,
          isPlaying: true,
          timestamp: data.timestamp,
        };
        roomStates.set(data.roomId, state);

        // Send to all other clients in the room
        socket.to(data.roomId).emit("youtube:position", {
          position: data.position,
          videoId: data.videoId,
          timestamp: data.timestamp,
          sender: socket.id,
        });

        // Log drift info
        const delay = Date.now() - data.timestamp;
        if (delay > 100) {
          console.log(
            `⏱️ Position update in room ${data.roomId}: ${data.position.toFixed(1)}s (latency: ${delay}ms)`
          );
        }
      }
    );

    // Seek event
    socket.on("youtube:seek", (data: { roomId: string; position: number }) => {
      socket.to(data.roomId).emit("youtube:seek", {
        position: data.position,
        timestamp: Date.now(),
      });

      console.log(`🔄 Seek event in room ${data.roomId}: ${data.position.toFixed(1)}s`);
    });

    // Get room state
    socket.on("youtube:get-state", (data: { roomId: string }, callback: Function) => {
      const state = roomStates.get(data.roomId);
      callback(state || null);
    });

    // Leave room
    socket.on("youtube:leave-room", (data: { roomId: string }) => {
      socket.leave(data.roomId);
      console.log(`Client ${socket.id} left room ${data.roomId}`);
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Periodic sync check (every 10 seconds)
  setInterval(() => {
    roomStates.forEach((state, roomId) => {
      if (state.isPlaying) {
        // Check if state is stale (no updates for 30 seconds)
        const staleness = Date.now() - state.timestamp;
        if (staleness > 30000) {
          console.warn(`⚠️ Room ${roomId} state is stale (${staleness}ms), clearing`);
          roomStates.delete(roomId);
        }
      }
    });
  }, 10000);
}

// Export for monitoring
export function getYouTubeSyncStats() {
  return {
    activeRooms: roomStates.size,
    rooms: Array.from(roomStates.entries()).map(([roomId, state]) => ({
      roomId,
      videoId: state.videoId,
      position: state.position.toFixed(1),
      isPlaying: state.isPlaying,
      lastUpdate: new Date(state.timestamp).toISOString(),
    })),
  };
}
