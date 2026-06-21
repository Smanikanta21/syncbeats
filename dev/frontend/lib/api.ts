// lib/api.ts — Typed fetch wrapper for all SyncBeats API calls
import type { RoomSnapshot } from './types';

export function getServerUrl(){
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }

  // VM deployment uses Nginx reverse proxy from /api -> backend.
  return '/api';
}

const BASE = getServerUrl();

const DEVICE_STORAGE_KEY = 'sb_device_id';
const AUTH_COOKIE_KEY = 'sb_token';
const AUTH_STORAGE_KEY = 'sb_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;

  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) return existing;

  const generated = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, generated);
  return generated;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';').map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

export function getAuthToken(): string | null {
  const cookieToken = readCookie(AUTH_COOKIE_KEY);
  if (cookieToken) return cookieToken;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  localStorage.setItem(AUTH_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getToken(): string | null {
  return getAuthToken();
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
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
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const errorMsg = data.error ?? `HTTP ${res.status} ${res.statusText}`;
    if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development') {
      if (typeof window !== 'undefined') {
        window.alert(`[API Error] ${errorMsg}`);
      }
    }
    throw new ApiError(errorMsg, res.status);
  }
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface User {
  id:         string;
  name:       string;
  email:      string;
  auth_provider: 'LOCAL' | 'GOOGLE' | string;
  email_verified_at: string | null;
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
  checkEmail: (email: string) =>
    request<{ exists: boolean }>('/auth/check-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ ok: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  googleLogin: (credential: string) =>
    request<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),

  resendVerification: (email: string) =>
    request<{ ok: boolean }>('/auth/verification/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyEmail: (token: string) =>
    request<AuthResponse>('/auth/verification/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; devOtp?: string }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  resetPasswordWithOtp: (email: string, otp: string, password: string) =>
    request<{ ok: boolean }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, otp, password }),
    }),

  verifyResetOtp: (email: string, otp: string) =>
    request<{ ok: boolean }>('/auth/password/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),

  updateProfile: (name: string) =>
    request<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }, true),

  me: () => request<AuthResponse>('/auth/me', {}, true),
};

// ── Rooms ─────────────────────────────────────────────────────────────────

export interface Participant {
  socketId:    string;
  displayName: string;
  joinedAt:    number;
  isReady:     boolean;
  volume:      number;
}

export interface TrackQueueItem {
  id:         string;
  trackUrl:   string;
  title:      string;
  fileName:   string;
  queueIndex: number;
  isCurrent:  boolean;
  addedBy:    string;
  createdAt:  number;
}

export interface RoomRecord {
  id:             string;
  host_id:        string;
  track_url:      string | null;
  playback_state: string;
  position_ms:    number;
  created_at:     string;
  ended_at:       string | null;
  is_private?:    boolean;
  participant_count?: number;
}

export interface DeviceListResponse {
  devices: Device[];
}

export interface DeviceUpdateResponse {
  device: Device;
}

export interface DeviceReplaceResponse {
  device: Device;
}
export interface RoomDetailsResponse {
  db: RoomRecord | null;
  live: RoomSnapshot | null;
  participants: Participant[];
  queue: TrackQueueItem[];
}

export const roomsApi = {
  create: () =>
    request<{ roomId: string; createdAt: string }>('/rooms', { method: 'POST', body: '{}' }, true),

  get: (roomId: string) =>
    request<RoomDetailsResponse>(`/rooms/${roomId}`, {}, true),

  mine: () =>
    request<{ rooms: RoomRecord[] }>('/rooms/mine', {}, true),

  endSession: (roomId: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}`, { method: 'DELETE' }, true),

  changeHost: (roomId: string, newHostEmail: string) =>
    request<{ ok: boolean; roomId: string; newHostEmail: string }>(`/rooms/${roomId}/host`, {
      method: 'PATCH',
      body: JSON.stringify({ newHostEmail }),
    }, true),

  enqueueYoutube: (roomId: string, youtubeUrl: string, title?: string) =>
    request<any>(`/rooms/${roomId}/enqueue-youtube`, {
      method: 'POST',
      body: JSON.stringify({ youtubeUrl, title }),
    }, true),

  enqueueMagnet: (roomId: string, magnetUri: string, title?: string) =>
    request<any>(`/rooms/${roomId}/enqueue-magnet`, {
      method: 'POST',
      body: JSON.stringify({ magnetUri, title }),
    }, true),

  searchYoutube: (roomId: string, query: string) =>
    request<any[]>(`/rooms/${roomId}/youtube-search?q=${encodeURIComponent(query)}`, {}, true),

  suggestYoutube: (query: string) =>
    request<string[]>(`/rooms/youtube/suggest?q=${encodeURIComponent(query)}`, {}, true),
};

export const devicesApi = {
  mine: () => request<DeviceListResponse>('/devices/mine', {}, true),

  rename: (deviceId: string, name: string) =>
    request<DeviceUpdateResponse>(`/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }, true),

  remove: (deviceId: string) =>
    request<{ ok: boolean }>(`/devices/${deviceId}`, {
      method: 'DELETE',
    }, true),

  replace: (targetDeviceId: string) =>
    request<DeviceReplaceResponse>('/devices/replace', {
      method: 'POST',
      body: JSON.stringify({ targetDeviceId }),
    }, true),
};
