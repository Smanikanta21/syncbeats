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
  instrumental?: boolean; // no vocals here — render dots, not text
}

/* ─── LRC Parser ─────────────────────────────────────────────────────────── */
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  
  // 1. Parse global offset (in milliseconds, can be positive or negative)
  const offsetMatch = lrc.match(/\[offset:([+-]?\d+)\]/i);
  const globalOffset = offsetMatch ? parseInt(offsetMatch[1]) / 1000 : 0;

  // 2. Parse timestamps and text. Blank timed lines (e.g. "[01:26.07] ") are how
  // LRC files mark the end of a vocal section — keep them as instrumental markers
  // instead of discarding them, or the previous line stays lit through the break.
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lrc)) !== null) {
    const m = parseInt(match[1]);
    const s = parseInt(match[2]);
    const ms = parseInt(match[3].padEnd(3, "0"));
    const text = match[4].trim();
    let time = (m * 60 + s + ms / 1000) - globalOffset;
    if (time < 0) time = 0;
    lines.push({ time, text, endTime: 0, words: [], instrumental: !text });
  }

  lines.sort((a, b) => a.time - b.time);
  if (!lines.length) return [];

  // Cover the intro: most files have no marker at 0, so t=0 would light up line 1.
  if (lines[0].time > 1 && !lines[0].instrumental) {
    lines.unshift({ time: 0, text: "", endTime: 0, words: [], instrumental: true });
  }

  // 3. Fallback for files with no explicit markers: guess where vocals end from
  // text length and insert a synthetic gap.
  const finalLines: LyricLine[] = [];
  const GAP_THRESHOLD = 2.5; // seconds

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    finalLines.push(line);

    const nextLine = lines[i + 1];
    // An explicit marker already covers this gap — don't second-guess it.
    if (!nextLine || line.instrumental || nextLine.instrumental) continue;

    // Estimate active singing duration based on text length (~8 chars per second), cap at gap size
    const textLen = line.text.replace(/\s/g, "").length;
    const estimatedVocalTime = Math.max(1.0, textLen * 0.12);
    const activeDuration = Math.min(nextLine.time - line.time, estimatedVocalTime);
    const endOfVocal = line.time + activeDuration;

    if (nextLine.time - endOfVocal > GAP_THRESHOLD) {
      finalLines.push({
        time: endOfVocal + 0.5,
        endTime: 0,
        text: "",
        words: [],
        instrumental: true,
      });
    }
  }

  // 4. Second pass: calculate word timings for all lines
  for (let i = 0; i < finalLines.length; i++) {
    const line = finalLines[i];
    line.endTime = i < finalLines.length - 1 ? finalLines[i + 1].time : line.time + 5;
    if (line.instrumental) continue;

    // Check for Enhanced LRC tags e.g. <00:12.34> word
    const wordMatches = Array.from(line.text.matchAll(/<(\d{2}):(\d{2})\.(\d{2,3})>([^<]+)/g));
    
    if (wordMatches.length > 0) {
      line.words = wordMatches.map((wm) => {
        const wm_m = parseInt(wm[1]);
        const wm_s = parseInt(wm[2]);
        const wm_ms = parseInt(wm[3].padEnd(3, "0"));
        let start = (wm_m * 60 + wm_s + wm_ms / 1000) - globalOffset;
        if (start < 0) start = 0;
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
      const estimatedVocalTime = Math.max(1.0, totalChars * 0.12);
      const activeDuration = Math.min(duration, estimatedVocalTime); 
      
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

  return finalLines;
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
async function fetchLyrics(
  rawTitle: string,
  rawArtist?: string | null,
  duration?: number
): Promise<LyricLine[] | null> {
  const { title, artist } = cleanForSearch(rawTitle, rawArtist);

  // Build a generic query for the 'q=' endpoint which searches all fields (artist, track, album)
  // This is much more robust for messy YouTube titles.
  const query = artist ? `${artist} ${title}` : title;
  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: { "Lrclib-Client": "SyncBeats/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data) || !data.length) return null;

    const synced = data.filter((d: any) => d.syncedLyrics);
    // Prefer the result whose length matches ours. Search is relevance-sorted, so
    // the top hit is often a remix/live/sped-up cut whose timings are seconds off.
    const best =
      (duration
        ? synced.find((d: any) => Math.abs((d.duration ?? 0) - duration) <= 2)
        : null) ?? synced[0];
    if (!best?.syncedLyrics) return null;

    return parseLrc(best.syncedLyrics);
  } catch (error) {
    console.error("fetchLyrics error:", error);
    return null;
  }
}

/* ─── SyncedLyrics Component ─────────────────────────────────────────────── */
interface SyncedLyricsProps {
  title: string | null;
  artist?: string | null;
  currentTime?: number;     // seconds
  duration?: number;        // seconds — used to match the right lyrics version
  dataRef?: React.MutableRefObject<{ rawAudioData: Uint8Array | null; isPlaying: boolean } | any>;
  onSeek?: (secs: number) => void;
}

export function SyncedLyrics({ title, artist, currentTime = 0, duration, dataRef, onSeek }: SyncedLyricsProps) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "no-lyrics">("idle");
  const [activeIdx, setActiveIdx] = useState(0);
  const prevKeyRef = useRef("");
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const lastIdxRef = useRef(-1);

  /* ── Browsing mode ───────────────────────────────────────────────────────
     Scrolling by hand means you want to read, not watch: every line unblurs
     and auto-follow backs off until you stop. Keyed off wheel/touch (user
     intent) rather than the scroll event, which our own scrollIntoView fires
     too — no need to disambiguate the two. */
  const [browsing, setBrowsing] = useState(false);
  const browseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nudgeBrowse = useCallback(() => {
    setBrowsing(true);
    if (browseTimer.current) clearTimeout(browseTimer.current);
    browseTimer.current = setTimeout(() => setBrowsing(false), 3000);
  }, []);

  // Tapping a line seeks to it and hands control straight back to auto-follow.
  const seekToLine = useCallback((t: number) => {
    if (browseTimer.current) clearTimeout(browseTimer.current);
    setBrowsing(false);
    onSeek?.(t);
  }, [onSeek]);

  useEffect(() => () => { if (browseTimer.current) clearTimeout(browseTimer.current); }, []);

  /* ── Fetch lyrics when track changes ─────────────────────────────────── */
  useEffect(() => {
    if (!title) return;
    const key = `${title}::${artist ?? ""}`;
    if (key === prevKeyRef.current) return;

    setStatus("loading");
    // Wait for the decoder to report duration — we need it to pick the lyrics
    // version that actually matches this cut. The effect re-runs when it lands.
    if (!duration) return;
    prevKeyRef.current = key;

    setLines([]);
    setActiveIdx(0);
    lastIdxRef.current = -1;

    fetchLyrics(title, artist, duration)
      .then(result => {
        if (result && result.length > 0) {
          setLines(result);
          setStatus("idle");
        } else {
          setStatus("no-lyrics");
        }
      })
      .catch(() => setStatus("error"));
  }, [title, artist, duration]);

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
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lines]);

  // Scroll after render, not inside the rAF tick: an instrumental line's dots
  // only mount once it's active, so its ref doesn't exist yet at tick time.
  // Skipped while browsing; re-centres the moment browsing ends.
  useEffect(() => {
    if (browsing) return;
    lineRefs.current[activeIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, browsing]);

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
        <InstrumentalDots className="scale-150" />
        <p className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-50">
          {status === "error" ? "Couldn't load lyrics" : "Instrumental"}
        </p>
      </div>
    );
  }

  /* ── Lyrics view ─────────────────────────────────────────────────────── */
  return (
    <div className="relative h-full overflow-hidden">
      <div
        className="h-full overflow-y-auto scrollbar-hide px-6 py-12 space-y-6"
        onWheel={nudgeBrowse}
        onTouchMove={nudgeBrowse}
        style={{
          scrollbarWidth: "none",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)"
        }}
      >
        {lines.map((line, i) => {
          const isActive = i === activeIdx;
          const isPast = i < activeIdx;
          const distance = Math.abs(i - activeIdx);
          const isFarAway = distance > 4;

          // No vocals here — show the dots only while this break is active (Apple
          // Music behaviour), and take up no space otherwise so the surrounding
          // lyrics don't get pushed apart by every instrumental marker.
          if (line.instrumental) {
            if (!isActive) return null;
            return (
              <div key={i} ref={el => { lineRefs.current[i] = el; }}>
                <div className="h-9 flex items-center">
                  <InstrumentalDots />
                </div>
              </div>
            );
          }

          return (
            <button
              key={i}
              type="button"
              ref={el => { lineRefs.current[i] = el; }}
              onClick={() => seekToLine(line.time)}
              aria-label={`Play from "${line.text}"`}
              className={cn("block w-full text-left", onSeek && "cursor-pointer")}
            >
              <motion.div
                animate={{
                  opacity: browsing
                    ? 1
                    : isActive ? 1 : isPast ? Math.max(0.1, 0.35 - distance * 0.05) : Math.max(0.1, 0.45 - distance * 0.05),
                  scale: isActive ? 1.35 : isFarAway ? 0.85 : 0.95,
                  filter: isActive || browsing ? "blur(0px)" : "blur(3px)",
                }}
                whileHover={{ opacity: 1, filter: "blur(0px)" }}
                style={{ transformOrigin: "left center" }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className={cn(
                  "text-foreground text-xl md:text-2xl font-black leading-snug text-left transition-none select-none tracking-tight max-w-[72%]",
                )}
              >
                {isActive ? (
                  <ActiveLine line={line} timeRef={timeRef} dataRef={dataRef} />
                ) : (
                  <span className={browsing ? "text-foreground/75" : "text-foreground/40"}>{line.text}</span>
                )}
              </motion.div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Instrumental Dots ──────────────────────────────────────────────────────
   Shown for stretches of a song with no vocals. Real circles, not "." glyphs
   scaled on one axis — stretching type smears it, which is what made the old
   version look broken. The pulse itself lives in globals.css (.lyric-dot) so
   the lyrics panel and the landing-page preview stay identical, and the
   reduced-motion block covers both for free. */
function InstrumentalDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 pointer-events-none", className)} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="lyric-dot w-2 h-2 rounded-full bg-foreground"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
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
             
             el.style.backgroundImage = `linear-gradient(90deg, var(--foreground) ${pct}%, color-mix(in srgb, var(--foreground) 30%, transparent) ${pct}%)`;
             el.style.backgroundClip = "text";
             el.style.webkitBackgroundClip = "text";
             el.style.color = "transparent";
             el.style.transform = "scale(1.05)";
             el.style.textShadow = "0 0 16px color-mix(in srgb, var(--foreground) 20%, transparent)";
          } else {
             // Past word
             el.style.backgroundImage = `linear-gradient(90deg, var(--foreground) 100%, color-mix(in srgb, var(--foreground) 30%, transparent) 100%)`;
             el.style.backgroundClip = "text";
             el.style.webkitBackgroundClip = "text";
             el.style.color = "transparent";
             el.style.transform = "scale(1)";
             el.style.textShadow = "none";
          }
        } else {
          // Future word
          el.style.backgroundImage = `linear-gradient(90deg, var(--foreground) 0%, color-mix(in srgb, var(--foreground) 30%, transparent) 0%)`;
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
