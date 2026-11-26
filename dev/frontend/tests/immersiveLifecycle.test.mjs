import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { createFluidSim } = loadTypeScript('components/fluid/sim.ts');

test('quality changes release old resources and a stopped canvas can run again', () => {
  let lost = false;
  const resources = new Set();
  const enums = new Map();
  const create = kind => { const object = { kind }; resources.add(object); return object; };
  const api = {
    getExtension: name => name === 'WEBGL_lose_context' ? { loseContext: () => { lost = true; } } : {},
    getShaderParameter: () => true,
    getProgramParameter: (_program, key) => key === gl.ACTIVE_UNIFORMS ? 0 : true,
    checkFramebufferStatus: () => gl.FRAMEBUFFER_COMPLETE,
    createShader: () => create('shader'), createProgram: () => create('program'),
    createTexture: () => create('texture'), createFramebuffer: () => create('framebuffer'), createBuffer: () => create('buffer'),
    deleteShader: object => resources.delete(object), deleteProgram: object => resources.delete(object),
    deleteTexture: object => resources.delete(object), deleteFramebuffer: object => resources.delete(object), deleteBuffer: object => resources.delete(object),
  };
  const gl = new Proxy(api, { get: (target, name) => {
    if (name in target) return target[name];
    if (/^[A-Z_0-9]+$/.test(name)) { if (!enums.has(name)) enums.set(name, enums.size + 1); return enums.get(name); }
    return () => {};
  } });
  const canvas = { width: 128, height: 128, getContext: () => lost ? null : gl };
  const quality = { sim: 32, dye: 64, pressureIters: 4 };
  const sim = createFluidSim(canvas, quality);
  assert.ok(sim);
  const allocated = resources.size;
  sim.setQuality({ sim: 16, dye: 32, pressureIters: 2 });
  assert.equal(resources.size, allocated);
  sim.resize(3200, 1800, 2);
  assert.deepEqual([canvas.width, canvas.height], [1440, 810]);
  sim.dispose();
  assert.equal(resources.size, 0);
  assert.equal(lost, false);
  const restarted = createFluidSim(canvas, quality);
  assert.ok(restarted);
  restarted.dispose();
  assert.equal(resources.size, 0);
});

test('page visibility subscriptions stop the background and recover when visible', () => {
  const original = globalThis.document;
  const doc = new EventTarget();
  doc.hidden = false;
  globalThis.document = doc;
  let notifications = 0;
  let unsubscribe;
  try {
    const { usePageVisible } = loadTypeScript('hooks/usePageVisible.ts', { react: { useSyncExternalStore: (subscribe, snapshot) => {
      if (!unsubscribe) unsubscribe = subscribe(() => notifications++);
      return snapshot();
    } } });
    assert.equal(usePageVisible(), true);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(usePageVisible(), false);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(usePageVisible(), true);
    assert.equal(notifications, 2);
    unsubscribe();
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(notifications, 2);
  } finally {
    if (original === undefined) delete globalThis.document; else globalThis.document = original;
  }
});
test('live reduced-motion changes notify the renderer and unsubscribe cleanly', () => {
  const original = globalThis.window;
  let subscribe;
  const media = new EventTarget();
  media.matches = false;
  globalThis.window = {
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return media;
    },
  };
  try {
    const { usePrefersReducedMotion } = loadTypeScript('hooks/usePrefersReducedMotion.ts', {
      react: { useSyncExternalStore: (listen, snapshot, serverSnapshot) => {
        subscribe = listen;
        assert.equal(serverSnapshot(), false);
        return snapshot();
      } },
    });
    assert.equal(usePrefersReducedMotion(), false);
    let notifications = 0;
    const unsubscribe = subscribe(() => { notifications += 1; });
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    assert.equal(usePrefersReducedMotion(), true);
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    assert.equal(usePrefersReducedMotion(), false);
    assert.equal(notifications, 2);
    unsubscribe();
    media.dispatchEvent(new Event('change'));
    assert.equal(notifications, 2);
  } finally {
    if (original === undefined) delete globalThis.window; else globalThis.window = original;
  }
});

test('fluid hardware tier stays available after mounting with reduced motion', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { hardwareConcurrency: 8, deviceMemory: 8, userAgent: 'Desktop' },
  });
  try {
    const { useDevicePerf } = loadTypeScript('hooks/useDevicePerf.ts', {
      react: {
        useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
        useRef: current => ({ current }),
        useEffect: () => {},
        useMemo: compute => compute(),
      },
    });
    assert.equal(useDevicePerf({ calibrate: false }).tier, 'low');
    assert.equal(useDevicePerf({ calibrate: false, respectReducedMotion: false }).tier, 'high');
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
