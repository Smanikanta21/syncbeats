import type { RoomSnapshot } from '../src/lib/types';
import type { EventSocket } from '../src/sync/clock';
export const snapshot = (change: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  roomId: '123456', roomInstanceId: 'room-1', playbackInstanceId: 'play-1', trackUrl: 'youtube:abcdefghijk',
  position: 0, state: 'PAUSED', timestamp: Date.now(), startEpoch: null, pauseOffset: 0, isPlaying: false,
  participants: [], queue: [], shuffle: false, repeatMode: 'off', ...change,
});
export class Socket implements EventSocket {
  connected = true; id = 'phone-1';
  handlers = new Map<string, Set<(...args: any[]) => void>>();
  sent: { event: string; payload: any }[] = [];
  on(event: string, handler: (...args: any[]) => void) { if (!this.handlers.has(event)) this.handlers.set(event, new Set()); this.handlers.get(event)!.add(handler); }
  off(event: string, handler: (...args: any[]) => void) { this.handlers.get(event)?.delete(handler); }
  emit(event: string, payload: any) { this.sent.push({ event, payload }); }
  receive(event: string, payload?: any) { for (const handler of this.handlers.get(event) ?? []) handler(payload); }
}
