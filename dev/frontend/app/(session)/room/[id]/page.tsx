"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { use } from "react";
import { FullscreenLoader } from "../../../../components/FullscreenLoader";
import { useRoom } from "../../../../hooks/useRoom";
import { useAudio } from "../../../../context/AudioContext";
import { useAuth } from "../../../../context/AuthContext";
import { useWakeLock } from "../../../../hooks/useWakeLock";
import { useSpatialAudio } from "../../../../hooks/useSpatialAudio";
import { useAmbientLight } from "../../../../hooks/useAmbientLight";
import { RoomDashboard } from "../../../../components/room/RoomDashboard";
import { getSocket } from "../../../../lib/socket";
import { cn } from "../../../../lib/utils";
import { useSyncInfo } from "../../../../context/SyncContext";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const audio = useAudio();
  const { user, device, loading: authLoading } = useAuth();
  const resolvedParams = use(params);

  // Drive the global ambient background blobs reactively with music frequency data
  useAmbientLight();

  const {
    isConnected,
    joinStatus,
    snapshot,
    participants,
    currentSocketId,
    deviceSyncProgress,
    clockOffset,
    pendingRequests,
    incomingTrack,
    play,
    pause,
    seek,
    nextTrack,
    prevTrack,
    setParticipantVolume,
    leave,
    togglePrivate,
    setReady,
  } = useRoom({
    roomId: resolvedParams.id,
    displayName: user?.name ? `${user.name}::${device?.name || "Device"}` : "Guest",
    userId: user?.id,
  });

  const isConnecting = joinStatus === "connecting" || joinStatus === "pending";
  const connectionError = joinStatus === "denied";

  // Keep screen awake
  useWakeLock(true);

  const [orbitData, setOrbitData] = useState<{fromId: string, toId: string, frac: number} | null>(null);

  // Auto-redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?returnTo=/room/${resolvedParams.id}`);
    }
  }, [user, authLoading, router, resolvedParams.id]);

  // Sync client ready state to the room
  useEffect(() => {
    if (isConnected) {
      setReady(audio.isReady);
    }
  }, [audio.isReady, setReady, isConnected]);

  // Sync volume from server if modified remotely
  const myParticipant = participants.find(p => p.socketId === currentSocketId);
  useEffect(() => {
    if (myParticipant?.volume !== undefined) {
      const curVol = audio.getVolume ? audio.getVolume() : audio.volume;
      if (curVol !== myParticipant.volume) {
        audio.setVolume(myParticipant.volume);
      }
    }
  }, [myParticipant?.volume]);

  const isHost = snapshot?.hostId === user?.id;
  const isPlaying = snapshot?.isPlaying ?? false;
  const isPrivate = snapshot?.isPrivate ?? false;
  const hostId = snapshot?.hostId ?? null;

  const syncCtx = useSyncInfo();
  useEffect(() => {
    syncCtx.setIsRoomPlaying(isPlaying);
    syncCtx.setParticipants(participants);
    syncCtx.setClockOffset(clockOffset);
    syncCtx.setPendingRequests(pendingRequests);
    syncCtx.setHostId(hostId);
    syncCtx.setJoinStatus(joinStatus);
    syncCtx.setIsPrivate(isPrivate);
    syncCtx.setDeviceSyncProgress(() => deviceSyncProgress);
    syncCtx.setIncomingTrack(incomingTrack || null);

    syncCtx.setPlay(() => play);
    syncCtx.setPause(() => pause);
    syncCtx.setSeek(() => seek);
    syncCtx.setNextTrack(() => nextTrack);
    syncCtx.setPrevTrack(() => prevTrack);
  }, [
    isPlaying, participants, clockOffset, pendingRequests, hostId,
    joinStatus, isPrivate, deviceSyncProgress, incomingTrack, syncCtx,
    play, pause, seek, nextTrack, prevTrack
  ]);

  // Spatial audio
  const { spatialDevices, updatePosition, syncUIState, setDeviceSequence, setOrbitSpeed, orbitSpeed } = useSpatialAudio({
    socket: isConnected ? getSocket() : null,
    audioCtx: audio.audioCtx,
    gainNode: audio.gainNode,
    myDeviceId: currentSocketId ?? "",
    roomId: resolvedParams.id,
    enabled: isConnected,
    initialDevices: snapshot?.spatial ?? [],
    participants,
    isPlaying: snapshot?.isPlaying ?? false,
    onOrbitUpdate: useCallback((fromId: string, toId: string, frac: number) => {
      setOrbitData({ fromId, toId, frac });
    }, []),
  });

  // Build device sequence from all participants
  useEffect(() => {
    if (participants.length > 0) {
      setDeviceSequence(participants.map(p => p.socketId));
    }
  }, [participants, setDeviceSequence]);

  // Playback actions (wired to socket via useRoom)
  const handlePlay = useCallback(() => play(), [play]);
  const handlePause = useCallback(() => pause(), [pause]);
  const handleSeek = useCallback((secs: number) => seek(secs * 1000), [seek]);
  const handleNext = useCallback(() => nextTrack(), [nextTrack]);
  const handlePrev = useCallback(() => prevTrack(), [prevTrack]);

  const handleLeave = useCallback(() => {
    leave();
    router.push("/hub");
  }, [leave, router]);



  // Browsers require a physical click to unlock AudioContext
  const isLocalPlayBlocked = snapshot?.isPlaying && !audio.audioUnlocked;

  return (
    <main
      role="main"
      aria-label="SyncBeats Room"
      className={cn("fixed", "inset-0", "w-full", "h-dvh", "overflow-hidden", "z-0")}
    >

      {/* Loading state */}
      <FullscreenLoader
        isVisible={authLoading || (!isConnected && !connectionError)}
        message={isConnecting ? "Connecting to peers…" : "Loading…"}
      />

      {/* Tap to enable audio (mobile / iOS AudioContext unlock) */}
      {isLocalPlayBlocked && (
        <div
          onClick={() => audio.unlockAudio()}
          className={cn(
            "fixed", "inset-0", "bg-background/40", "flex", "items-center",
            "justify-center", "z-[99999]", "cursor-pointer",
          )}
        >
          <div className={cn("bg-foreground/10", "backdrop-blur-md", "p-6", "rounded-2xl", "text-center")}>
            <p className={cn("font-bold", "text-foreground", "tracking-wider")}>Tap anywhere to enable audio</p>
          </div>
        </div>
      )}

      {/* Main room UI */}
      {isConnected && (
        <RoomDashboard
          roomId={resolvedParams.id}
          snapshot={snapshot}
          participants={participants}
          mySocketId={currentSocketId}
          isHost={isHost}
          hostId={snapshot?.hostId ?? null}
          myUserId={user?.id}
          isPlaying={isPlaying}
          deviceSyncProgress={deviceSyncProgress}
          isPrivate={isPrivate}
          spatialDevices={spatialDevices}
          onUpdateSpatialPosition={updatePosition}
          syncUIState={syncUIState}
          audio={{
            isPlaying: audio.isPlaying,
            isReady: audio.isReady,
            hasTrack: audio.hasTrack,
            trackTitle: audio.trackTitle,
            trackUrl: audio.trackUrl,
            error: audio.error,
            downloadProgress: audio.downloadProgress,
            duration: audio.duration,
            volume: audio.volume,
            getRawAudioData: audio.getRawAudioData,
            eqGains: audio.eqGains,
            setEqBand: audio.setEqBand,
            setVolume: audio.setVolume,
            getVolume: audio.getVolume,
            toggleMute: audio.toggleMute,
            unlockAudio: audio.unlockAudio,
          }}
          orbitSpeed={orbitSpeed}
          orbitData={orbitData}
          onOrbitSpeedChange={setOrbitSpeed}
          onPlay={handlePlay}
          onPause={handlePause}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeek={handleSeek}
          onTogglePrivate={() => togglePrivate(!isPrivate)}
          onLeave={handleLeave}
          onSetParticipantVolume={setParticipantVolume}
          onAddSong={() => {
            // Trigger the DynamicIsland YouTube search
            document.dispatchEvent(new CustomEvent("island:expand-add"));
          }}
        />
      )}
    </main>
  );
}
