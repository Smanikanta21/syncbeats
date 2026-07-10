"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState, useMemo } from "react";
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
    approveJoin,
    denyJoin,
    setReady,
    prefetch,
  } = useRoom({
    roomId: resolvedParams.id,
    displayName: user?.name ? `${user.name}::${device?.name || "Device"}` : "Guest",
    userId: user?.id,
  });

  const isConnecting = joinStatus === "connecting" || joinStatus === "pending";
  const connectionError = joinStatus === "denied";

  // State for UI pan meter / orbit trail
  // orbitData is now managed locally in SpatialPanel

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

  const {
    setIsRoomPlaying, setParticipants, setClockOffset, setPendingRequests,
    setHostId, setJoinStatus, setIsPrivate, setDeviceSyncProgress, setIncomingTrack,
    setPrefetch, setPlay, setPause, setSeek, setNextTrack, setPrevTrack
  } = useSyncInfo();

  useEffect(() => {
    setIsRoomPlaying(isPlaying);
    setParticipants(participants);
    setClockOffset(clockOffset);
    setPendingRequests(pendingRequests);
    setHostId(hostId);
    setJoinStatus(joinStatus);
    setIsPrivate(isPrivate);
    setDeviceSyncProgress(() => deviceSyncProgress);
    setIncomingTrack(incomingTrack || null);
    setPrefetch(prefetch);

    setPlay(() => play);
    setPause(() => pause);
    setSeek(() => seek);
    setNextTrack(() => nextTrack);
    setPrevTrack(() => prevTrack);
  }, [
    isPlaying, participants, clockOffset, pendingRequests, hostId,
    joinStatus, isPrivate, deviceSyncProgress, incomingTrack, prefetch,
    play, pause, seek, nextTrack, prevTrack,
    setIsRoomPlaying, setParticipants, setClockOffset, setPendingRequests,
    setHostId, setJoinStatus, setIsPrivate, setDeviceSyncProgress, setIncomingTrack,
    setPrefetch, setPlay, setPause, setSeek, setNextTrack, setPrevTrack
  ]);

  // ── Spatial Mode State ────────────────────────────────────────────────────────
  const [spatialMode, setSpatialMode] = useState<'multiplayer' | '8d-solo'>('multiplayer');

  const allow8DSolo = false; // Temporarily removed 8D audio solo

  // Spatial audio
  const { spatialDevices, updatePosition, syncUIState, setDeviceSequence, setOrbitSpeed, orbitSpeed } = useSpatialAudio({
    socket: isConnected ? getSocket() : null,
    audioCtx: audio.audioCtx,
    gainNode: audio.gainNode,
    myDeviceId: currentSocketId ?? "",
    roomId: resolvedParams.id,
    enabled: isConnected,
    initialDevices: snapshot?.spatial ?? [],
    participants: participants,
    isPlaying: snapshot?.isPlaying ?? false,
    is8DSoloMode: spatialMode === '8d-solo' && allow8DSolo,
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
        message={joinStatus === "pending" ? "Waiting for host to let you in..." : isConnecting ? "Connecting to peers…" : "Loading…"}
      />

      {/* Denied state */}
      {connectionError && (
        <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[99999]">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Join Request Denied</h2>
          <p className="text-foreground/50 text-sm mb-6">The host declined your request to join this private room.</p>
          <button onClick={() => router.push('/hub')} className="px-6 py-2 bg-foreground/10 rounded-full font-bold text-sm hover:bg-foreground/20 transition-colors">Return to Hub</button>
        </div>
      )}

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
          myUserId={user?.id ?? undefined}
          isPlaying={isPlaying}
          deviceSyncProgress={deviceSyncProgress}
          isPrivate={isPrivate}
          allow8DSolo={allow8DSolo}
          spatialDevices={spatialDevices}
          onUpdateSpatialPosition={updatePosition}
          syncUIState={syncUIState}
          spatialMode={spatialMode}
          onSpatialModeChange={setSpatialMode}
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

      {/* Host Join Requests UI */}
      {isHost && pendingRequests.length > 0 && (
        <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 w-80">
          {pendingRequests.map(req => (
            <div key={req.socketId} className="bg-background/90 backdrop-blur-xl border border-foreground/10 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 animate-in slide-in-from-right-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {req.displayName?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">{req.displayName}</h4>
                  <p className="text-[10px] text-foreground/50">Wants to join the room</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => denyJoin(req.socketId)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 font-bold text-xs hover:bg-red-500/20 transition-colors"
                >
                  Deny
                </button>
                <button 
                  onClick={() => approveJoin(req.socketId, req.displayName)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-blue-500 text-white font-bold text-xs hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
