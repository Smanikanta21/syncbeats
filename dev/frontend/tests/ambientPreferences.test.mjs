import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { parseAmbientMode } = loadTypeScript('lib/ambientPreferences.ts');

test('fresh devices and legacy enabled backgrounds use Normal without enabling the GPU effect', () => {
  assert.equal(parseAmbientMode(null), 'normal');
  assert.equal(parseAmbientMode(null, true), 'normal');
  assert.equal(parseAmbientMode(null, false), 'off');
});

test('intensive mode requires explicit device-local warning acknowledgement', () => {
  for (const value of [{ mode: 'immersive' }, { mode: 'immersive', powerWarningAccepted: false }, { mode: 'immersive', powerWarningAccepted: 'true' }]) {
    assert.equal(parseAmbientMode(JSON.stringify(value)), 'normal');
  }
  assert.equal(parseAmbientMode(JSON.stringify({ mode: 'immersive', powerWarningAccepted: true })), 'immersive');
});

test('device choices survive legacy account preferences; invalid settings fall back safely', () => {
  for (const mode of ['off', 'normal', 'auto']) {
    assert.equal(parseAmbientMode(JSON.stringify({ mode }), false), mode);
  }
  for (const invalid of ['{', 'null', '{}', '{"mode":"unknown"}']) {
    assert.equal(parseAmbientMode(invalid), 'normal');
  }
});

const { normalizeImmersiveIntensity, parseImmersiveIntensity } = loadTypeScript('lib/ambientPreferences.ts');
test('intensity safely migrates old settings and clamps corrupt values', () => {
  for (const stored of [null, '{}', 'invalid', 'null', '{"immersiveIntensity":"100"}']) assert.equal(parseImmersiveIntensity(stored), 65);
  assert.equal(normalizeImmersiveIntensity(Infinity), 65);
  assert.equal(normalizeImmersiveIntensity(-10), 20);
  assert.equal(normalizeImmersiveIntensity(300), 100);
  assert.equal(parseImmersiveIntensity('{"immersiveIntensity":75}'), 75);
});

test('changing intensity preserves the warning gate and the selected mode', () => {
  const values = new Map([['syncbeats_device_ambient_v1', '{"mode":"immersive","powerWarningAccepted":false}']]);
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  let quotaExceeded = false;
  globalThis.window = new EventTarget();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (quotaExceeded) throw new Error('quota'); values.set(key, value); },
  };
  try {
    const { useAmbientMode } = loadTypeScript('hooks/useAmbientMode.ts', { react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() } });
    let controls = useAmbientMode();
    controls.setImmersiveIntensity(80);
    assert.equal(useAmbientMode().mode, 'normal');
    assert.equal(JSON.parse(values.get('syncbeats_device_ambient_v1')).powerWarningAccepted, false);
    controls.setMode('immersive');
    assert.equal(useAmbientMode().mode, 'normal');
    controls.setMode('immersive', true);
    assert.equal(useAmbientMode().mode, 'immersive');
    assert.equal(useAmbientMode().immersiveIntensity, 80);
    controls.setImmersiveIntensity(25);
    assert.equal(useAmbientMode().mode, 'immersive');
    assert.equal(JSON.parse(values.get('syncbeats_device_ambient_v1')).powerWarningAccepted, true);
    controls.setMode('auto');
    assert.equal(useAmbientMode().immersiveIntensity, 25);
    quotaExceeded = true;
    controls.setMode('immersive', true);
    controls.setImmersiveIntensity(90);
    assert.equal(useAmbientMode().mode, 'immersive');
    assert.equal(useAmbientMode().immersiveIntensity, 90);
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  }
});
