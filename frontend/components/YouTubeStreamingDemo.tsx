"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { getServerUrl } from "@/lib/api";
import { Navbar } from "./Navbar";

interface StreamTest {
  videoId: string;
  url: string;
  status: "idle" | "loading" | "ready" | "playing" | "paused" | "error";
  error: string | null;
  position: number;
  duration: number;
  isPlaying: boolean;
}

export default function YouTubeStreamingDemo() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [roomId, setRoomId] = useState("");
  const [streamTest, setStreamTest] = useState<StreamTest>({
    videoId: "",
    url: "",
    status: "idle",
    error: null,
    position: 0,
    duration: 0,
    isPlaying: false,
  });

  const playerRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialPositionRef = useRef<number>(0);
  const initialIsPlayingRef = useRef<boolean>(false);
  // Refs to avoid stale closures inside socket handlers and player callbacks
  const roomIdRef = useRef<string>("");
  const videoIdRef = useRef<string>("");

  // Keep refs in sync with state
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { videoIdRef.current = streamTest.videoId; }, [streamTest.videoId]);

  // Initialize room ID on mount to prevent SSR hydration mismatches
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam) {
        setRoomId(roomParam);
      } else {
        const generated = Math.random().toString(36).slice(7);
        setRoomId(generated);
        const newUrl = `${window.location.pathname}?room=${generated}`;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, []);

  // Create the YouTube player for a given videoId
  const createPlayer = useCallback((videoId: string) => {
    // Destroy existing player first to avoid duplicate iframes
    if (playerRef.current && typeof playerRef.current.destroy === "function") {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    playerRef.current = new (window as any).YT.Player("youtube-player", {
      height: "390",
      width: "640",
      videoId: videoId,
      playerVars: {
        autoplay: initialIsPlayingRef.current ? 1 : 0,
        controls: 1,
        modestbranding: 1,
      },
      events: {
        onReady: (event: any) => {
          setStreamTest((prev) => ({
            ...prev,
            status: "ready",
            duration: event.target.getDuration(),
          }));

          if (initialPositionRef.current > 0) {
            console.log(`⏱️ Seeking to initial position: ${initialPositionRef.current}s`);
            event.target.seekTo(initialPositionRef.current);
            initialPositionRef.current = 0;
          }

          if (initialIsPlayingRef.current) {
            event.target.playVideo();
            initialIsPlayingRef.current = false;
          }

          // Clear any previous sync interval
          if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

          // Start sync every 3 seconds — uses refs for latest values
          syncIntervalRef.current = setInterval(() => {
            if (playerRef.current && socketRef.current?.connected) {
              const position = playerRef.current.getCurrentTime();
              const isPlaying = playerRef.current.getPlayerState() === 1;

              setStreamTest((prev) => ({
                ...prev,
                position,
                isPlaying,
              }));

              socketRef.current.emit("youtube:position", {
                position,
                timestamp: Date.now(),
                videoId: videoIdRef.current,
                roomId: roomIdRef.current,
                isPlaying,
              });
            }
          }, 3000);
        },
        onStateChange: (event: any) => {
          const state = event.data;
          const isPlaying = state === 1;
          setStreamTest((prev) => ({
            ...prev,
            isPlaying,
            status: isPlaying ? "playing" : "paused",
          }));

          if (socketRef.current?.connected) {
            if (isPlaying) {
              socketRef.current.emit("youtube:play", {
                videoId: videoIdRef.current,
                roomId: roomIdRef.current,
              });
            } else if (state === 2) {
              socketRef.current.emit("youtube:pause", {
                roomId: roomIdRef.current,
              });
            }
          }
        },
        onError: (event: any) => {
          const errors: { [key: number]: string } = {
            2: "Invalid parameter",
            5: "HTML5 player error",
            100: "Video not found (removed or private)",
            101: "Owner does not allow embedding",
            150: "Same as 101 (blocked)",
          };

          setStreamTest((prev) => ({
            ...prev,
            status: "error",
            error: errors[event.data] || `YouTube error: ${event.data}`,
          }));
        },
      },
    });
  }, []);

  // Load YouTube IFrame API and create player
  const loadYouTubeAPI = useCallback((videoId: string) => {
    // If player already exists, just load the new video ID dynamically
    if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
      setStreamTest((prev) => ({ ...prev, status: "loading" }));
      if (initialIsPlayingRef.current) {
        playerRef.current.loadVideoById(videoId);
      } else {
        playerRef.current.cueVideoById(videoId);
      }
      return;
    }

    // Check if YouTube API is already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      createPlayer(videoId);
      return;
    }

    // Set the callback BEFORE loading the script to avoid the race condition
    // where the API calls onYouTubeIframeAPIReady during script execution,
    // before tag.onload fires.
    (window as any).onYouTubeIframeAPIReady = () => {
      createPlayer(videoId);
    };

    // Load YouTube API script
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => {
      setStreamTest((prev) => ({
        ...prev,
        status: "error",
        error: "Failed to load YouTube API. Check your internet connection.",
      }));
    };
    document.body.appendChild(tag);
  }, [createPlayer]);

  // Initialize Socket.IO connection — depends ONLY on roomId (stable connection)
  useEffect(() => {
    if (!roomId) return;

    const serverUrl = getServerUrl();
    const isRelativeApi = serverUrl === '/api';
    const socketUrl = isRelativeApi ? (typeof window !== 'undefined' ? window.location.origin : '') : serverUrl;
    const socketPath = isRelativeApi ? '/api/socket.io' : '/socket.io';

    socketRef.current = io(`${socketUrl}/youtube-sync`, {
      transports: ["websocket"],
      path: socketPath,
      withCredentials: true,
    });

    socketRef.current.on("connect", () => {
      console.log(`🔌 Connected to YouTube Sync. Joining room: ${roomId}`);
      socketRef.current.emit("youtube:join-room", { roomId, videoId: "" });
    });

    // When joining a room that already has state, load that video
    socketRef.current.on("youtube:sync-state", (state: any) => {
      if (state && state.videoId && state.videoId !== videoIdRef.current) {
        console.log(`📥 Received sync-state: ${state.videoId} at ${state.position}s`);
        initialPositionRef.current = state.position;
        initialIsPlayingRef.current = state.isPlaying;
        videoIdRef.current = state.videoId;
        setYoutubeUrl(`https://www.youtube.com/watch?v=${state.videoId}`);
        setStreamTest((prev) => ({
          ...prev,
          videoId: state.videoId,
          status: "loading",
          isPlaying: state.isPlaying,
        }));
        loadYouTubeAPI(state.videoId);
      }
    });

    // When another device loads a new video into the room
    socketRef.current.on("youtube:load-video", (data: any) => {
      if (data && data.videoId && data.videoId !== videoIdRef.current) {
        console.log(`📥 Remote device loaded video: ${data.videoId}`);
        initialPositionRef.current = 0;
        initialIsPlayingRef.current = false;
        videoIdRef.current = data.videoId;
        setYoutubeUrl(`https://www.youtube.com/watch?v=${data.videoId}`);
        setStreamTest((prev) => ({
          ...prev,
          videoId: data.videoId,
          status: "loading",
          isPlaying: false,
        }));
        loadYouTubeAPI(data.videoId);
      }
    });

    socketRef.current.on("youtube:play", (data: any) => {
      if (playerRef.current && data.videoId === videoIdRef.current) {
        playerRef.current.playVideo();
      }
    });

    socketRef.current.on("youtube:pause", () => {
      if (playerRef.current) {
        playerRef.current.pauseVideo();
      }
    });

    socketRef.current.on("youtube:position", (data: any) => {
      if (!playerRef.current) return;

      const delay = (Date.now() - data.timestamp) / 1000;
      const correctedPosition = data.position + delay;
      const currentPosition = playerRef.current.getCurrentTime();

      // Only correct if drift is > 1 second
      if (Math.abs(currentPosition - correctedPosition) > 1.0) {
        console.log(
          `🔄 Drift detected: ${currentPosition.toFixed(1)}s → ${correctedPosition.toFixed(1)}s (${(correctedPosition - currentPosition).toFixed(1)}s offset)`
        );
        playerRef.current.seekTo(correctedPosition);
      }
    });

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      socketRef.current?.disconnect();
    };
  }, [roomId, loadYouTubeAPI]);

  // Extract video ID from YouTube URL
  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Handle YouTube URL submission
  const handleTestStream = async () => {
    const videoId = extractVideoId(youtubeUrl);

    if (!videoId) {
      setStreamTest((prev) => ({
        ...prev,
        status: "error",
        error: "Invalid YouTube URL. Use: youtube.com/watch?v=... or youtu.be/...",
      }));
      return;
    }

    videoIdRef.current = videoId;
    initialIsPlayingRef.current = false;

    setStreamTest((prev) => ({
      ...prev,
      videoId,
      url: youtubeUrl,
      status: "loading",
      error: null,
    }));

    // Broadcast to room so other devices load the video too
    if (socketRef.current?.connected) {
      socketRef.current.emit("youtube:load-video", { videoId, roomId });
    }

    // Load YouTube API
    loadYouTubeAPI(videoId);
  };

  const handlePlay = () => {
    if (playerRef.current) {
      playerRef.current.playVideo();
    }
  };

  const handlePause = () => {
    if (playerRef.current) {
      playerRef.current.pauseVideo();
    }
  };

  const handleSeek = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(playerRef.current.getCurrentTime() + seconds);
    }
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/stream-test?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert("Room link copied: " + link);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen text-foreground relative z-10 flex flex-col pb-20 selection:bg-accent-primary/30">
      {/* Global Ambient Background */}
      <div className="mesh-bg" />

      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 pt-28 md:pt-36">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            🎬 <span className="text-gradient-accent">YouTube Stream Sync</span>
          </h1>
          <p className="text-foreground/60 text-sm md:text-base max-w-2xl">
            Test and experience real-time YouTube video synchronization across multiple devices using custom web socket gateways.
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player */}
          <div className="lg:col-span-2 space-y-6">
            {/* URL Input */}
            <div className="glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-6 shadow-2xl border border-glass-border">
              <label className="block text-sm font-bold text-foreground/80 mb-2">YouTube URL or Video ID</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or just paste video ID"
                  className="flex-1 bg-background/40 border border-glass-border rounded-xl px-4 py-2.5 text-foreground placeholder-foreground/30 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all text-sm"
                  onKeyPress={(e) => e.key === "Enter" && handleTestStream()}
                />
                <button
                  onClick={handleTestStream}
                  className="bg-accent-primary text-white hover:scale-105 active:scale-95 px-6 py-2.5 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)] cursor-pointer text-sm animate-button"
                >
                  Test Stream
                </button>
              </div>
            </div>

            {/* Player Container */}
            <div className="glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-6 shadow-2xl border border-glass-border">
              <div id="youtube-player" className="w-full aspect-video bg-black/40 rounded-2xl mb-4 border border-glass-border overflow-hidden" />

              {/* Status */}
              <div className="mb-4 p-4 bg-background/30 backdrop-blur-md rounded-2xl border border-glass-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black tracking-wide text-foreground/50">STATUS</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                      streamTest.status === "playing"
                        ? "bg-green-500/10 text-green-500 border border-green-500/20"
                        : streamTest.status === "error"
                          ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                          : "bg-background/80 text-foreground/70 border border-glass-border"
                    }`}
                  >
                    {streamTest.status.toUpperCase()}
                  </span>
                </div>

                {streamTest.error && (
                  <div className="text-rose-500 text-sm mt-2 p-3 bg-red-500/5 rounded-xl border border-rose-500/10">
                    ⚠️ {streamTest.error}
                  </div>
                )}

                {streamTest.videoId && (
                  <div className="text-sm text-foreground/80 mt-2 space-y-1">
                    <p>Video ID: <code className="text-accent-primary font-semibold">{streamTest.videoId}</code></p>
                    <p>Position: <span className="font-semibold text-foreground">{formatTime(streamTest.position)}</span> / {formatTime(streamTest.duration)}</p>
                  </div>
                )}
              </div>

              {/* Controls */}
              {streamTest.status !== "idle" && streamTest.status !== "error" && (
                <div className="space-y-4">
                  {/* Playback Controls */}
                  <div className="flex gap-3">
                    <button
                      onClick={handlePlay}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(34,197,94,0.15)] cursor-pointer"
                    >
                      ▶ Play
                    </button>
                    <button
                      onClick={handlePause}
                      className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(244,63,94,0.15)] cursor-pointer"
                    >
                      ⏸ Pause
                    </button>
                  </div>

                  {/* Seek Controls */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSeek(-10)}
                      className="flex-1 bg-background/50 hover:bg-background/80 text-foreground/80 border border-glass-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      ⏪ -10s
                    </button>
                    <button
                      onClick={() => handleSeek(10)}
                      className="flex-1 bg-background/50 hover:bg-background/80 text-foreground/80 border border-glass-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      ⏩ +10s
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Info & Settings */}
          <div className="space-y-6">
            {/* Room Settings */}
            <div className="glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-6 shadow-2xl border border-glass-border">
              <h3 className="text-lg font-bold mb-4 text-foreground">📡 Room Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-foreground/50">Room ID</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={roomId}
                      readOnly
                      className="flex-1 bg-background/40 border border-glass-border rounded-xl px-3 py-2 text-sm font-mono text-accent-primary focus:outline-none"
                    />
                    <button
                      onClick={copyRoomLink}
                      className="bg-accent-primary text-white hover:scale-105 active:scale-95 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Info */}
            <div className="glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-6 shadow-2xl border border-glass-border">
              <h3 className="text-lg font-bold mb-4 text-foreground">🔄 Sync Status</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-foreground/50 text-xs">Current Position</span>
                  <p className="text-accent-primary font-semibold font-mono mt-0.5">
                    {formatTime(streamTest.position)}
                  </p>
                </div>
                <div>
                  <span className="text-foreground/50 text-xs">Sync Interval</span>
                  <p className="text-green-500 font-semibold mt-0.5">Every 3 seconds</p>
                </div>
                <div>
                  <span className="text-foreground/50 text-xs">Drift Threshold</span>
                  <p className="text-amber-500 font-semibold mt-0.5">±1 second</p>
                </div>
                <div className="pt-3 border-t border-glass-border">
                  <p className="text-foreground/50 text-xs leading-relaxed">
                    ℹ️ When multiple devices are in the same room, they will sync position automatically if drift exceeds the 1s threshold.
                  </p>
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-6 shadow-2xl border border-glass-border">
              <h3 className="text-lg font-bold mb-4 text-foreground">📊 Test Results</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/60">Stream Loads</span>
                  <span className={streamTest.status !== "error" ? "text-green-500 font-semibold" : "text-rose-500 font-semibold"}>
                    {streamTest.status !== "error" ? "✅ Yes" : "❌ No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Position Accessible</span>
                  <span className="text-amber-500 font-semibold">⚠️ Limited</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Seek Precision</span>
                  <span className="text-amber-500 font-semibold">⚠️ ~500ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Sync Reliability</span>
                  <span className="text-amber-500 font-semibold">⚠️ Moderate</span>
                </div>
                <div className="pt-3 border-t border-glass-border">
                  <p className="text-foreground/50 text-xs leading-relaxed">
                    YouTube sync works but has noticeable latency. For perfect sync, we recommend using local audio files instead.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation */}
        <div className="mt-12 glass-panel bg-background/50 backdrop-blur-3xl rounded-3xl p-8 border border-glass-border shadow-2xl">
          <h2 className="text-2xl font-extrabold mb-4 text-foreground">📖 What This Demo Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            <div>
              <h3 className="font-bold text-green-500 mb-3">✅ What Works</h3>
              <ul className="list-disc list-inside space-y-2 text-foreground/80">
                <li>Loading YouTube videos in iframe dynamically</li>
                <li>Synchronizing Play/Pause events across all devices</li>
                <li>Seeking backward/forward and auto-syncing</li>
                <li>Real-time socket-based position synchronization</li>
                <li>Drift check and alignment protocols</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-amber-500 mb-3">⚠️ Limitations</h3>
              <ul className="list-disc list-inside space-y-2 text-foreground/80">
                <li>YouTube&apos;s API position reporting has minor lag</li>
                <li>Different mobile devices may have different video load speeds</li>
                <li>Network latency can introduce minor sync offsets</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-8 bg-accent-primary/5 border border-accent-primary/20 rounded-3xl p-6">
          <h3 className="font-bold text-accent-primary mb-2">💡 Recommendation</h3>
          <p className="text-foreground/80 text-sm leading-relaxed">
            YouTube sync is supported but contains inherent player-level latencies. For production rooms and the ultimate lag-free synchronized experience, use <strong>local audio uploads</strong> or our <strong>Unsplash Music</strong> libraries.
          </p>
        </div>
      </main>
    </div>
  );
}
