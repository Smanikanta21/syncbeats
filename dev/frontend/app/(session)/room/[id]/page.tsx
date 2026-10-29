"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { use } from "react";
import { useRoom } from "../../../../hooks/useRoom";
import { useAudio } from "../../../../context/AudioContext";
import { useAuth } from "../../../../context/AuthContext";
import { useWakeLock } from "../../../../hooks/useWakeLock";

import { useSyncInfo } from "../../../../context/SyncContext";
import { useConnection } from "../../../../context/ConnectionContext";
import { useLoadingTasks } from "../../../../context/LoadingContext";
import { RoomDashboard } from "../../../../components/room/RoomDashboard";
import { SpatialBeatNodes } from "../../../../components/room/SpatialBeatNodes";
import { FluidField } from "../../../../components/fluid/FluidField";
import { getTrackThumbnailUrl } from "../../../../lib/colorExtractor";
import { cn } from "../../../../lib/utils";

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const audio = useAudio();
  const { user, device, loading: authLoading } = useAuth();
  const { retryNow } = useConnection();
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;

  const [isTimedOut, setIsTimedOut] = useState(false);

  // True once the fluid solver is actually running, which stands down
  // SpatialBeatNodes' gradient layer so the two ambient systems never stack.
  // When the fluid can't run (no WebGL2, low tier, reduced motion), this stays
  // false and SpatialBeatNodes remains the ambient background as before.
  const [fluidActive, setFluidActive] = useState(false);



  const {
    isConnected,
    joinStatus,
    isReconnecting,
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
    roomId: roomId,
    displayName: user?.name ? `${user.name}::${device?.name || "Device"}` : "Guest",
    userId: user?.id,
    authLoading: authLoading,
  });

  const connectionError = joinStatus === "denied" || joinStatus === "not_found" || isTimedOut;
  const { setLoadingTask } = useLoadingTasks();

  useEffect(() => {
    const task = !connectionError && !snapshot
      ? {
          title: authLoading
            ? "Restoring your session"
            : joinStatus === "pending"
              ? "Waiting for host approval"
              : isConnected
                ? "Loading your room"
                : "Connecting to your room",
          detail: authLoading
            ? "Checking your account before joining."
            : joinStatus === "pending"
              ? "The room is private. The host will see your request shortly."
              : isConnected
              ? "Fetching the queue, listeners, and current playback state."
              : "Establishing the room connection and measuring this device's clock against the server.",
          priority: 8,
        }
      : null;
    setLoadingTask(`room:${roomId}`, task);
    return () => setLoadingTask(`room:${roomId}`, null);
  }, [authLoading, isConnected, snapshot, connectionError, roomId, setLoadingTask]);

  // Safeguard: 8-second loading timeout to prevent infinite "Loading..." spinner
  useEffect(() => {
    if (isConnected || (joinStatus as string) === "joined" || joinStatus === "denied") {
      setIsTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      if (!isConnected && (joinStatus as string) !== "joined") {
        setIsTimedOut(true);
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [isConnected, joinStatus]);

  // Auto-redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?returnTo=/room/${roomId}`);
    }
  }, [user, authLoading, router, roomId]);

  // Sync client ready state to the room
  useEffect(() => {
    if (isConnected) {
      setReady(audio.isReady);
    }
  }, [audio.isReady, setReady, isConnected, snapshot?.pendingPlay, snapshot?.trackUrl]);

  // Sync volume from server if modified remotely
  const myParticipant = participants?.find(p => p.socketId === currentSocketId);
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

  // Keep screen awake and audio session alive while music is playing.
  // This activates the native Screen Wake Lock + hidden video fallback (iOS workaround).
  // Previously this hook was imported but never called — that was the root cause of
  // screen turning off and background audio stopping on iOS/Android PWA.
  useWakeLock(isPlaying || audio.isPlaying);

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
  const isLocalPlayBlocked = snapshot?.isPlaying && !audio.audioUnlocked && audio.audioCtx?.state !== 'running';

  return (
    <main
      role="main"
      aria-label="SyncBeats Room"
      className="fixed inset-0 w-full h-dvh overflow-hidden z-0 bg-background transition-colors duration-1000 ease-in-out"
    >


      {/* Subtle reconnecting banner — shown when socket drops while already in room */}
      {isReconnecting && !isConnected && (
        <div className="fixed top-0 left-0 right-0 z-9999 flex justify-center pt-16 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/80 backdrop-blur-xl border border-foreground/10 shadow-lg text-sm font-medium text-foreground/70">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Reconnecting…
          </div>
        </div>
      )}

      {/* Denied / Connection Error state */}
      {connectionError && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center z-[99999]">
          <div className="w-20 h-20 rounded-3xl bg-bad-500/10 border border-bad-500/20 flex items-center justify-center mb-5 shadow-2xl">
            <svg className="w-10 h-10 text-bad-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-display text-display font-semibold mb-3">
            {joinStatus === "not_found"
              ? "Room Not Found"
              : joinStatus === "denied"
              ? "Join Request Denied"
              : "Room Connection Timed Out"}
          </h2>
          <p className="text-lead text-foreground/55 mb-7 max-w-md text-pretty">
            {joinStatus === "not_found"
              ? "No room exists with that code. Double-check the code and try again."
              : joinStatus === "denied"
              ? "The host declined your request to join this private room."
              : "Unable to establish a connection to this room. The server might be unreachable or your connection timed out."}
          </p>
          <div className="flex items-center gap-3">
            {isTimedOut && (
              <button
                onClick={() => {
                  setIsTimedOut(false);
                  retryNow();
                }}
                className="px-6 py-3 bg-foreground text-background rounded-2xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-lg"
              >
                Retry Connection
              </button>
            )}
            <button
              onClick={() => router.push('/hub')}
              className="px-6 py-3 bg-foreground/10 hover:bg-foreground/20 rounded-2xl font-bold text-sm transition-all"
            >
              Return to Hub
            </button>
          </div>
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
          <div className="bg-foreground/10 backdrop-blur-md p-6 rounded-2xl text-center">
            <p className="font-bold text-foreground tracking-wider">Tap anywhere to enable audio</p>
          </div>
        </div>
      )}

      {/* Ambient background.
          FluidField is the real one: a GPU fluid solver whose forces come from
          the beat, so the background is displaced by the music rather than
          decorated with it. It reports back whether it actually came up —
          SpatialBeatNodes keeps its own gradient layer as the fallback for
          devices that can't run a solver, and keeps its buffering aura either
          way. */}
      <FluidField
        isPlaying={isPlaying || audio.isPlaying}
        startEpoch={snapshot?.startEpoch ?? null}
        clockOffset={clockOffset}
        coverUrl={getTrackThumbnailUrl(
          snapshot?.queue?.find((q) => q.isCurrent) ?? { trackUrl: snapshot?.trackUrl ?? undefined },
        )}
        onActiveChange={setFluidActive}
      />

      {/* Spatial Beat Nodes (Visual representation of beat pulses mapped behind room elements) */}
      <SpatialBeatNodes suppressGradient={fluidActive} />

      {/* Main room UI — mounted once we have a snapshot, kept alive through reconnects */}
      {(isConnected || snapshot) && (
        <RoomDashboard
          roomId={roomId}
          snapshot={snapshot}
          participants={participants}
          mySocketId={currentSocketId}
          isHost={isHost}
          hostId={snapshot?.hostId ?? null}
          myUserId={user?.id ?? undefined}
          isPlaying={isPlaying}
          deviceSyncProgress={deviceSyncProgress}
          isPrivate={isPrivate}
          audio={{
            isPlaying: audio.isPlaying,
            isReady: audio.isReady,
            hasTrack: audio.hasTrack,
            trackTitle: audio.trackTitle,
            trackUrl: audio.trackUrl,
            error: audio.error,
            downloadProgress: audio.downloadProgress,
            duration: audio.duration,
            currentTime: audio.currentTime,
            volume: audio.volume,
            getRawAudioData: audio.getRawAudioData,
            eqGains: audio.eqGains,
            setEqBand: audio.setEqBand,
            setVolume: audio.setVolume,
            getVolume: audio.getVolume,
            toggleMute: audio.toggleMute,
            unlockAudio: audio.unlockAudio,
          }}
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
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ background: "var(--accent-gradient)" }}
                >
                  {req.displayName?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">{req.displayName}</h4>
                  <p className="micro-label">Wants to join</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => denyJoin(req.socketId)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-bad-500/10 text-bad-500 font-bold text-xs hover:bg-bad-500/20 transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={() => approveJoin(req.socketId, req.displayName)}
                  className="flex-1 px-3 py-1.5 rounded-xl text-white font-bold text-xs transition-opacity hover:opacity-90 shadow-lg"
                  style={{ background: "var(--accent-gradient)", boxShadow: "0 8px 24px var(--accent-glow)" }}
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
