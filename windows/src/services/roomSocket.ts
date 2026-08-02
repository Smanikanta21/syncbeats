import { io, Socket } from 'socket.io-client';
import { apiClient } from './apiClient';
import { authStore } from '../store/authStore';
import { DeviceIdentity } from '../store/deviceIdentity';
import { invoke } from '@tauri-apps/api/core';

export interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  volume: number;
}

export type JoinStatus = 'idle' | 'connecting' | 'joined' | 'pending' | 'denied';

type Listener = () => void;

export class RoomSocket {
  private static instance: RoomSocket;
  public roomId: string | null = null;
  public isConnected: boolean = false;
  public joinStatus: JoinStatus = 'idle';
  public participants: Participant[] = [];
  public hostId: string | null = null;
  public currentSocketId: string | null = null;
  
  // NTP Clock sync parameters (matching Mac app RoomSocket.swift)
  public clockOffset: number = 0; // ms to add to local time to get server time
  public hasClockSync: boolean = false;
  public latencyMs: number = 0;

  private socket: Socket | null = null;
  private seq: number = 0;
  private listeners: Set<Listener> = new Set();
  private resyncInterval: any = null;

  private constructor() {}

  public static getInstance(): RoomSocket {
    if (!RoomSocket.instance) {
      RoomSocket.instance = new RoomSocket();
    }
    return RoomSocket.instance;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public get isInRoom(): boolean {
    return this.roomId !== null && this.joinStatus === 'joined';
  }

  public async getNowMs(): Promise<number> {
    try {
      // Use Rust hardware timestamp if running in Tauri, else performance.now()
      const hwTs = await invoke<number>('get_hardware_timestamp');
      return hwTs;
    } catch {
      return performance.now();
    }
  }

  public serverNowMs(): number {
    return Date.now() + this.clockOffset;
  }

  public joinRoom(id: string) {
    if (this.roomId) {
      this.leaveRoom();
    }
    this.roomId = id;
    this.joinStatus = 'connecting';
    this.notify();

    const device = DeviceIdentity.getInstance();
    const user = authStore.user;

    this.socket = io(apiClient.baseURL, {
      transports: ['websocket'],
      autoConnect: true,
      auth: {
        token: authStore.token,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      },
    });

    this.setupSocketHandlers();
  }

  public leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit('room:leave', { roomId: this.roomId });
      this.socket.disconnect();
    }
    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
      this.resyncInterval = null;
    }
    this.socket = null;
    this.roomId = null;
    this.joinStatus = 'idle';
    this.isConnected = false;
    this.participants = [];
    this.hostId = null;
    this.hasClockSync = false;
    this.clockOffset = 0;
    this.notify();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.currentSocketId = this.socket?.id || null;
      
      const user = authStore.user;
      this.socket?.emit('room:join', {
        roomId: this.roomId,
        userId: user?.id || 'guest-' + Math.random().toString(36).substring(7),
        displayName: user?.displayName || 'Windows Guest',
      });
      this.notify();
    });

    this.socket.on('room:joined', (data: any) => {
      this.joinStatus = 'joined';
      this.participants = data.participants || [];
      this.hostId = data.hostId || null;
      this.startNtpBurstSync();
      this.notify();
    });

    this.socket.on('room:snapshot', (snapshot: any) => {
      if (snapshot.participants) {
        this.participants = snapshot.participants;
      }
      this.notify();
    });

    this.socket.on('sync:pong', (data: { t0: number; t1: number; t2: number; seq: number }) => {
      const t3 = Date.now();
      const rtt = t3 - data.t0;
      const offset = (data.t1 - data.t0 + (data.t2 - t3)) / 2;

      this.latencyMs = Math.round(rtt / 2);
      this.clockOffset = offset;
      this.hasClockSync = true;
      this.notify();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.joinStatus = 'idle';
      this.notify();
    });
  }

  private startNtpBurstSync() {
    const runBurst = () => {
      if (!this.socket || !this.isConnected) return;
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (this.socket && this.isConnected) {
            this.seq++;
            this.socket.emit('sync:ping', { t0: Date.now(), seq: this.seq });
          }
        }, i * 80);
      }
    };

    runBurst();
    this.resyncInterval = setInterval(runBurst, 5000);
  }

  // --- Transport controls mirroring RoomSocket.swift ---
  public schedulePlayback(trackUrl: string, positionMs: number = 0) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:schedule', {
      roomId: this.roomId,
      trackUrl,
      positionMs,
      startTime: this.serverNowMs(),
    });
  }

  public play() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:play', { roomId: this.roomId });
  }

  public pause(positionMs: number) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:pause', { roomId: this.roomId, positionMs });
  }

  public seek(positionMs: number) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:seek', { roomId: this.roomId, position: positionMs });
  }

  public nextTrack() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:next', { roomId: this.roomId });
  }

  public prevTrack() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('playback:prev', { roomId: this.roomId });
  }
}

export const roomSocket = RoomSocket.getInstance();
