import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './loadTypeScript.mjs';

const { extractPaletteFromPixels } = loadTypeScript('lib/albumPalette.ts');
const { extractTwoColorsFromImage } = loadTypeScript('lib/colorExtractor.ts', {
  './api': { getRestUrl: () => 'http://backend.test' },
});
const pixels = (...regions) => new Uint8ClampedArray(regions.flatMap(([rgb, count, alpha = 255]) =>
  Array.from({ length: count }, () => [...rgb, alpha]).flat()));

test('dominant muted artwork beats tiny saturated accents', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels(
    [[179, 184, 206], 950], [[255, 0, 220], 25], [[0, 100, 255], 25],
  )), ['#b3b8ce', '#b3b8ce']);
});

test('two substantial artwork regions keep their actual colors', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels(
    [[205, 156, 129], 650], [[142, 174, 199], 350],
  )), ['#cd9c81', '#8eaec7']);
});

test('single-color artwork does not invent a complementary hue', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels([[220, 159, 70], 100])), ['#dc9f46', '#dc9f46']);
});

test('neutral and pale covers retain their tones', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels([[190, 190, 190], 100])), ['#bebebe', '#bebebe']);
  assert.deepEqual(extractPaletteFromPixels(pixels([[239, 228, 220], 100])), ['#efe4dc', '#efe4dc']);
});

test('black thumbnail letterboxing does not dominate colored artwork', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels(
    [[0, 0, 0], 400], [[181, 191, 209], 600],
  )), ['#b5bfd1', '#b5bfd1']);
});

test('transparent pixels are ignored and empty artwork has no fabricated palette', () => {
  assert.deepEqual(extractPaletteFromPixels(pixels(
    [[255, 0, 220], 900, 0], [[170, 184, 194], 100],
  )), ['#aab8c2', '#aab8c2']);
  assert.equal(extractPaletteFromPixels(pixels([[255, 0, 0], 100, 0])), null);
});

function imageFixture() {
  const originals = Object.fromEntries(['window', 'document', 'Image'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const sources = [];
  let fail = false;
  let tainted = false;
  globalThis.window = {};
  globalThis.document = { createElement: () => ({
    getContext: () => ({
      drawImage() {},
      getImageData() {
        if (tainted) throw new Error('Tainted canvas');
        return { data: pixels([[190, 180, 200], 100]) };
      },
    }),
  }) };
  globalThis.Image = class {
    set src(value) {
      sources.push(value);
      queueMicrotask(() => fail ? this.onerror?.() : this.onload?.());
    }
  };
  return {
    sources,
    setFail(value) { fail = value; },
    setTainted(value) { tainted = value; },
    restore() {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    },
  };
}

test('failed artwork loads are not cached as purple and can retry', async () => {
  const fixture = imageFixture();
  try {
    const url = 'https://artwork.test/retry.jpg';
    fixture.setFail(true);
    assert.equal(await extractTwoColorsFromImage(url), null);
    assert.equal(fixture.sources.length, 2);
    fixture.setFail(false);
    assert.deepEqual(await extractTwoColorsFromImage(url), ['#beb4c8', '#beb4c8']);
    assert.equal(fixture.sources.length, 3);
    await extractTwoColorsFromImage(url);
    assert.equal(fixture.sources.length, 3);
  } finally { fixture.restore(); }
});

test('concurrent palette consumers share one proxy image load', async () => {
  const fixture = imageFixture();
  try {
    const url = 'https://artwork.test/shared.jpg';
    const first = extractTwoColorsFromImage(url);
    assert.equal(extractTwoColorsFromImage(url), first);
    await first;
    assert.deepEqual(fixture.sources, [`http://backend.test/search/proxy-image?url=${encodeURIComponent(url)}`]);
  } finally { fixture.restore(); }
});

test('already proxied artwork is not wrapped in another proxy', async () => {
  const fixture = imageFixture();
  try {
    const url = 'https://app.test/api/search/proxy-image?url=cover';
    await extractTwoColorsFromImage(url);
    assert.deepEqual(fixture.sources, [url]);
  } finally { fixture.restore(); }
});

test('canvas CORS failures return no album palette', async () => {
  const fixture = imageFixture();
  try {
    fixture.setTainted(true);
    assert.equal(await extractTwoColorsFromImage('https://artwork.test/tainted.jpg'), null);
    assert.equal(fixture.sources.length, 2);
  } finally { fixture.restore(); }
});

test('track changes retain the last palette until the latest artwork is ready', async () => {
  let state = null;
  let dependencies;
  let cleanup;
  const requests = new Map();
  const { useAlbumPalette } = loadTypeScript('hooks/useAlbumPalette.ts', {
    react: {
      useState: () => [state, value => { state = value; }],
      useEffect: (effect, nextDependencies) => {
        if (dependencies?.every((value, index) => value === nextDependencies[index])) return;
        cleanup?.();
        dependencies = nextDependencies;
        cleanup = effect();
      },
    },
    '../lib/colorExtractor': { extractTwoColorsFromImage: url => new Promise(resolve => { requests.set(url, resolve); }) },
  });
  const first = ['#b3b8ce', '#b3b8ce'];
  const latest = ['#cd9c81', '#8eaec7'];
  assert.equal(useAlbumPalette('first', true), null);
  requests.get('first')(first);
  await Promise.resolve();
  assert.equal(useAlbumPalette('first', true), first);
  assert.equal(useAlbumPalette('obsolete', true), first);
  assert.equal(useAlbumPalette('latest', true), first);
  requests.get('latest')(latest);
  await Promise.resolve();
  assert.equal(useAlbumPalette('latest', true), latest);
  requests.get('obsolete')(['#ff00ff', '#0000ff']);
  await Promise.resolve();
  assert.equal(useAlbumPalette('latest', true), latest);
  assert.equal(useAlbumPalette('failed', true), latest);
  requests.get('failed')(null);
  await Promise.resolve();
  assert.equal(useAlbumPalette('failed', true), null);
  assert.equal(useAlbumPalette('first', false), null);
  cleanup?.();
});
