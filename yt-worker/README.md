# SyncBeats YT Worker

A lightweight residential YouTube download proxy for SyncBeats.  
Runs on your local machine (residential IP) and is exposed to the EC2 production server via a **Cloudflare Tunnel**.

YouTube blocks downloads from AWS/datacenter IPs but allows residential networks.  
This worker bridges that gap — invisibly to end users.

---

## Prerequisites

- **Node.js 20+**
- **yt-dlp** — `brew install yt-dlp` (macOS) or download from [releases](https://github.com/yt-dlp/yt-dlp/releases)
- **ffmpeg** — `brew install ffmpeg` (macOS) — required by yt-dlp for audio conversion
- **cloudflared** — `brew install cloudflared` (macOS)

## Quick Start

```bash
# 1. Install dependencies
cd yt-worker
npm install

# 2. Start the worker
node server.js
# → [SyncBeats YT Worker] Listening on port 8787

# 3. Test it
curl http://localhost:8787/health
# → {"status":"ok","timestamp":...}

curl -X POST http://localhost:8787/download \
  -H "Content-Type: application/json" \
  -d '{"videoId":"34Na4j8AVgA","title":"Starboy"}' \
  -o test.mp3
# → Downloads and saves MP3
```

## Environment Variables

| Variable        | Default | Description                                          |
|-----------------|---------|------------------------------------------------------|
| `PORT`          | `8787`  | Port the worker listens on                           |
| `WORKER_SECRET` | *(none)* | If set, requires `Authorization: Bearer <secret>` header |

## Cloudflare Tunnel Setup (One-time)

```bash
# 1. Login to Cloudflare
cloudflared login

# 2. Create the tunnel
cloudflared tunnel create yt-worker

# 3. Route DNS (if you have syncbeats.app in Cloudflare)
cloudflared tunnel route dns yt-worker yt-worker.syncbeats.app

# 4. Create config file
cat > ~/.cloudflared/config.yml << EOF
tunnel: <TUNNEL_ID_FROM_STEP_2>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: yt-worker.syncbeats.app
    service: http://localhost:8787
  - service: http_status:404
EOF

# 5. Run the tunnel
cloudflared tunnel run yt-worker

# 6. (Optional) Install as a background service
sudo cloudflared service install
```

## Architecture

```
User Browser
    │
    ▼
AWS EC2 Server ──► POST /download ──► Cloudflare Tunnel ──► This Worker
    │                                                            │
    │                                                       yt-dlp (residential IP)
    │                                                            │
    ◄──────────────── MP3 binary stream ◄────────────────────────┘
    │
    ▼
Browser saves to IndexedDB
```

## Security

- Set `WORKER_SECRET` to restrict access to your EC2 server only
- The Cloudflare Tunnel is encrypted end-to-end
- No ports need to be opened on your local network
