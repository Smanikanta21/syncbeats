import type { AuthResponse, CatalogPage, CatalogSong, Feed, SearchResult, Track } from './types';
import { server } from './config';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export class ApiClient {
  constructor(
    readonly token: string | null,
    readonly deviceId: string,
    readonly base = server.base,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      // Browser fetch must not receive ApiClient as its `this` value.
      const fetcher = this.fetcher;
      const response = await fetcher(`${this.base}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json', 'Content-Type': 'application/json',
          'X-Device-Id': this.deviceId,
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...options.headers,
        },
      });
      const text = await response.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : undefined; } catch {
        throw new ApiError(response.status, 'The server returned an unexpected response. Please try again.');
      }
      if (!response.ok) {
        const error = data as { error?: string; message?: string } | undefined;
        throw new ApiError(response.status, error?.error || error?.message || `Request failed (${response.status}).`);
      }
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new Error('The server took too long to respond. Please try again.');
      throw new Error('Could not reach SyncBeats. Check your connection and try again.');
    } finally { clearTimeout(timer); }
  }

  post<T>(path: string, body: object) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  login(email: string, password: string) { return this.post<AuthResponse>('/auth/login', { email: email.trim().toLowerCase(), password }); }
  register(name: string, email: string, password: string) { return this.post('/auth/register', { name: name.trim(), email: email.trim().toLowerCase(), password }); }
  me() { return this.request<AuthResponse>('/auth/me'); }
  defaultRoom() { return this.post<{ roomId: string }>('/rooms/default', {}); }
  search(roomId: string, query: string) { return this.request<SearchResult[]>(`/rooms/${roomId}/youtube-search?q=${encodeURIComponent(query)}`); }
  feed() { return this.request<Feed>('/recommendations/feed'); }
  history() { return this.request<{ listens: { youtubeId: string; title: string; artist?: string; thumbnail?: string }[] }>('/history/recent'); }
  enqueue(roomId: string, result: SearchResult) {
    return this.post<{ item: Track }>(`/rooms/${roomId}/enqueue-youtube`, {
      youtubeUrl: result.url, title: result.title || undefined, artist: result.uploaderName,
      ...(result.metadataSource ? { metadataSource: result.metadataSource } : {}),
      ...(result.thumbnail ? { thumbnail: result.thumbnail } : {}),
      ...(result.duration ? { durationSec: result.duration } : {}),
    });
  }
  remove(roomId: string, itemId: string) { return this.request(`/rooms/${roomId}/queue/${encodeURIComponent(itemId)}`, { method: 'DELETE' }); }
  reorder(roomId: string, itemId: string, newIndex: number) {
    return this.request(`/rooms/${roomId}/queue/reorder`, { method: 'PUT', body: JSON.stringify({ itemId, newIndex }) });
  }
  catalog(query = '', cursor: string | null = null) {
    const params = new URLSearchParams({ view: 'songs', limit: '60', q: query });
    if (cursor) params.set('cursor', cursor);
    return this.request<CatalogPage>(`/api/playlists/catalog?${params}`);
  }
  resolve(song: CatalogSong) {
    return this.post<{ youtubeId: string; thumbnail?: string }>('/api/bridge/resolve', {
      title: song.title, artist: song.artist, songId: song.sourceSongID || undefined,
    });
  }
}
