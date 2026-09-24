/**
 * useSpatialAudio.ts
 *
 * Bridges the room's socket state to {@link SpatialAudioEngine}:
 *
 *  1. Splices the engine into the player's audio graph once the context unlocks
 *  2. Keeps the speaker field (devices, seats, listening origin) up to date
 *  3. Feeds it the synced server clock so every device orbits in lockstep
 *  4. Exposes preview/commit position updates for dragging
 *
 * Positions travel over the wire as **absolute** room coordinates, but every
 * caller here works in **local** coordinates relative to `layout.origin` — your
 * seat in My Space, the room centre in Room. The conversion lives here so the 3D
 * scene can treat the origin as the middle of the world and nothing else has to
 * think about it.
 *
 * Deliberately owns no per-frame state: the 3D stage reads positions and gains
 * straight off the engine inside its own render loop, so orbiting never triggers
 * a React re-render, and dragging goes through `previewPosition` (engine + socket
 * only) until the pointer comes up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import type { SpatialPosition, Speaker } from '../lib/spatial/geometry';
import {
  absolutePolar,
  clamp,
  MAX_ELEVATION,
  MAX_RADIUS,
  MIN_ELEVATION,
  MIN_RADIUS,
} from '../lib/spatial/geometry';
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
/** Wait this long after computing a default before claiming it, so a late
 *  server snapshot wins over our guess. */
const CLAIM_DELAY_MS = 400;

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
  /** Discrete move (slider, quick-place button): local coords in, state + emit */
  updatePosition: (key: string, local: SpatialPosition) => void;
  /** Mid-drag: updates audio and remote clients without a React re-render */
  previewPosition: (key: string, local: SpatialPosition) => void;
  /** Pointer-up: clears the preview and commits to state */
  commitPosition: (key: string, local: SpatialPosition) => void;
  resetLayout: () => void;
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

  /**
   * ponytail: a remote `spatial:update` re-renders the whole room page at the
   * sender's drag rate (~20Hz), because `positions` has to live here — the panel
   * is mounted at two call sites, so pushing the hook down would double the
   * socket handlers and the default-position claims. Fix by hoisting the panel
   * to one call site first, if remote drags ever feel janky.
   */
  const [positions, setPositions] = useState<Record<string, SpatialPosition>>({});
  const [engineState, setEngineState] = useState<AudioContextState | 'uninitialised'>('uninitialised');

  const initialisedRef = useRef(false);
  const lastSnapshotRef = useRef('');
  const pendingEmitRef = useRef<Map<string, SpatialPosition>>(new Map());
  const lastEmitAtRef = useRef(0);
  const emitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Keys we've already claimed a default for — stops the claim effect re-firing */
  const claimedRef = useRef<Set<string>>(new Set());

  // ── Layout ─────────────────────────────────────────────────────────────────

  const layout = useMemo(
    () => buildSpatialLayout(participants, positions, myUserId, myDeviceId, mode),
    [participants, positions, myUserId, myDeviceId, mode],
  );

  // Mirrored into refs so `applyField` can run outside React (mid-drag).
  const layoutRef = useRef(layout);
  const modeRef = useRef(mode);
  const previewRef = useRef<{ key: string; position: SpatialPosition } | null>(null);

  /**
   * Push the current speaker field to the engine, substituting the in-flight
   * drag preview if there is one. Cheap enough to call every pointer-move:
   * a map + sort over at most a handful of devices.
   */
  const applyField = useCallback(() => {
    const l = layoutRef.current;
    const preview = previewRef.current;
    // My Space surrounds you with your own devices; Room uses everybody's.
    const pool = modeRef.current === 'solo' ? (l.me?.devices ?? []) : l.devices;

    const speakers: Speaker[] = pool.map(d => ({
      id: d.deviceId,
      position: preview && preview.key === d.deviceId ? preview.position : d.position,
    }));

    engine.setField(speakers, l.origin);
  }, [engine]);

  useEffect(() => {
    layoutRef.current = layout;
    modeRef.current = mode;
    applyField();
  }, [layout, mode, applyField]);

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
    engine.setRunning(isPlaying && enabled);
  }, [engine, isPlaying, enabled]);

  // Beat-driven jumps. The engine ignores these outside 'beat' mode, so there is
  // nothing to gate on here — and gating would mean resubscribing on every mode
  // change, which the panel now owns.
  useEffect(() => subscribeToBeat('bass', () => engine.onBeat()), [engine, subscribeToBeat]);

  // ── Audio graph splice, once the context is unlocked ────────────────────────

  useEffect(() => {
    if (!enabled) {
      // Unsplice rather than just bypassing. A ConvolverNode keeps convolving
      // with its output at zero, so an "off" toggle that only muted the sends
      // left the most expensive node in the graph running. `init` re-splices.
      engine.dispose();
      initialisedRef.current = false;
      setEngineState('uninitialised');
      return;
    }
    if (initialisedRef.current) return;
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

  // `spatial:update` is the only spatial event the server broadcasts; departed
  // devices need no event because the layout is driven by the participant list.
  useEffect(() => {
    if (!socket || !enabled) return;

    const onUpdate = ({ deviceId, position }: { deviceId: string; position: SpatialPosition }) => {
      if (!deviceId || !position) return;
      setPositions(prev => ({ ...prev, [deviceId]: sanitise(position) }));
    };

    socket.on('spatial:update', onUpdate);
    return () => {
      socket.off('spatial:update', onUpdate);
    };
  }, [socket, enabled]);

  // ── Emitting ───────────────────────────────────────────────────────────────

  const flushEmit = useCallback(() => {
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

  /** Coalesce to one emit per key per interval, always with a trailing send. */
  const queueEmit = useCallback(
    (key: string, absolute: SpatialPosition) => {
      pendingEmitRef.current.set(key, absolute);

      const since = Date.now() - lastEmitAtRef.current;
      if (since >= EMIT_INTERVAL_MS) {
        flushEmit();
      } else if (!emitTimerRef.current) {
        emitTimerRef.current = setTimeout(flushEmit, EMIT_INTERVAL_MS - since);
      }
    },
    [flushEmit],
  );

  useEffect(() => () => {
    if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
  }, []);

  /** Local (origin-relative) → absolute room coordinates. */
  const toAbsolute = useCallback(
    (local: SpatialPosition) => sanitise(absolutePolar(sanitise(local), layoutRef.current.origin)),
    [],
  );

  const updatePosition = useCallback(
    (key: string, local: SpatialPosition) => {
      const absolute = toAbsolute(local);
      claimedRef.current.add(key);
      setPositions(prev => ({ ...prev, [key]: absolute }));
      queueEmit(key, absolute);
    },
    [toAbsolute, queueEmit],
  );

  /**
   * Mid-drag path. Skips `setPositions` entirely — the puck is being moved by
   * mutating its mesh, so a React update here would just re-render the room at
   * pointer-move rate. Audio and remote clients still follow live.
   */
  const previewPosition = useCallback(
    (key: string, local: SpatialPosition) => {
      const absolute = toAbsolute(local);
      previewRef.current = { key, position: absolute };
      applyField();
      queueEmit(key, absolute);
    },
    [toAbsolute, applyField, queueEmit],
  );

  const commitPosition = useCallback(
    (key: string, local: SpatialPosition) => {
      previewRef.current = null;
      const absolute = toAbsolute(local);
      claimedRef.current.add(key);
      setPositions(prev => ({ ...prev, [key]: absolute }));
      queueEmit(key, absolute);
      flushEmit();
    },
    [toAbsolute, queueEmit, flushEmit],
  );

  /**
   * Claim the placements we own but the server has never seen, so everyone else
   * sees the same arrangement. Each client only ever claims its own devices,
   * which avoids two clients racing to place the same one.
   */
  useEffect(() => {
    if (!socket?.connected || !layout.me) return;

    const mine: Array<[string, SpatialPosition]> = [];
    const mySeatKey = seatKey(layout.me.userId);

    if (layout.me.seatIsDefault && !claimedRef.current.has(mySeatKey)) {
      mine.push([mySeatKey, layout.me.seat]);
    }
    layout.me.devices.forEach(d => {
      if (d.isDefault && !claimedRef.current.has(d.deviceId)) mine.push([d.deviceId, d.position]);
    });
    if (mine.length === 0) return;

    const timer = setTimeout(() => {
      mine.forEach(([deviceId, position]) => {
        claimedRef.current.add(deviceId);
        socket.emit('spatial:update', { roomId, deviceId, position });
      });
      setPositions(prev => {
        const next = { ...prev };
        mine.forEach(([k, v]) => { next[k] = v; });
        return next;
      });
    }, CLAIM_DELAY_MS);

    return () => clearTimeout(timer);
  }, [socket, roomId, layout]);

  /**
   * Drop my stored placements. The claim effect above then recomputes the
   * deterministic defaults and re-publishes them, so everyone converges.
   */
  const resetLayout = useCallback(() => {
    const me = layoutRef.current.me;
    if (!me) return;

    previewRef.current = null;
    const keys = [seatKey(me.userId), ...me.devices.map(d => d.deviceId)];
    keys.forEach(k => claimedRef.current.delete(k));

    setPositions(prev => {
      const next = { ...prev };
      keys.forEach(k => delete next[k]);
      return next;
    });
  }, []);



  const resumeAudio = useCallback(async () => {
    await engine.resume();
    setEngineState(engine.getContextState());
  }, [engine]);

  return {
    layout,
    positions,
    updatePosition,
    previewPosition,
    commitPosition,
    resetLayout,
    engine,
    engineState,
    resumeAudio,
  };
}
