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
  audioRef: React.RefObject<HTMLAudioElement | null>;
  myDeviceId: string;
  roomId: string;
  enabled?: boolean;
  initialDevices?: DeviceSpatialState[];
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
  audioRef,
  myDeviceId,
  roomId,
  enabled = true,
  initialDevices = [],
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

  // ── One-time init on first user gesture ───────────────────────────────────

  useEffect(() => {
    if (initialisedRef.current || !enabled) return;

    const handleFirstGesture = () => {
      const audioEl = audioRef.current;
      if (!audioEl) return;

      try {
        engine.init(audioEl, myDeviceId);
        engine.resume().then(() => {
          setEngineState(engine.getContextState());
        });
        initialisedRef.current = true;
      } catch (err) {
        console.warn('[SpatialAudio] init failed (likely already initialised):', err);
      }

      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture, { once: true, capture: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true, capture: true });

    return () => {
      window.removeEventListener('click', handleFirstGesture, { capture: true });
      window.removeEventListener('touchstart', handleFirstGesture, { capture: true });
    };
  }, [enabled, myDeviceId, audioRef, engine]);

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
