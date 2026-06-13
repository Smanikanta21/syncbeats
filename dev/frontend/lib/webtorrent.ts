export let wtClient: any = null;

export async function getWebTorrentClient() {
  if (typeof window === 'undefined') return null;
  if (wtClient) return wtClient;
  
  return new Promise((resolve, reject) => {
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    if (process.env.NEXT_PUBLIC_TURN_URL) {
      iceServers.push({
        urls: process.env.NEXT_PUBLIC_TURN_URL,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL
      } as any);
    }

    const wtConfig = {
      tracker: {
        rtcConfig: { iceServers }
      }
    };

    if ((window as any).WebTorrent) {
      wtClient = new (window as any).WebTorrent(wtConfig);
      resolve(wtClient);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
    script.onload = () => {
      wtClient = new (window as any).WebTorrent(wtConfig);
      resolve(wtClient);
    };
    script.onerror = (err) => {
      console.error("Failed to load WebTorrent from CDN:", err);
      reject(err);
    };
    document.body.appendChild(script);
  });
}
