export interface RoomData {
  id: string;
  code: string;
  name: string;
  hostId: string;
  participantCount?: number;
}

export interface TrackSearchResult {
  id: string; // videoId
  title: string;
  artist: string;
  thumbnailUrl: string;
  duration: number;
}

export class APIClient {
  private static instance: APIClient;
  public baseURL: string = 'http://localhost:4000';
  private authToken: string | null = null;

  private constructor() {
    // Allows dynamic override if server runs on non-standard port or domain
    const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
    if (envUrl) {
      this.baseURL = envUrl;
    }
  }

  public static getInstance(): APIClient {
    if (!APIClient.instance) {
      APIClient.instance = new APIClient();
    }
    return APIClient.instance;
  }

  public setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  public async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(err.message || 'Login failed');
    }
    return res.json();
  }

  public async register(email: string, password: string, displayName: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${this.baseURL}/api/auth/register`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ email, password, displayName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(err.message || 'Registration failed');
    }
    return res.json();
  }

  public async createRoom(name: string): Promise<RoomData> {
    const res = await fetch(`${this.baseURL}/api/rooms`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error('Failed to create room');
    }
    return res.json();
  }

  public async getRoom(roomId: string): Promise<RoomData> {
    const res = await fetch(`${this.baseURL}/api/rooms/${roomId}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error('Room not found');
    }
    return res.json();
  }

  public async searchTracks(query: string): Promise<TrackSearchResult[]> {
    const res = await fetch(`${this.baseURL}/api/search?q=${encodeURIComponent(query)}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      return [];
    }
    return res.json();
  }

  public getStreamUrl(videoId: string): string {
    return `${this.baseURL}/api/search/youtube/download?videoId=${encodeURIComponent(videoId)}`;
  }
}

export const apiClient = APIClient.getInstance();
