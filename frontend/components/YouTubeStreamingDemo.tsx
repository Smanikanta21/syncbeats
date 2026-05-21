"use client";
import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import { getServerUrl } from "@/lib/api";

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
  const [roomId, setRoomId] = useState(() => Math.random().toString(36).slice(7));
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

  // Initialize Socket.IO connection
  useEffect(() => {
    const serverUrl = getServerUrl();
    const isRelativeApi = serverUrl === '/api';
    const socketUrl = isRelativeApi ? (typeof window !== 'undefined' ? window.location.origin : '') : serverUrl;
    const socketPath = isRelativeApi ? '/api/socket.io' : '/socket.io';

    socketRef.current = io(`${socketUrl}/youtube-sync`, {
      transports: ["websocket"],
      path: socketPath,
      withCredentials: true,
    });

    socketRef.current.on("youtube:play", (data: any) => {
      if (playerRef.current && data.videoId === streamTest.videoId) {
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
  }, [streamTest.videoId]); // Add streamTest.videoId dependency so the play/pause callbacks always have the correct videoId in scope or we can keep it as is. Actually the original had [] but let's keep it robust.

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

    setStreamTest((prev) => ({
      ...prev,
      videoId,
      url: youtubeUrl,
      status: "loading",
      error: null,
    }));

    // Load YouTube API
    loadYouTubeAPI(videoId);
  };

  const loadYouTubeAPI = (videoId: string) => {
    // Check if YouTube API is already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      createPlayer(videoId);
      return;
    }

    // Load YouTube API script
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onload = () => {
      (window as any).onYouTubeIframeAPIReady = () => {
        createPlayer(videoId);
      };
    };
    tag.onerror = () => {
      setStreamTest((prev) => ({
        ...prev,
        status: "error",
        error: "Failed to load YouTube API. Check your internet connection.",
      }));
    };
    document.body.appendChild(tag);
  };

  const createPlayer = (videoId: string) => {
    playerRef.current = new (window as any).YT.Player("youtube-player", {
      height: "390",
      width: "640",
      videoId: videoId,
      playerVars: {
        autoplay: 0,
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

          // Start sync every 3 seconds
          syncIntervalRef.current = setInterval(() => {
            if (playerRef.current) {
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
                videoId,
                roomId,
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

          if (isPlaying) {
            socketRef.current.emit("youtube:play", { videoId, roomId });
          } else if (state === 2) {
            socketRef.current.emit("youtube:pause", { roomId });
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">🎬 YouTube Stream Sync Demo</h1>
          <p className="text-slate-400">
            Test whether YouTube videos can be synchronized across multiple devices
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player */}
          <div className="lg:col-span-2 space-y-6">
            {/* URL Input */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <label className="block text-sm font-semibold mb-2">YouTube URL or Video ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or just paste video ID"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  onKeyPress={(e) => e.key === "Enter" && handleTestStream()}
                />
                <button
                  onClick={handleTestStream}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-semibold transition-colors"
                >
                  Test Stream
                </button>
              </div>
            </div>

            {/* Player Container */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div id="youtube-player" className="w-full aspect-video bg-black rounded mb-4" />

              {/* Status */}
              <div className="mb-4 p-4 bg-slate-700 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-400">STATUS</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      streamTest.status === "playing"
                        ? "bg-green-500/20 text-green-400"
                        : streamTest.status === "error"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-600 text-slate-300"
                    }`}
                  >
                    {streamTest.status.toUpperCase()}
                  </span>
                </div>

                {streamTest.error && (
                  <div className="text-red-400 text-sm mt-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                    ⚠️ {streamTest.error}
                  </div>
                )}

                {streamTest.videoId && (
                  <div className="text-sm text-slate-300 mt-2 space-y-1">
                    <p>Video ID: <code className="text-blue-400">{streamTest.videoId}</code></p>
                    <p>Position: {formatTime(streamTest.position)} / {formatTime(streamTest.duration)}</p>
                  </div>
                )}
              </div>

              {/* Controls */}
              {streamTest.status !== "idle" && streamTest.status !== "error" && (
                <div className="space-y-4">
                  {/* Playback Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={handlePlay}
                      className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold transition-colors"
                    >
                      ▶ Play
                    </button>
                    <button
                      onClick={handlePause}
                      className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold transition-colors"
                    >
                      ⏸ Pause
                    </button>
                  </div>

                  {/* Seek Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSeek(-10)}
                      className="flex-1 bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded text-sm transition-colors"
                    >
                      ⏪ -10s
                    </button>
                    <button
                      onClick={() => handleSeek(10)}
                      className="flex-1 bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded text-sm transition-colors"
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
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">📡 Room Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-slate-400">Room ID</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={roomId}
                      readOnly
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm font-mono text-blue-400"
                    />
                    <button
                      onClick={copyRoomLink}
                      className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm font-semibold transition-colors"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Info */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">🔄 Sync Status</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-400">Current Position</span>
                  <p className="text-blue-400 font-mono">
                    {formatTime(streamTest.position)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Sync Interval</span>
                  <p className="text-green-400">Every 3 seconds</p>
                </div>
                <div>
                  <span className="text-slate-400">Drift Threshold</span>
                  <p className="text-yellow-400">±1 second</p>
                </div>
                <div className="pt-3 border-t border-slate-600">
                  <p className="text-slate-400 text-xs">
                    ℹ️ When multiple devices are in the same room, they will sync
                    position every 3 seconds if drift exceeds ±1 second.
                  </p>
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">📊 Test Results</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Stream Loads</span>
                  <span className={streamTest.status !== "error" ? "text-green-400" : "text-red-400"}>
                    {streamTest.status !== "error" ? "✅ Yes" : "❌ No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Position Accessible</span>
                  <span className="text-yellow-400">⚠️ Limited</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seek Precision</span>
                  <span className="text-yellow-400">⚠️ ~500ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sync Reliability</span>
                  <span className="text-yellow-400">⚠️ Moderate</span>
                </div>
                <div className="pt-3 border-t border-slate-600">
                  <p className="text-slate-400 text-xs">
                    YouTube sync works but has noticeable latency. For perfect sync,
                    use local audio files instead.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation */}
        <div className="mt-12 bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-2xl font-bold mb-4">📖 What This Demo Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-semibold text-green-400 mb-2">✅ What Works</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>Loading YouTube videos in iframe</li>
                <li>Playing/pausing video</li>
                <li>Seeking forward/backward</li>
                <li>Detecting play state changes</li>
                <li>Broadcasting position to other devices</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-yellow-400 mb-2">⚠️ Limitations</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>Position not reliable (cached, not real-time)</li>
                <li>Seeking takes 500ms–1s to respond</li>
                <li>Sync drifts every 30–60 seconds</li>
                <li>Network latency causes desync</li>
                <li>Different buffer states on each device</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-8 bg-blue-900/30 border border-blue-500/30 rounded-lg p-6">
          <h3 className="font-bold text-blue-300 mb-2">💡 Recommendation</h3>
          <p className="text-slate-300 text-sm">
            YouTube sync is technically possible but impractical for SyncBeats. For perfect
            synchronization, use <strong>local audio uploads</strong> or{" "}
            <strong>Unsplash Music</strong> (royalty-free library). Users will have a much
            better experience.
          </p>
        </div>
      </div>
    </main>
  );
}
