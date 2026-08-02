import { roomSocket } from './roomSocket';
import { apiClient } from './apiClient';
import { invoke } from '@tauri-apps/api/core';

export interface PlayableTrack {
  id: string; // youtubeId or local file path
  title: string;
  artist: string;
  artworkURL?: string;
  queueItemId?: string;
  duration?: number;
  isLocal?: boolean;
}

type Listener = () => void;

export class PlayerEngine {
  private static instance: PlayerEngine;
  public current: PlayableTrack | null = null;
  public isPlaying: boolean = false;
  public isLoading: boolean = false;
  public currentTime: number = 0; // seconds
  public duration: number = 0; // seconds
  public volume: number = 0.8;
  public queue: PlayableTrack[] = [];
  public index: number = 0;

  private audio: HTMLAudioElement;
  private listeners: Set<Listener> = new Set();

  private constructor() {
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.setupAudioListeners();
  }

  public static getInstance(): PlayerEngine {
    if (!PlayerEngine.instance) {
      PlayerEngine.instance = new PlayerEngine();
    }
    return PlayerEngine.instance;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public get hasTrack(): boolean {
    return this.current !== null;
  }

  public get progress(): number {
    return this.duration > 0 ? Math.min(Math.max(this.currentTime / this.duration, 0), 1) : 0;
  }

  public get canGoNext(): boolean {
    return this.index + 1 < this.queue.length;
  }

  public get canGoPrev(): boolean {
    return this.index > 0 || this.currentTime > 3;
  }

  public setVolume(v: number) {
    this.volume = Math.min(Math.max(v, 0), 1);
    this.audio.volume = this.volume;
    this.notify();
  }

  public playTrack(track: PlayableTrack) {
    this.playQueue([track], 0);
  }

  public playQueue(newQueue: PlayableTrack[], startAt: number = 0) {
    if (!newQueue.length || startAt < 0 || startAt >= newQueue.length) return;
    this.queue = newQueue;
    this.index = startAt;
    this.loadCurrent(true);
  }

  public togglePlayPause() {
    if (!this.hasTrack) return;
    this.isPlaying ? this.pause() : this.resume();
  }

  public resume() {
    if (!this.hasTrack) return;
    if (roomSocket.isInRoom) {
      roomSocket.play();
      return;
    }
    this.audio.play().catch(console.error);
    this.isPlaying = true;
    this.updateSMTC();
    this.notify();
  }

  public pause() {
    if (roomSocket.isInRoom) {
      roomSocket.pause(Math.floor(this.currentTime * 1000));
      return;
    }
    this.audio.pause();
    this.isPlaying = false;
    this.updateSMTC();
    this.notify();
  }

  public next() {
    if (roomSocket.isInRoom) {
      roomSocket.nextTrack();
      return;
    }
    if (!this.canGoNext) return;
    this.index++;
    this.loadCurrent(true);
  }

  public prev() {
    if (roomSocket.isInRoom) {
      roomSocket.prevTrack();
      return;
    }
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }
    if (this.index > 0) {
      this.index--;
      this.loadCurrent(true);
    } else {
      this.seek(0);
    }
  }

  public seek(seconds: number) {
    const clamped = Math.max(0, Math.min(seconds, this.duration || seconds));
    if (roomSocket.isInRoom) {
      roomSocket.seek(Math.floor(clamped * 1000));
      return;
    }
    this.audio.currentTime = clamped;
    this.currentTime = clamped;
    this.notify();
  }

  public seekFraction(f: number) {
    if (this.duration > 0) {
      this.seek(f * this.duration);
    }
  }

  private loadCurrent(autoPlay: boolean) {
    if (this.index < 0 || this.index >= this.queue.length) return;
    const track = this.queue[this.index];
    this.current = track;
    this.currentTime = 0;
    this.duration = track.duration || 0;
    this.isLoading = true;
    this.notify();

    let streamUrl = '';
    if (track.isLocal && track.id) {
      streamUrl = `file:///${track.id.replace(/\\/g, '/')}`;
    } else {
      streamUrl = apiClient.getStreamUrl(track.id);
    }

    this.audio.src = streamUrl;
    this.audio.load();

    if (roomSocket.isInRoom) {
      roomSocket.schedulePlayback(streamUrl);
    } else if (autoPlay) {
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.updateSMTC();
        this.notify();
      }).catch(console.error);
    }
  }

  private setupAudioListeners() {
    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      this.notify();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audio.duration && isFinite(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
      this.isLoading = false;
      this.notify();
    });

    this.audio.addEventListener('ended', () => {
      if (this.canGoNext) {
        this.next();
      } else {
        this.isPlaying = false;
        this.updateSMTC();
        this.notify();
      }
    });

    this.audio.addEventListener('error', () => {
      this.isLoading = false;
      this.isPlaying = false;
      this.notify();
    });
  }

  private updateSMTC() {
    if (!this.current) return;
    try {
      invoke('update_smtc_metadata', {
        title: this.current.title,
        artist: this.current.artist,
        album: 'SyncBeats',
        coverUrl: this.current.artworkURL || null,
      }).catch(() => {});
      invoke('update_smtc_playback', {
        isPlaying: this.isPlaying,
      }).catch(() => {});
    } catch {}
  }
}

export const playerEngine = PlayerEngine.getInstance();
