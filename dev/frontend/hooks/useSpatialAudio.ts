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
}

interface UseSpatialAudioReturn {
  updatePosition: (deviceId: string, position: SpatialPosition) => void;
  setDeviceGain: (deviceId: string, gain: number) => void;
  setMasterGain: (gain: number) => void;
  engineState: AudioContextState | 'uninitialised';
  resumeAudio: () => Promise<void>;
  /** Current list of device spatial states for rendering the OrbitUI */
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
}: UseSpatialAudioOptions): UseSpatialAudioReturn {
  const engine = SpatialAudioEngine.getInstance();
  const initialisedRef = useRef(false);

  const [engineState, setEngineState] = useState<AudioContextState | 'uninitialised'>('uninitialised');
  const [spatialDevices, setSpatialDevices] = useState<DeviceSpatialState[]>(initialDevices);

  // Sync initial configuration once available
  useEffect(() => {
    if (initialDevices.length > 0 && spatialDevices.length === 0) {
      setSpatialDevices(initialDevices);
      engine.applySnapshot(initialDevices);
    }
  }, [initialDevices, spatialDevices.length, engine]);

  // Keep spatialDevices in sync with participants joining/leaving
  useEffect(() => {
    if (!participants || participants.length === 0) return;
    
    setSpatialDevices(prev => {
      let changed = false;
      const newDevices = [...prev];
      
      // Add missing participants
      participants.forEach(p => {
        if (p.socketId === myDeviceId) return;
        if (!newDevices.some(d => d.deviceId === p.socketId)) {
          // Default position: straight ahead
          const defaultPos = { angle: 0, radius: 1, elevation: 0 };
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
      if (deviceId === myDeviceId) return;
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

  return { updatePosition, setDeviceGain, setMasterGain, engineState, resumeAudio, spatialDevices };
}
