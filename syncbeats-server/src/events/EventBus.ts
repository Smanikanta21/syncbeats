// ─── Step 5: EventBus — typed singleton observer ──────────────────────────

import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  private static _instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100); // many socket handlers can subscribe safely
  }

  static getInstance(): EventBus {
    if (!EventBus._instance) EventBus._instance = new EventBus();
    return EventBus._instance;
  }
}

export const eventBus = EventBus.getInstance();

export const EVENTS = {
  ROOM_STATE_CHANGED: 'room:stateChanged',
  PARTICIPANT_JOINED: 'room:participantJoined',
  PARTICIPANT_LEFT: 'room:participantLeft',
  HOST_CHANGED: 'room:hostChanged',
} as const;
