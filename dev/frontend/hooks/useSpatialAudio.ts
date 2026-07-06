/**
 * useSpatialAudio.ts
 *
 * React hook that:
 *  1. Initialises SpatialAudioEngine on first user gesture
 *  2. Listens to Socket.IO spatial events and forwards them to the engine
 *  3. Exposes helpers the UI calls when a user moves a device on the orbit
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  SpatialAudioEngine,
  type SpatialPosition,
  type DeviceSpatialState,
} from '../audio/SpatialAudioEngine';

// ── Socket event shape contracts ──────────────────────────────────────────────

interface SpatialUpdatePayload {
  deviceId: string;
  position: SpatialPosition;
}

interface SpatialSnapshotPayload {
  devices: DeviceSpatialState[];
}

interface DeviceJoinPayload {
  deviceId: string;
  position: SpatialPosition;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseSpatialAudioOptions {
  socket: Socket | null;
  audioCtx: AudioContext | null | undefined;
  gainNode: AudioNode | null | undefined;
  myDeviceId: string;
  roomId: string;
  enabled?: boolean;
  initialDevices?: DeviceSpatialState[];
  participants?: any[];
  isPlaying?: boolean;
  is8DSoloMode?: boolean;
  onOrbitUpdate?: (fromId: string, toId: string, frac: number) => void;
}

interface UseSpatialAudioReturn {
  updatePosition: (deviceId: string, position: SpatialPosition) => void;
  syncUIState: (listenerCart: {x: number, y: number, z: number}, offsets: Map<string, {fanX: number, fanY: number}>, myPos?: {angle: number, radius: number, elevation: number}) => void;
  setDeviceGain: (deviceId: string, gain: number) => void;
  setMasterGain: (gain: number) => void;
  setDeviceSequence: (deviceIds: string[]) => void;
  setOrbitSpeed: (secondsPerDevice: number) => void;
  orbitSpeed: number;
  engineState: AudioContextState | 'uninitialised';
  resumeAudio: () => Promise<void>;
  /** Current list of device spatial states for rendering the UI */
  spatialDevices: DeviceSpatialState[];
}

export function useSpatialAudio({
  socket,
  audioCtx,
  gainNode,
  myDeviceId,
  roomId,
  enabled = true,
  initialDevices = [],
  participants = [],
  isPlaying = false,
  is8DSoloMode = false,
  onOrbitUpdate,
}: UseSpatialAudioOptions): UseSpatialAudioReturn {
  const engine = SpatialAudioEngine.getInstance();
  const initialisedRef = useRef(false);

  // Sync auto-rotate state — set mode FIRST, then start/stop orbit
  useEffect(() => {
    engine.set8DSoloMode(is8DSoloMode);
    engine.setAutoRotate(isPlaying);
  }, [isPlaying, is8DSoloMode, engine]);

  useEffect(() => {
    if (onOrbitUpdate) {
      engine.setOrbitUpdateCallback(onOrbitUpdate);
    }
  }, [onOrbitUpdate, engine]);

  const [engineState, setEngineState] = useState<AudioContextState | 'uninitialised'>('uninitialised');
  const [spatialDevices, setSpatialDevices] = useState<DeviceSpatialState[]>(initialDevices);
  const [orbitSpeed, setOrbitSpeedState] = useState(3);

  // Track which snapshot we last applied to avoid re-running on unrelated re-renders
  const lastSnapshotRef = useRef<string>("");

  // Apply snapshot positions whenever the server gives us a fresh set.
  // We merge: snapshot entries overwrite known positions, but locally-tracked
  // devices not in the snapshot are preserved.
  useEffect(() => {
    if (!initialDevices || initialDevices.length === 0) return;

    // Stringify to detect actual changes (avoids infinite loops from new array refs)
    const key = JSON.stringify(initialDevices);
    if (key === lastSnapshotRef.current) return;
    lastSnapshotRef.current = key;

    setSpatialDevices(prev => {
      const merged = [...prev];
      initialDevices.forEach(incoming => {
        const idx = merged.findIndex(d => d.deviceId === incoming.deviceId);
        if (idx >= 0) {
          merged[idx] = incoming; // overwrite with server position
        } else {
          merged.push(incoming); // add new device
        }
      });
      return merged;
    });
    engine.applySnapshot(initialDevices);
  }, [initialDevices, engine]);

  // Keep spatialDevices in sync with participants joining/leaving
  useEffect(() => {
    if (!participants || participants.length === 0) return;
    
    setSpatialDevices(prev => {
      let changed = false;
      const newDevices = [...prev];
      
      // Add missing participants
      const ORBIT_RINGS = [1, 2, 3] as const;
      participants.forEach(p => {
        if (!newDevices.some(d => d.deviceId === p.socketId)) {
          const userId = p.userId ?? p.socketId;
          const existingDeviceForUser = newDevices.find(d => {
            const existingP = participants.find(ep => ep.socketId === d.deviceId);
            const existingUserId = existingP ? (existingP.userId ?? existingP.socketId) : d.deviceId;
            return existingUserId === userId;
          });

          let defaultPos;
          if (existingDeviceForUser) {
            defaultPos = { ...existingDeviceForUser.position };
          } else {
            const checkCollision = (r: number, a: number) => {
              return newDevices.some(d => d.position.radius === r && d.position.angle === a);
            };

            let ring = 1;
            let posOnRing = 0;
            while (true) {
              const angle = posOnRing * (Math.PI / 2);
              if (!checkCollision(ring, angle)) {
                defaultPos = { angle, radius: ring, elevation: 0 };
                break;
              }
              posOnRing++;
              if (posOnRing >= 4) {
                posOnRing = 0;
                ring++;
              }
            }
          }
          
          newDevices.push({ deviceId: p.socketId, position: defaultPos });
          engine.addDevice(p.socketId, defaultPos);
          changed = true;
        }
      });
      
      // Remove stale participants
      const activeSocketIds = new Set(participants.map(p => p.socketId));
      for (let i = newDevices.length - 1; i >= 0; i--) {
        if (!activeSocketIds.has(newDevices[i].deviceId)) {
          engine.removeDevice(newDevices[i].deviceId);
          newDevices.splice(i, 1);
          changed = true;
        }
      }
      
      return changed ? newDevices : prev;
    });
  }, [participants, myDeviceId, engine]);

  // Keep engine's myDeviceId in sync and apply snapshot safely
  useEffect(() => {
    if (myDeviceId) {
      engine.setMyDeviceId(myDeviceId);
    }
    // Only apply snapshot if the engine is running AND we know who we are
    if (engineState === 'running' && myDeviceId) {
      engine.applySnapshot(spatialDevices);
    }
  }, [myDeviceId, spatialDevices, engineState, engine]);

  // ── One-time init on first user gesture ───────────────────────────────────

  useEffect(() => {
    if (initialisedRef.current || !enabled) return;

    const initEngine = () => {
      if (!audioCtx || !gainNode) return;

      try {
        engine.init(audioCtx, gainNode, myDeviceId);
        engine.resume().then(() => {
          setEngineState(engine.getContextState());
        });
        initialisedRef.current = true;
      } catch (err) {
        console.warn('[SpatialAudio] init failed (likely already initialised):', err);
      }
    };

    // If already running (from useAudioPlayer unlocking), just init immediately
    if (audioCtx && audioCtx.state === 'running' && gainNode) {
      initEngine();
      return;
    }

    const handleFirstGesture = () => {
      initEngine();
      window.removeEventListener('click', handleFirstGesture, { capture: true });
      window.removeEventListener('touchstart', handleFirstGesture, { capture: true });
    };

    window.addEventListener('click', handleFirstGesture, { once: true, capture: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true, capture: true });

    return () => {
      window.removeEventListener('click', handleFirstGesture, { capture: true });
      window.removeEventListener('touchstart', handleFirstGesture, { capture: true });
    };
  }, [enabled, myDeviceId, audioCtx, gainNode, engine]);

  // ── Socket.IO event listeners ──────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !enabled) return;

    const onSnapshot = ({ devices }: SpatialSnapshotPayload) => {
      engine.applySnapshot(devices);
      setSpatialDevices(devices);
      setEngineState(engine.getContextState());
    };

    const onUpdate = ({ deviceId, position }: SpatialUpdatePayload) => {
      engine.updatePosition(deviceId, position);
      setSpatialDevices(prev =>
        prev.map(d => (d.deviceId === deviceId ? { ...d, position } : d))
      );
    };

    const onDeviceJoined = ({ deviceId, position }: DeviceJoinPayload) => {
      if (deviceId === myDeviceId) return;
      engine.addDevice(deviceId, position);
      setSpatialDevices(prev => {
        if (prev.some(d => d.deviceId === deviceId)) return prev;
        return [...prev, { deviceId, position }];
      });
    };

    const onDeviceLeft = ({ deviceId }: { deviceId: string }) => {
      engine.removeDevice(deviceId);
      setSpatialDevices(prev => prev.filter(d => d.deviceId !== deviceId));
    };

    socket.on('spatial:snapshot', onSnapshot);
    socket.on('spatial:update', onUpdate);
    socket.on('spatial:device:joined', onDeviceJoined);
    socket.on('spatial:device:left', onDeviceLeft);

    return () => {
      socket.off('spatial:snapshot', onSnapshot);
      socket.off('spatial:update', onUpdate);
      socket.off('spatial:device:joined', onDeviceJoined);
      socket.off('spatial:device:left', onDeviceLeft);
    };
  }, [socket, enabled, myDeviceId, engine]);

  // ── Exposed callbacks ──────────────────────────────────────────────────────

  const updatePosition = useCallback(
    (deviceId: string, position: SpatialPosition) => {
      if (!socket) return;
      // Update locally immediately
      if (deviceId !== myDeviceId) {
         engine.updatePosition(deviceId, position);
      }
      setSpatialDevices(prev =>
        prev.map(d => (d.deviceId === deviceId ? { ...d, position } : d))
      );
      socket.emit('spatial:update', {
        roomId,
        deviceId,
        position,
      });
    },
    [socket, roomId, myDeviceId, engine]
  );

  const setDeviceGain = useCallback(
    (deviceId: string, gain: number) => {
      engine.setDeviceGain(deviceId, gain);
    },
    [engine]
  );

  const setMasterGain = useCallback(
    (gain: number) => {
      engine.setMasterGain(gain);
    },
    [engine]
  );

  const resumeAudio = useCallback(async () => {
    await engine.resume();
    setEngineState(engine.getContextState());
  }, [engine]);

  const setDeviceSequence = useCallback(
    (deviceIds: string[]) => {
      engine.setDeviceSequence(deviceIds);
    },
    [engine]
  );

  const setOrbitSpeed = useCallback(
    (secondsPerDevice: number) => {
      engine.setOrbitSpeed(secondsPerDevice);
      setOrbitSpeedState(secondsPerDevice);
    },
    [engine]
  );
  const syncUIState = useCallback((listenerCart: {x: number, y: number, z: number}, offsets: Map<string, {fanX: number, fanY: number}>, myPos?: {angle: number, radius: number, elevation: number}) => {
    engine.setUIState(listenerCart, offsets);
    if (myPos) {
      engine.orientListenerTowardCenter(myPos);
    }
  }, [engine]);

  return { updatePosition, syncUIState, setDeviceGain, setMasterGain, setDeviceSequence, setOrbitSpeed, orbitSpeed, engineState, resumeAudio, spatialDevices };
}
