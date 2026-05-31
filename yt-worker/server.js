/**
 * SyncBeats YT Worker — Residential YouTube Download Microservice
 *
 * Runs on a local machine (hostel Wi-Fi / residential IP) and is exposed
 * to the EC2 server via a Cloudflare Tunnel.  YouTube treats residential
 * IPs as normal users, so yt-dlp downloads succeed without bot blocks.
 *
 * Endpoints:
 *   GET  /health              — liveness probe
 *   POST /download            — { videoId, title } → streams MP3 binary
 */

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '8787', 10);
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const DOWNLOADS_DIR = path.join(os.tmpdir(), 'syncbeats-yt-worker');

// Ensure temp download directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ── Auth middleware (optional shared secret) ────────────────────────────
function authGuard(req, res, next) {
  if (!WORKER_SECRET) return next(); // No secret configured → open access
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (token !== WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── GET /health ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), hostname: os.hostname() });
});

// ── POST /download ──────────────────────────────────────────────────────
app.post('/download', authGuard, async (req, res) => {
  const { videoId, title } = req.body || {};

  if (!videoId || !title) {
    return res.status(400).json({ error: 'videoId and title are required' });
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid YouTube videoId' });
  }

  const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const filenameBase = `${Date.now()}_yt_${safeTitle}`;
  const outputTemplate = path.join(DOWNLOADS_DIR, `${filenameBase}.%(ext)s`);
  const expectedFile = path.join(DOWNLOADS_DIR, `${filenameBase}.mp3`);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[Worker] Downloading ${videoId} — "${title}"`);

  try {
    // Detect yt-dlp binary: prefer local ./bin/yt-dlp, then system PATH
    const localBin = path.resolve(__dirname, 'bin', 'yt-dlp');
    const ytdlpBin = fs.existsSync(localBin) ? localBin : 'yt-dlp';

    const args = [
      '-f', 'bestaudio',
      '-x',
      '--audio-format', 'mp3',
      '--no-playlist',
      '--no-progress',
      '-o', outputTemplate,
    ];

    // Use cookies.txt if present (extra insurance)
    const cookiesPath = path.resolve(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath);
    }

    args.push(videoUrl);

    await execFileAsync(ytdlpBin, args, { timeout: 120_000 }); // 2 min timeout

    if (!fs.existsSync(expectedFile)) {
      throw new Error('Downloaded file not found after yt-dlp completed');
    }

    const stat = fs.statSync(expectedFile);
    console.log(`[Worker] Done — ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

    // Stream the file back and clean up afterwards
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.mp3"`);

    const stream = fs.createReadStream(expectedFile);
    stream.pipe(res);
    stream.on('end', () => cleanup(expectedFile));
    stream.on('error', () => cleanup(expectedFile));

  } catch (err) {
    cleanup(expectedFile);
    const msg = err.stderr || err.message || String(err);
    console.error(`[Worker] Failed:`, msg);
    res.status(500).json({ error: 'Download failed', detail: msg.slice(0, 500) });
  }
});

function cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch { /* ignore */ }
}

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SyncBeats YT Worker] Listening on port ${PORT}`);
  console.log(`[SyncBeats YT Worker] Downloads dir: ${DOWNLOADS_DIR}`);
  if (WORKER_SECRET) {
    console.log(`[SyncBeats YT Worker] Auth enabled (WORKER_SECRET set)`);
  } else {
    console.log(`[SyncBeats YT Worker] Auth disabled (no WORKER_SECRET)`);
  }
});
