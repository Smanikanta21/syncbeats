import type { Page, WebSocketRoute } from '@playwright/test';
import type { RoomSnapshot, Track } from '../../src/lib/types';

const user = { id: 'listener-1', name: 'Listener', email: 'listener@example.test' };
const covers = ['midnight', 'electric', 'night', 'bloom'];
const result = (index: number) => ({ url: `youtube:${['abcdefghijk', 'lmnopqrstuv', 'wxyzABCDEFG', 'HIJKLMNOPQR'][index]}`,
  title: ['Midnight City', 'Electric Feel', 'Night Drive', 'Bloom'][index], uploaderName: ['M83', 'MGMT', 'The Midnight', 'ODESZA'][index], duration: 30,
  thumbnail: `https://artwork.syncbeats.test/${covers[index]}.svg` });
const track = (index: number): Track => ({ id: `track-${index}`, trackUrl: result(index).url, title: result(index).title,
  artist: result(index).uploaderName, thumbnail: result(index).thumbnail, durationSec: 30, queueIndex: index, isCurrent: index === 0 });
function wav() {
  const data = Buffer.alloc(44 + 8000 * 2 * 30);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}

export async function installBackend(page: Page, signedIn = true) {
  const commands: { event: string; body: any }[] = [];
  const requests: { path: string; body: any }[] = [];
  const peers = new Set<WebSocketRoute>();
  let state: RoomSnapshot = { roomId: '123456', roomInstanceId: 'fixture-room', playbackInstanceId: 'fixture-play-1',
    trackUrl: track(0).trackUrl, position: 0, state: 'PAUSED', isPlaying: false, startEpoch: null, pauseOffset: 0,
    participants: [{ socketId: 'phone-test', displayName: 'Listener', deviceName: 'SyncBeats Android', isReady: false, volume: 100 },
      { socketId: 'mac-test', displayName: 'Studio Mac', deviceName: 'SyncBeats Mac', isReady: true, volume: 100 }],
    queue: [track(0)], timestamp: Date.now(), shuffle: false, repeatMode: 'off' };
  let holdPlayback = false;
  const broadcast = (event = 'room:stateChanged') => { state = { ...state, timestamp: Date.now() }; for (const peer of peers) peer.send(`42${JSON.stringify([event, state])}`); };
  if (signedIn) await page.addInitScript(() => window.sessionStorage.setItem('syncbeats.token', 'fixture-session'));
  await page.route('https://artwork.syncbeats.test/**', route => {
    const name = new URL(route.request().url()).pathname.split('.')[0].slice(1);
    const palette = name === 'midnight' ? ['#173334', '#DABF86'] : name === 'electric' ? ['#BB613D', '#F3DFC2'] : name === 'night' ? ['#253340', '#A4BD9E'] : ['#4B6250', '#F7F5EF'];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${palette[0]}"/><circle cx="200" cy="190" r="108" fill="none" stroke="${palette[1]}" stroke-width="2"/><circle cx="200" cy="190" r="72" fill="none" stroke="${palette[1]}" stroke-width="2"/><path d="M0 240 L400 160 M0 255 L400 175 M0 270 L400 190" stroke="${palette[1]}" stroke-width="2"/><text x="28" y="360" font-family="sans-serif" font-size="24" fill="${palette[1]}">${name}</text></svg>` });
  });
  await page.route('https://api.syncbeats.in/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body: any = {}; try { body = request.postDataJSON() ?? {}; } catch {}
    requests.push({ path, body });
    const json = (value: any, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/auth/me') return json({ user });
    if (path === '/auth/login') return body.password === 'incorrect' ? json({ error: 'Invalid email or password.' }, 401) : json({ user, token: 'fixture-session' });
    if (path === '/auth/register') return json({ ok: true }, 201);
    if (path === '/rooms/default') return json({ roomId: '123456' });
    if (path.endsWith('/youtube-search')) {
      if (url.searchParams.get('q') === 'slow') { await new Promise(resolve => setTimeout(resolve, 400)); return json([result(0)]); }
      if (url.searchParams.get('q') === 'fast') return json([result(3)]);
      return json([result(1), result(2), result(3), result(0)]);
    }
    if (path === '/recommendations/feed') return json({ sections: [{ id: 'artists', title: 'For you', picks: [
      { id: 'artist-1', name: 'The Midnight', query: 'The Midnight', reason: 'From your listening interests' },
      { id: 'artist-2', name: 'ODESZA', query: 'ODESZA', reason: 'A little more electronic' },
    ] }] });
    if (path === '/history/recent') return json({ listens: [{ youtubeId: 'abcdefghijk', title: 'Midnight City', artist: 'M83', thumbnail: result(0).thumbnail }] });
    if (path === '/api/playlists/catalog') return json({ songs: [{ id: 'saved-1', title: 'Bloom', artist: 'ODESZA', artwork: result(3).thumbnail, duration: 30, youtubeID: null }], total: 1, nextCursor: null });
    if (path === '/api/bridge/resolve') return json({ youtubeId: 'HIJKLMNOPQR' });
    if (path.endsWith('/yt-proxy')) return route.fulfill({ status: 200, headers, contentType: 'audio/wav', body: wav() });
    if (path.endsWith('/enqueue-youtube')) {
      const existing = state.queue.find(item => item.trackUrl === body.youtubeUrl);
      const item: Track = existing ?? { id: `track-added-${state.queue.length}`, trackUrl: body.youtubeUrl, title: body.title || 'Linked song', artist: body.artist, thumbnail: body.thumbnail, durationSec: body.durationSec,
        queueIndex: state.queue.length, isCurrent: false };
      if (!existing) state.queue = [...state.queue, item]; broadcast(); return json({ item, queued: !existing }, 201);
    }
    if (path.endsWith('/queue/reorder')) {
      const queue = [...state.queue], old = queue.findIndex(item => item.id === body.itemId);
      queue.splice(body.newIndex, 0, ...queue.splice(old, 1)); state.queue = queue.map((item, index) => ({ ...item, queueIndex: index })); broadcast(); return json({ ok: true });
    }
    if (request.method() === 'DELETE' && path.includes('/queue/')) { state.queue = state.queue.filter(item => item.id !== path.split('/').at(-1)); broadcast(); return json({ ok: true }); }
    throw new Error(`Unexpected API request: ${request.method()} ${path}`);
  });
  await page.routeWebSocket(/\/socket\.io\//, peer => {
    peers.add(peer);
    peer.send(`0${JSON.stringify({ sid: 'engine-test', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`);
    peer.onClose(() => peers.delete(peer));
    peer.onMessage(message => {
      const frame = String(message);
      if (frame.startsWith('40')) { peer.send('40{"sid":"phone-test"}'); return; }
      if (!frame.startsWith('42')) return;
      const [event, body] = JSON.parse(frame.slice(2)); commands.push({ event, body });
      if (event === 'sync:ping') { peer.send(`42${JSON.stringify(['sync:pong', { ...body, t1: Date.now(), t2: Date.now() }])}`); return; }
      if (event === 'room:join') {
        if (body.roomId === '654321') { peer.send('42["room:joinPendingApproval",{"roomId":"654321"}]'); return; }
        broadcast('room:snapshot'); return;
      }
      if (event === 'room:clientReady') { state.participants[0].isReady = body.isReady; broadcast(); return; }
      if (event === 'playback:play' && !holdPlayback) {
        state = { ...state, state: 'PLAYING', isPlaying: true, startEpoch: Date.now() + 150 - (state.pauseOffset || 0) * 1000, playbackInstanceId: `fixture-play-${Date.now()}` }; broadcast();
      }
      if (event === 'playback:pause' && !holdPlayback) { state = { ...state, state: 'PAUSED', isPlaying: false, pauseOffset: state.startEpoch ? Math.max(0, (Date.now() - state.startEpoch) / 1000) : 0, startEpoch: null }; broadcast(); }
      if (event === 'room:toggleShuffle') { state.shuffle = body.shuffle; broadcast(); }
      if (event === 'room:toggleRepeat') { state.repeatMode = body.repeatMode; broadcast(); }
      if (event === 'room:resync') broadcast('room:snapshot');
      if (event === 'room:setParticipantVolume') { state.participants[0].volume = body.volume; broadcast(); }
    });
  });
  return { commands, requests, state: () => state,
    volume: (value: number) => { state.participants[0].volume = value; broadcast(); },
    hold: (value: boolean) => { holdPlayback = value; },
    play: () => { state = { ...state, isPlaying: true, state: 'PLAYING', startEpoch: Date.now() + 150, pauseOffset: 0 }; broadcast(); },
  };
}
