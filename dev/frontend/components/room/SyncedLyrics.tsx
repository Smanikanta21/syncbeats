"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";

/* ─── LRC Types ─────────────────────────────────────────────────────────── */
interface LyricWord {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

interface LyricLine {
  time: number;  // seconds
  endTime: number;
  text: string;
  words: LyricWord[];
}

/* ─── LRC Parser ─────────────────────────────────────────────────────────── */
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lrc)) !== null) {
    const m = parseInt(match[1]);
    const s = parseInt(match[2]);
    const ms = parseInt(match[3].padEnd(3, "0"));
    const text = match[4].trim();
    if (text) {
      lines.push({ time: m * 60 + s + ms / 1000, text, endTime: 0, words: [] });
    }
  }
  
  lines.sort((a, b) => a.time - b.time);

  // Second pass: calculate word timings (Enhanced LRC or heuristic)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.endTime = i < lines.length - 1 ? lines[i + 1].time : line.time + 5;
    
    // Check for Enhanced LRC tags e.g. <00:12.34> word
    const wordMatches = Array.from(line.text.matchAll(/<(\d{2}):(\d{2})\.(\d{2,3})>([^<]+)/g));
    
    if (wordMatches.length > 0) {
      line.words = wordMatches.map((wm) => {
        const wm_m = parseInt(wm[1]);
        const wm_s = parseInt(wm[2]);
        const wm_ms = parseInt(wm[3].padEnd(3, "0"));
        const start = wm_m * 60 + wm_s + wm_ms / 1000;
        const text = wm[4].trim();
        return { text, start, end: 0 };
      });
      for (let j = 0; j < line.words.length; j++) {
        line.words[j].end = j < line.words.length - 1 ? line.words[j + 1].start : line.endTime;
      }
      line.text = line.text.replace(/<\d{2}:\d{2}\.\d{2,3}>/g, "").trim();
    } else {
      // Heuristic line-to-word distribution
      const rawWords = line.text.split(" ");
      const totalChars = line.text.replace(/\s/g, "").length;
      let currentTimeAcc = line.time;
      const duration = line.endTime - line.time;
      const activeDuration = Math.min(duration, 5); 
      
      line.words = rawWords.map((word) => {
        const wordChars = word.length;
        const wordDuration = (wordChars / totalChars) * activeDuration;
        const start = currentTimeAcc;
        const end = start + wordDuration;
        currentTimeAcc = end;
        return { text: word, start, end };
      });
    }
  }

  return lines;
}

/* ─── Track Title Cleaner ────────────────────────────────────────────────── */
function cleanForSearch(rawTitle: string, providedArtist?: string | null): { title: string; artist: string } {
  let cleaned = rawTitle;
  
  // Remove timestamps or ID prefixes/suffixes
  cleaned = cleaned.replace(/^\d+[_-\s]*/, '');
  cleaned = cleaned.replace(/\.[^.]+$/, '');
  cleaned = cleaned.replace(/_/g, ' ');

  // Remove common YouTube fluff
  cleaned = cleaned.replace(/\[.*?\]/g, ' ');
  cleaned = cleaned.replace(/\(.*?\)/g, ' ');
  cleaned = cleaned.replace(/official( music)? video/gi, '');
  cleaned = cleaned.replace(/official audio/gi, '');
  cleaned = cleaned.replace(/lyric video/gi, '');
  cleaned = cleaned.replace(/lyrics/gi, '');
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If we already have a dedicated artist, just return the cleaned title
  if (providedArtist && providedArtist.trim().length > 0) {
    return { title: cleaned, artist: providedArtist.trim() };
  }

  // Try to split "Artist - Title" or "Artist: Title"
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  if (cleaned.includes(' : ')) {
    const parts = cleaned.split(' : ');
    return { artist: parts[0].trim(), title: parts.slice(1).join(' : ').trim() };
  }
  if (cleaned.includes('-')) {
    // some tracks have "Artist-Title"
    const parts = cleaned.split('-');
    return { artist: parts[0].trim(), title: parts.slice(1).join('-').trim() };
  }

  return { title: cleaned, artist: "" };
}

/* ─── LrcLib fetcher ─────────────────────────────────────────────────────── */
async function fetchLyrics(rawTitle: string, rawArtist?: string | null): Promise<LyricLine[] | null> {
  const { title, artist } = cleanForSearch(rawTitle, rawArtist);
  
  // Build query prioritizing track_name and artist_name if we successfully split them, 
  // otherwise fallback to a generic 'q=' search.
  let url = `https://lrclib.net/api/search?`;
  if (artist) {
    url += `track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
  } else {
    url += `track_name=${encodeURIComponent(title)}`;
  }

  const res = await fetch(url, {
    headers: { "Lrclib-Client": "SyncBeats/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data) || !data.length) return null;

  // 1. Try to find an exact title match with synced lyrics
  const cleanSearchTitle = title.toLowerCase();
  let best = data.find((d: any) => 
    d.syncedLyrics && d.trackName && d.trackName.toLowerCase() === cleanSearchTitle
  );

  // 2. Fallback to fuzzy match (track name contains our search title)
  if (!best) {
    best = data.find((d: any) => 
      d.syncedLyrics && d.trackName && d.trackName.toLowerCase().includes(cleanSearchTitle)
    );
  }

  // 3. Last resort: just grab the first one with synced lyrics
  if (!best) {
    best = data.find((d: any) => d.syncedLyrics) ?? data[0];
  }

  if (!best?.syncedLyrics) return null;
  return parseLrc(best.syncedLyrics);
}

/* ─── SyncedLyrics Component ─────────────────────────────────────────────── */
interface SyncedLyricsProps {
  title: string | null;
  artist?: string | null;
  currentTime?: number;     // seconds
  dataRef?: React.MutableRefObject<{ rawAudioData: Uint8Array | null; isPlaying: boolean } | any>;
}

export function SyncedLyrics({ title, artist, currentTime = 0, dataRef }: SyncedLyricsProps) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "no-lyrics">("idle");
  const [activeIdx, setActiveIdx] = useState(0);
  const prevKeyRef = useRef("");
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const lastIdxRef = useRef(-1);

  /* ── Fetch lyrics when track changes ─────────────────────────────────── */
  useEffect(() => {
    if (!title) return;
    const key = `${title}::${artist ?? ""}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    setStatus("loading");
    setLines([]);
    setActiveIdx(0);
    lastIdxRef.current = -1;

    fetchLyrics(title, artist)
      .then(result => {
        if (result && result.length > 0) {
          setLines(result);
          setStatus("idle");
        } else {
          setStatus("no-lyrics");
        }
      })
      .catch(() => setStatus("error"));
  }, [title, artist]);

  /* ── rAF-driven active line tracker (device-native FPS) ─────────────── */
  const timeRef = useRef(currentTime);
  useEffect(() => { timeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    if (lines.length === 0) return;

    const tick = () => {
      const t = timeRef.current;
      let idx = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (t >= lines[i].time) { idx = i; break; }
      }

      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        setActiveIdx(idx);
        // Scroll active line into center
        const el = lineRefs.current[idx];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lines]);

  /* ── Status screens ──────────────────────────────────────────────────── */
  if (!title) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-foreground/30">
        <Music2 className="w-7 h-7" />
        <p className="text-xs font-semibold tracking-wide">Nothing playing</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-foreground/30">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-xs font-semibold tracking-wide">Fetching lyrics…</p>
      </div>
    );
  }

  if (status === "no-lyrics" || status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-foreground/50">
        <InstrumentalDots dataRef={dataRef} />
        <p className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-50">
          {status === "error" ? "Couldn't load lyrics" : "Instrumental"}
        </p>
      </div>
    );
  }

  /* ── Lyrics view ─────────────────────────────────────────────────────── */
  return (
    <div className="relative h-full overflow-hidden">
      {/* Top / bottom gradient fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 z-10 bg-linear-to-b from-background/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 z-10 bg-linear-to-t from-background/60 to-transparent" />

      <div
        className="h-full overflow-y-auto scrollbar-hide px-6 py-12 space-y-6"
        style={{ scrollbarWidth: "none" }}
      >
        {lines.map((line, i) => {
          const isActive = i === activeIdx;
          const isPast = i < activeIdx;
          const distance = Math.abs(i - activeIdx);
          const isFarAway = distance > 4;

          return (
            <div
              key={i}
              ref={el => { lineRefs.current[i] = el; }}
            >
              <motion.div
                animate={{
                  opacity: isActive ? 1 : isPast ? Math.max(0.1, 0.35 - distance * 0.05) : Math.max(0.1, 0.45 - distance * 0.05),
                  scale: isActive ? 1.35 : isFarAway ? 0.85 : 0.95,
                  filter: isActive ? "blur(0px)" : "blur(3px)",
                }}
                style={{ transformOrigin: "left center" }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className={cn(
                  "text-xl md:text-2xl font-black leading-snug text-left transition-none cursor-default select-none tracking-tight",
                )}
              >
                {isActive ? (
                  <ActiveLine line={line} timeRef={timeRef} dataRef={dataRef} />
                ) : (
                  <span style={{ color: "rgb(150,150,150)" }}>{line.text}</span>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Instrumental Dots Visualizer ───────────────────────────────────────── */
function InstrumentalDots({ dataRef }: { dataRef?: React.MutableRefObject<{ rawAudioData: Uint8Array | null } | any> }) {
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  
  useEffect(() => {
    let rafId: number;
    const sm = new Float32Array(7).fill(0);

    const draw = () => {
      const data = dataRef?.current?.rawAudioData;
      if (data) {
        // Map 7 dots to lower/mid frequencies
        const step = Math.floor((data.length * 0.4) / 7); 
        for (let i = 0; i < 7; i++) {
          const el = dotsRef.current[i];
          if (!el) continue;
          
          const val = data[i * step + 4] / 255;
          // Smooth the animation slightly
          const target = Math.pow(val, 2) * 5; // scaleY up to 6x
          sm[i] += (target - sm[i]) * 0.25;
          
          const scale = 1 + sm[i];
          const opacity = 0.3 + val * 0.7;
          
          el.style.transform = `scaleY(${scale})`;
          el.style.opacity = `${opacity}`;
        }
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [dataRef]);

  return (
    <div className="flex items-center justify-center gap-1.5 h-16 text-foreground/80 text-4xl leading-none font-black tracking-widest pointer-events-none">
      {[...Array(7)].map((_, i) => (
        <span 
          key={i} 
          ref={el => { dotsRef.current[i] = el; }}
          className="inline-block origin-bottom transition-none"
        >
          .
        </span>
      ))}
    </div>
  );
}

/* ─── Word-by-Word Active Line Renderer ──────────────────────────────────── */
function ActiveLine({ 
  line, 
  timeRef, 
  dataRef 
}: { 
  line: LyricLine; 
  timeRef: React.MutableRefObject<number>;
  dataRef?: React.MutableRefObject<{ isPlaying: boolean } | any>;
}) {
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const baseTimeRef = useRef(timeRef.current);
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const now = performance.now();
      
      // If the parent's coarse time changes, reset our interpolation base
      // This prevents drift while allowing sub-frame 120fps smoothness
      if (timeRef.current !== baseTimeRef.current) {
        baseTimeRef.current = timeRef.current;
        lastFrameTimeRef.current = now;
      }
      
      const isPlaying = dataRef?.current?.isPlaying ?? true;
      const delta = (now - lastFrameTimeRef.current) / 1000;
      
      // The exact high-resolution time at 120 FPS
      const t = isPlaying ? baseTimeRef.current + delta : baseTimeRef.current;

      for (let i = 0; i < line.words.length; i++) {
        const el = wordRefs.current[i];
        if (!el) continue;
        const w = line.words[i];
        
        if (t >= w.start) {
          if (t < w.end) {
             // Currently singing
             const duration = w.end - w.start;
             const elapsed = t - w.start;
             // Calculate percentage 0 to 100
             const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
             
             el.style.backgroundImage = `linear-gradient(90deg, #ffffff ${pct}%, rgba(255, 255, 255, 0.3) ${pct}%)`;
             el.style.backgroundClip = "text";
             el.style.webkitBackgroundClip = "text";
             el.style.color = "transparent";
             el.style.transform = "scale(1.05)";
             el.style.textShadow = "0 0 16px rgba(255,255,255,0.2)";
          } else {
             // Past word
             el.style.backgroundImage = `linear-gradient(90deg, #ffffff 100%, rgba(255, 255, 255, 0.3) 100%)`;
             el.style.backgroundClip = "text";
             el.style.webkitBackgroundClip = "text";
             el.style.color = "transparent";
             el.style.transform = "scale(1)";
             el.style.textShadow = "none";
          }
        } else {
          // Future word
          el.style.backgroundImage = `linear-gradient(90deg, #ffffff 0%, rgba(255, 255, 255, 0.3) 0%)`;
          el.style.backgroundClip = "text";
          el.style.webkitBackgroundClip = "text";
          el.style.color = "transparent";
          el.style.transform = "scale(1)";
          el.style.textShadow = "none";
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [line, timeRef]);

  return (
    <>
      {line.words.map((w, i) => (
        <span 
           key={i} 
           ref={el => { wordRefs.current[i] = el; }}
           className="inline-block transition-all duration-75 ease-linear will-change-transform"
           style={{ marginRight: '0.25em' }}
        >
          {w.text}
        </span>
      ))}
    </>
  );
}
