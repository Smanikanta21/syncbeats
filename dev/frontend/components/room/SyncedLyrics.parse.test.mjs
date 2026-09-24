// Self-check for parseLrc's instrumental detection.
//   node components/room/SyncedLyrics.parse.test.mjs
// Extracts parseLrc from the .tsx by stripping its TS annotations — keeps the
// test honest (no copy of the logic) without pulling in a build step.
import assert from "node:assert";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./SyncedLyrics.tsx", import.meta.url), "utf8");
const body = src.slice(
  src.indexOf("function parseLrc"),
  src.indexOf("/* ─── Track Title Cleaner")
);
const parseLrc = new Function(
  `${body
    .replace(/:\s*LyricLine\[\]/g, "")
    .replace(/:\s*RegExpExecArray \| null/g, "")
    .replace(/\(lrc: string\)/, "(lrc)")}\nreturn parseLrc;`
)();

const at = (lines, t) => {
  for (let i = lines.length - 1; i >= 0; i--) if (t >= lines[i].time) return lines[i];
  return null;
};

// Real LRCLIB shape: late first line, blank lines marking instrumental breaks.
const lines = parseLrc(
  [
    "[00:34.89] Look at the stars",
    "[00:37.55] Look how they shine for you",
    "[01:26.07] ",
    "[01:30.56] Your skin, oh yeah",
  ].join("\n")
);

// The 35s intro must not light up line 1 (the bug being fixed).
assert.equal(at(lines, 0).instrumental, true, "intro should be instrumental");
assert.equal(at(lines, 30).instrumental, true, "intro should be instrumental");
assert.equal(at(lines, 35).text, "Look at the stars");
// Blank timed line is kept, so the break is silent instead of holding line 2 lit.
assert.equal(at(lines, 88).instrumental, true, "blank line marks the break");
assert.equal(at(lines, 131).text, "Your skin, oh yeah");
// Instrumental lines carry no karaoke words.
assert.ok(lines.filter(l => l.instrumental).every(l => l.words.length === 0));

// No explicit markers: the char-count heuristic still fills long gaps.
const heuristic = parseLrc(["[00:00.00] one", "[00:20.00] two"].join("\n"));
assert.equal(heuristic.length, 3, "synthetic gap inserted");
assert.equal(at(heuristic, 15).instrumental, true);
assert.equal(at(heuristic, 0).text, "one");

// [offset:] shifts timings; an offset that pushes past 0 clamps, not crashes.
assert.equal(parseLrc("[offset:+500]\n[00:10.00] x")[1].time, 9.5);
assert.deepEqual(parseLrc(""), []);

console.log("parseLrc: all checks passed");
