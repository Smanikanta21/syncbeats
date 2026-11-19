"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Headphones,
  Laptop,
  Music2,
  Pause,
  Play,
  Smartphone,
  Tablet,
  Volume2,
  VolumeX,
} from "lucide-react";

const tracks = [
  {
    title: "A little closer",
    mood: "Slow evenings",
    art: "closer",
    src: "/audio/demo-closer.mp3",
  },
  {
    title: "First light",
    mood: "A fresh start",
    art: "daylight",
    src: "/audio/demo-daylight.mp3",
  },
  {
    title: "After hours",
    mood: "Find your focus",
    art: "afterhours",
    src: "/audio/demo-afterhours.mp3",
  },
];
const devices = [
  { name: "Your laptop", icon: Laptop },
  { name: "A friend’s phone", icon: Smartphone },
  { name: "Another tablet", icon: Tablet },
];
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function LiveRoomShowcase() {
  const audio = useRef<HTMLAudioElement>(null);
  const playRequest = useRef(0);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(16);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const track = tracks[selected];

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.volume = 0.35;
    // A demo must not keep playing when its tab is put away.
    const onVisibility = () => {
      if (document.hidden) {
        playRequest.current += 1;
        player.pause();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      playRequest.current += 1;
      player.pause();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function play() {
    const request = ++playRequest.current;
    setError("");
    try {
      if (audio.current?.error) audio.current.load();
      await audio.current?.play();
    } catch {
      if (request === playRequest.current)
        setError(
          "The sample couldn’t play. Check your connection and try again.",
        );
    }
  }

  function togglePlay() {
    if (!audio.current) return;
    if (audio.current.paused) void play();
    else {
      playRequest.current += 1;
      audio.current.pause();
    }
  }

  function chooseTrack(index: number) {
    const player = audio.current;
    if (!player || index === selected) return;
    const resume = !player.paused;
    playRequest.current += 1;
    player.pause();
    // Set the source inside the gesture so Safari can preserve play permission.
    player.src = tracks[index].src;
    setSelected(index);
    setElapsed(0);
    setReady(false);
    setError("");
    if (resume) void play();
  }

  return (
    <div
      id="room-demo"
      className="landing-room-scene"
      role="region"
      aria-label="Interactive listening demo"
    >
      <audio
        ref={audio}
        src={tracks[0].src}
        preload="none"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setElapsed(audio.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const value = audio.current?.duration;
          if (value && Number.isFinite(value)) setDuration(value);
          setReady(true);
        }}
        onError={() => {
          setPlaying(false);
          setReady(false);
          setError(
            "The sample couldn’t load. Check your connection and try again.",
          );
        }}
      />
      <div className="landing-room-halo" aria-hidden="true" />
      <div className="landing-room-card landing-demo-card">
        <div className="landing-room-topbar">
          <span className="landing-room-mark">
            <Headphones size={17} aria-hidden="true" /> Try a listening room
          </span>
          <span className="landing-preview-label">INTERACTIVE DEMO</span>
        </div>
        <div className="landing-demo-intro">
          <h2>One queue. Everyone together.</h2>
          <p>Play a sample, switch tracks, or skip ahead.</p>
        </div>
        <div
          className={`landing-track-art landing-demo-art ${track.art}`}
          aria-hidden="true"
        >
          <div className="landing-art-orb landing-art-orb-one" />
          <div className="landing-art-orb landing-art-orb-two" />
          <div className="landing-art-orb landing-art-orb-three" />
          <div className="landing-demo-art-title">{track.title}</div>
          <span className="landing-art-caption">
            SYNCBEATS SESSIONS / 0{selected + 1}
          </span>
          <div className="landing-art-disc">
            <Music2 size={24} />
          </div>
        </div>
        <div className="landing-player-meta">
          <div>
            <h3>{track.title}</h3>
            <p>{track.mood} · Original sample loop</p>
          </div>
          <div className="landing-demo-controls">
            <button
              type="button"
              className="landing-demo-mute"
              aria-label={muted ? "Unmute demo" : "Mute demo"}
              aria-pressed={muted}
              onClick={() => {
                if (audio.current) audio.current.muted = !muted;
                setMuted(!muted);
              }}
            >
              {muted ? (
                <VolumeX size={17} aria-hidden="true" />
              ) : (
                <Volume2 size={17} aria-hidden="true" />
              )}
            </button>
            <button
              id="landing-demo-play"
              type="button"
              className="landing-play-button"
              aria-label={playing ? "Pause demo" : "Play demo"}
              aria-pressed={playing}
              onClick={togglePlay}
            >
              {playing ? (
                <Pause size={19} fill="currentColor" aria-hidden="true" />
              ) : (
                <Play size={19} fill="currentColor" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <input
          type="range"
          className="landing-demo-seek"
          aria-label="Seek demo track"
          aria-valuetext={`${time(elapsed)} of ${time(duration)}`}
          min={0}
          max={duration}
          step={0.1}
          value={elapsed}
          disabled={!ready}
          title={
            ready
              ? "Skip to a moment in the sample"
              : "Play a sample to enable seeking"
          }
          style={
            {
              "--demo-progress": `${(elapsed / duration) * 100}%`,
            } as CSSProperties
          }
          onChange={(event) => {
            const value = Number(event.target.value);
            if (audio.current?.readyState) {
              audio.current.currentTime = value;
              setElapsed(value);
            }
          }}
        />
        <div className="landing-time">
          <span>{time(elapsed)}</span>
          <span>{time(duration)}</span>
        </div>
        {error && (
          <p className="landing-demo-error" role="alert">
            {error}
          </p>
        )}
        <div
          className="landing-demo-queue"
          role="group"
          aria-label="Choose a sample track"
        >
          {tracks.map((item, index) => (
            <button
              type="button"
              key={item.src}
              aria-pressed={selected === index}
              onClick={() => chooseTrack(index)}
            >
              <span className="landing-demo-track-number">0{index + 1}</span>
              <span>{item.title}</span>
              {selected === index && (
                <span className="landing-demo-selected" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <div className="landing-connected-title">
          <span>3 DEMO DEVICES</span>
          <span className="landing-sync-status" aria-live="polite">
            {playing ? "One timeline. All together." : "Press play to try it"}
          </span>
        </div>
        <div className="landing-demo-devices">
          {devices.map(({ name, icon: Icon }) => (
            <div className="landing-demo-device" key={name}>
              <Icon size={19} aria-hidden="true" />
              <span>{name}</span>
              <strong>{time(elapsed)}</strong>
              <span
                className={`landing-equalizer ${playing ? "is-playing" : ""}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          ))}
        </div>
        <div className="landing-room-bottom">
          <span>Simulated devices. Audio plays here.</span>
          <Link href="/room/default">
            Open a real room <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
