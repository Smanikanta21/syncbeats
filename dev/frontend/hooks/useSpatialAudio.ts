/**
 * useSpatialAudio.ts
 *
 * Bridges the room's socket state to {@link SpatialAudioEngine}:
 *
 *  1. Splices the engine into the player's audio graph once the context unlocks
 *  2. Keeps the speaker field (devices, seats, listening origin) up to date
 *  3. Feeds it the synced server clock so every device orbits in lockstep
 *  4. Exposes throttled position updates for dragging
 *
 * Deliberately owns no per-frame state: the 3D stage reads positions and gains
 * straight off the engine inside its own render loop, so dragging and orbiting
 * never trigger a React re-render.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import type { SpatialPosition, Speaker } from '../lib/spatial/geometry';
import { clamp, MAX_ELEVATION, MAX_RADIUS, MIN_ELEVATION, MIN_RADIUS } from '../lib/spatial/geometry';
import { DEFAULT_MOTION, type MotionConfig } from '../lib/spatial/motion';
import {
  buildSpatialLayout,
  seatKey,
  type SpatialLayout,
} from '../lib/spatial/layout';
import type { Participant } from '../lib/types';
import { useBeatEngine } from '../context/BeatContext';

export interface DeviceSpatialState {
  deviceId: string;
  position: SpatialPosition;
}

export type SpatialMode = 'solo' | 'room';

/** Position updates are emitted at most this often while dragging. */
const EMIT_INTERVAL_MS = 50;

interface UseSpatialAudioOptions {
  socket: Socket | null;
  audioCtx: AudioContext | null | undefined;
  /** Last EQ band — the engine splices itself in after this */
  eqOutputNode: AudioNode | null | undefined;
  /** Analyser feeding the destination — the far side of the splice */
  analyserNode: AudioNode | null | undefined;
  myDeviceId: string;
  myUserId: string;
  roomId: string;
  participants: Participant[];
  /** Server positions from `room:snapshot` */
  initialDevices?: DeviceSpatialState[];
  isPlaying?: boolean;
  /** Milliseconds to add to `Date.now()` to get server time */
  clockOffset?: number;
  mode?: SpatialMode;
  enabled?: boolean;
}

interface UseSpatialAudioReturn {
  layout: SpatialLayout;
  /** Absolute positions keyed by socket id / `seat:<userId>` */
  positions: Record<string, SpatialPosition>;
  updatePosition: (key: string, position: SpatialPosition) => void;
  /** Push the latest position immediately — call on pointer-up */
  flushPosition: (key: string) => void;
  resetLayout: () => void;
  motion: MotionConfig;
  setMotion: (patch: Partial<MotionConfig>) => void;
  engine: SpatialAudioEngine;
  engineState: AudioContextState | 'uninitialised';
  resumeAudio: () => Promise<void>;
}

const sanitise = (p: SpatialPosition): SpatialPosition => ({
  angle: Number.isFinite(p.angle) ? p.angle : 0,
  radius: clamp(Number.isFinite(p.radius) ? p.radius : 1, MIN_RADIUS, MAX_RADIUS),
  elevation: clamp(Number.isFinite(p.elevation) ? p.elevation : 0, MIN_ELEVATION, MAX_ELEVATION),
});

export function useSpatialAudio({
  socket,
  audioCtx,
  eqOutputNode,
  analyserNode,
  myDeviceId,
  myUserId,
  roomId,
  participants,
  initialDevices,
  isPlaying = false,
  clockOffset = 0,
  mode = 'solo',
  enabled = true,
}: UseSpatialAudioOptions): UseSpatialAudioReturn {
  const engine = SpatialAudioEngine.getInstance();
  const { subscribeToBeat } = useBeatEngine();

  const [positions, setPositions] = useState<Record<string, SpatialPosition>>({});
  const [motion, setMotionState] = useState<MotionConfig>({ ...DEFAULT_MOTION });
  const [engineState, setEngineState] = useState<AudioContextState | 'uninitialised'>('uninitialised');

  const initialisedRef = useRef(false);
  const lastSnapshotRef = useRef('');
  const pendingEmitRef = useRef<Map<string, SpatialPosition>>(new Map());
  const lastEmitAtRef = useRef(0);
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Layout ─────────────────────────────────────────────────────────────────

  const layout = useMemo(
    () => buildSpatialLayout(participants, positions, myUserId, myDeviceId, mode),
    [participants, positions, myUserId, myDeviceId, mode],
  );

  // ── Engine wiring ──────────────────────────────────────────────────────────

  useEffect(() => {
    engine.setMyDeviceId(myDeviceId);
  }, [engine, myDeviceId]);

  useEffect(() => {
    engine.setClockOffset(clockOffset);
  }, [engine, clockOffset]);

  useEffect(() => {
    engine.setEnabled(enabled);
  }, [engine, enabled]);

  useEffect(() => {
    engine.setMotion(motion);
  }, [engine, motion]);

  // Only your own devices form the surround field in My Space; the whole room
  // does in Room mode. Either way positions go over as absolute coordinates and
  // the engine re-centres them on the origin.
  useEffect(() => {
    const source = mode === 'solo' ? (layout.me?.devices ?? []) : layout.devices;
    const speakers: Speaker[] = source.map(d => ({ id: d.deviceId, position: d.position }));
    engine.setField(speakers, layout.origin);
  }, [engine, layout, mode]);

  useEffect(() => {
    engine.setRunning(isPlaying && enabled);
  }, [engine, isPlaying, enabled]);

  // Beat-driven jumps. The engine ignores these outside 'beat' mode, and
  // resolves the target from the synced clock so all devices land together.
  useEffect(() => {
    if (motion.mode !== 'beat') return;
    return subscribeToBeat('bass', () => engine.onBeat());
  }, [engine, motion.mode, subscribeToBeat]);

  // ── Audio graph splice, once the context is unlocked ────────────────────────

  useEffect(() => {
    if (initialisedRef.current || !enabled) return;
    if (!audioCtx || !eqOutputNode || !analyserNode) return;

    try {
      engine.init(audioCtx, eqOutputNode, analyserNode, myDeviceId);
      initialisedRef.current = true;
      engine.resume().then(() => setEngineState(engine.getContextState()));
    } catch (err) {
      console.warn('[SpatialAudio] engine init failed:', err);
    }
  }, [engine, enabled, audioCtx, eqOutputNode, analyserNode, myDeviceId]);

  // ── Server positions ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialDevices || initialDevices.length === 0) return;

    const key = JSON.stringify(initialDevices);
    if (key === lastSnapshotRef.current) return;
    lastSnapshotRef.current = key;

    setPositions(prev => {
      const next = { ...prev };
      initialDevices.forEach(({ deviceId, position }) => {
        if (deviceId && position) next[deviceId] = sanitise(position);
      });
      return next;
    });
  }, [initialDevices]);

  useEffect(() => {
    if (!socket || !enabled) return;

    const onUpdate = ({ deviceId, position }: { deviceId: string; position: SpatialPosition }) => {
      if (!deviceId || !position) return;
      setPositions(prev => ({ ...prev, [deviceId]: sanitise(position) }));
    };

    const onSnapshot = ({ devices }: { devices: DeviceSpatialState[] }) => {
      if (!Array.isArray(devices)) return;
      setPositions(prev => {
        const next = { ...prev };
        devices.forEach(({ deviceId, position }) => {
          if (deviceId && position) next[deviceId] = sanitise(position);
        });
        return next;
      });
    };

    const onDeviceLeft = ({ deviceId }: { deviceId: string }) => {
      setPositions(prev => {
        if (!(deviceId in prev)) return prev;
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
    };

    socket.on('spatial:update', onUpdate);
    socket.on('spatial:snapshot', onSnapshot);
    socket.on('spatial:device:left', onDeviceLeft);

    return () => {
      socket.off('spatial:update', onUpdate);
      socket.off('spatial:snapshot', onSnapshot);
      socket.off('spatial:device:left', onDeviceLeft);
    };
  }, [socket, enabled]);

  // ── Emitting ───────────────────────────────────────────────────────────────

  const flushPending = useCallback(() => {
    if (emitTimerRef.current) {
      clearTimeout(emitTimerRef.current);
      emitTimerRef.current = null;
    }
    if (!socket?.connected || pendingEmitRef.current.size === 0) return;

    pendingEmitRef.current.forEach((position, deviceId) => {
      socket.emit('spatial:update', { roomId, deviceId, position });
    });
    pendingEmitRef.current.clear();
    lastEmitAtRef.current = Date.now();
  }, [socket, roomId]);

  /**
   * Apply locally straight away, then emit at a capped rate. Dragging a puck
   * used to fire a socket message per pointer-move per device.
   */
  const updatePosition = useCallback(
    (key: string, position: SpatialPosition) => {
      const clean = sanitise(position);
      setPositions(prev => ({ ...prev, [key]: clean }));

      pendingEmitRef.current.set(key, clean);

      const since = Date.now() - lastEmitAtRef.current;
      if (since >= EMIT_INTERVAL_MS) {
        flushPending();
      } else if (!emitTimerRef.current) {
        emitTimerRef.current = setTimeout(flushPending, EMIT_INTERVAL_MS - since);
      }
    },
    [flushPending],
  );

  const flushPosition = useCallback(() => flushPending(), [flushPending]);

  useEffect(() => () => {
    if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
  }, []);

  // Publish placements we own but the server has never seen, so everyone else
  // sees the same arrangement. Each client only ever claims its own devices.
  useEffect(() => {
    if (!socket?.connected || !layout.me) return;

    const mine: Array<[string, SpatialPosition]> = [];
    if (layout.me.seatIsDefault) mine.push([seatKey(layout.me.userId), layout.me.seat]);
    layout.me.devices.forEach(d => {
      if (d.isDefault) mine.push([d.deviceId, d.position]);
    });
    if (mine.length === 0) return;

    const timer = setTimeout(() => {
      mine.forEach(([deviceId, position]) => {
        socket.emit('spatial:update', { roomId, deviceId, position });
      });
      setPositions(prev => {
        const next = { ...prev };
        mine.forEach(([k, v]) => { next[k] = v; });
        return next;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [socket, roomId, layout]);

  const resetLayout = useCallback(() => {
    if (!layout.me) return;
    setPositions(prev => {
      const next = { ...prev };
      delete next[seatKey(layout.me!.userId)];
      layout.me!.devices.forEach(d => delete next[d.deviceId]);
      return next;
    });
  }, [layout]);

  const setMotion = useCallback((patch: Partial<MotionConfig>) => {
    setMotionState(prev => ({ ...prev, ...patch }));
  }, []);

  const resumeAudio = useCallback(async () => {
    await engine.resume();
    setEngineState(engine.getContextState());
  }, [engine]);

  return {
    layout,
    positions,
    updatePosition,
    flushPosition,
    resetLayout,
    motion,
    setMotion,
    engine,
    engineState,
    resumeAudio,
  };
}
