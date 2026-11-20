import { ARTISTS, ArtistSeed, GENRES, LANGUAGES, MAX_CUSTOM_ARTISTS, normalizeName } from './catalog';

export const MODEL_VERSION = 'rules-v1';
export interface Taste {
  onboardingStatus: 'NEW' | 'COMPLETE' | 'SKIPPED';
  languages: string[]; genres: string[]; favoriteArtistIds: string[];
  customArtists: string[]; useActivity: boolean;
}
export const emptyTaste = (): Taste => ({ onboardingStatus: 'NEW', languages: [], genres: [], favoriteArtistIds: [], customArtists: [], useActivity: false });
export interface Signal { artistId: string; kind: string; context: string; secondsListened: number; createdAt: Date }
export interface Pick extends ArtistSeed { query: string; reason: string; score: number }
export interface Feed { modelVersion: string; profile: Taste; sections: { id: string; title: string; picks: Pick[] }[] }

export function parseTaste(input: unknown): Taste {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose valid music interests.');
  const data = input as Record<string, unknown>;
  function list(key: string, options: readonly string[] | null, max: number): string[] {
    const value = data[key] ?? [];
    if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 80 || /[\u0000-\u001f]/.test(v))) throw new Error(`Choose valid ${key}.`);
    const clean = [...new Set(value.map((v: string) => v.trim()))];
    if (options && clean.some(v => !options.includes(v))) throw new Error(`Choose supported ${key}.`);
    return clean;
  }
  const status = data.onboardingStatus ?? 'COMPLETE';
  if (!['NEW', 'COMPLETE', 'SKIPPED'].includes(String(status))) throw new Error('Invalid setup status.');
  if (data.useActivity !== undefined && typeof data.useActivity !== 'boolean') throw new Error('Choose whether to use listening activity.');
  return {
    onboardingStatus: status as Taste['onboardingStatus'],
    languages: list('languages', LANGUAGES, LANGUAGES.length), genres: list('genres', GENRES, GENRES.length),
    favoriteArtistIds: list('favoriteArtistIds', ARTISTS.map(a => a.id), ARTISTS.length),
    customArtists: list('customArtists', null, MAX_CUSTOM_ARTISTS).filter((name, index, names) => names.findIndex(other => normalizeName(other) === normalizeName(name)) === index), useActivity: data.useActivity === true,
  };
}

// Deterministic ranking makes reasons/debugging reproducible; ML can replace this
// function without changing the client contract or mixing provider training data.
export function buildFeed(profile: Taste, events: Signal[], now = new Date()): Feed {
  const latestFeedback = new Map<string, Signal>();
  for (const event of [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (['LIKE', 'DISLIKE'].includes(event.kind) && !latestFeedback.has(event.artistId)) latestFeedback.set(event.artistId, event);
  }
  const weights: Record<string, number> = { SEARCH: 2, OPEN: 2, QUEUE: 4, PLAY: 3 };
  const activity = new Map<string, number>();
  if (profile.useActivity) for (const event of events) {
    if (event.context === 'ROOM' || !weights[event.kind] || (event.kind === 'PLAY' && event.secondsListened < 30)) continue;
    const age = Math.max(0, now.getTime() - event.createdAt.getTime()) / 86_400_000;
    activity.set(event.artistId, Math.min(12, (activity.get(event.artistId) ?? 0) + weights[event.kind] * Math.pow(0.5, age / 30)));
  }
  const namedFavorites = new Set(profile.customArtists.map(normalizeName));
  const selectedArtists = new Set([...profile.favoriteArtistIds, ...ARTISTS.filter(a => namedFavorites.has(normalizeName(a.name))).map(a => a.id)]);
  const favorites = ARTISTS.filter(a => selectedArtists.has(a.id) || latestFeedback.get(a.id)?.kind === 'LIKE');
  const preferredLanguages = profile.languages.length ? profile.languages : [...new Set(favorites.flatMap(a => a.languages))];
  const sharedGenres = new Set([...profile.genres, ...favorites.flatMap(a => a.genres)]);
  const picks = ARTISTS.filter(a => latestFeedback.get(a.id)?.kind !== 'DISLIKE').map(artist => {
    const favorite = selectedArtists.has(artist.id);
    const liked = latestFeedback.get(artist.id)?.kind === 'LIKE';
    const language = artist.languages.find(l => preferredLanguages.includes(l));
    const similar = artist.genres.some(g => sharedGenres.has(g));
    const learned = activity.get(artist.id) ?? 0;
    return { ...artist, query: `${artist.name} songs`, score: (favorite ? 30 : 0) + (liked ? 20 : 0) + (language ? 12 : 0) + (similar ? 5 : 0) + learned,
      reason: favorite ? 'An artist you chose' : liked ? 'You liked this artist' : learned > 0 ? 'From your activity in SyncBeats' : language && profile.languages.length ? `From your ${language} interests` : similar || language ? 'Related to your music interests' : 'A starter pick from SyncBeats' };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const familiar = picks.filter(p => selectedArtists.has(p.id) || latestFeedback.get(p.id)?.kind === 'LIKE');
  // Cap identical language/genre combinations for the discovery rail, without
  // dropping the user's familiar favorites from their own rail.
  const groups = new Map<string, number>();
  const discovery = picks.filter(p => !familiar.includes(p)).filter(p => {
    const group = `${p.languages[0]}:${p.genres[0]}`;
    const count = groups.get(group) ?? 0; groups.set(group, count + 1); return count < 3;
  }).slice(0, 12);
  const custom = profile.customArtists.filter(name => !ARTISTS.some(a => normalizeName(a.name) === normalizeName(name))).map(name => ({ id: `custom:${normalizeName(name)}`, name, languages: [], genres: [], query: `${name} songs`, reason: 'An artist you chose', score: 30 }));
  const sections: Feed['sections'] = [];
  if (familiar.length || custom.length) sections.push({ id: 'your-artists', title: 'Your artists', picks: [...familiar, ...custom] });
  sections.push({ id: 'discover', title: profile.languages.length || favorites.length || profile.genres.length || activity.size ? 'Discover from your interests' : 'Starter picks', picks: discovery });
  return { modelVersion: MODEL_VERSION, profile, sections };
}
