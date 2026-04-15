// lib/api.ts — Typed fetch wrapper for all SyncBeats API calls

export function getServerUrl(){
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }

  // VM deployment uses Nginx reverse proxy from /api -> backend.
  return '/api';
}

const BASE = getServerUrl();

const DEVICE_STORAGE_KEY = 'sb_device_id';

function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;

  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) return existing;

  const generated = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, generated);
  return generated;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sb_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const deviceId = getDeviceId();
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface User {
  id:         string;
  name:       string;
  email:      string;
  created_at: string;
}

export interface AuthResponse {
  user:  User;
  token: string;
  device: Device | null;
  needsDeviceRename: boolean;
}

export interface Device {
  id:           string;
  device_key:   string;
  name:         string;
  user_agent:   string | null;
  created_at:   string;
  updated_at:   string;
  last_seen_at: string;
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<AuthResponse>('/auth/me', {}, true),
};

// ── Rooms ─────────────────────────────────────────────────────────────────

export interface RoomRecord {
  id:             string;
  host_id:        string;
  track_url:      string | null;
  playback_state: string;
  position_ms:    number;
  created_at:     string;
  ended_at:       string | null;
}

export interface DeviceListResponse {
  devices: Device[];
}

export interface DeviceUpdateResponse {
  device: Device;
}

export interface RoomDetailsResponse {
  db: RoomRecord | null;
  live: {
    roomId: string;
    trackUrl: string | null;
    position: number;
    state: string;
    hostId: string | null;
    timestamp: number;
    participants: Array<{
      socketId: string;
      displayName: string;
      joinedAt: number;
    }>;
  } | null;
  participants: Array<{
    socketId: string;
    displayName: string;
    joinedAt: number;
  }>;
}

export const roomsApi = {
  create: () =>
    request<{ roomId: string; createdAt: string }>('/rooms', { method: 'POST', body: '{}' }, true),

  get: (roomId: string) =>
    request<RoomDetailsResponse>(`/rooms/${roomId}`, {}, true),

  mine: () =>
    request<{ rooms: RoomRecord[] }>('/rooms/mine', {}, true),
};

export const devicesApi = {
  mine: () => request<DeviceListResponse>('/devices/mine', {}, true),

  rename: (deviceId: string, name: string) =>
    request<DeviceUpdateResponse>(`/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }, true),
};
