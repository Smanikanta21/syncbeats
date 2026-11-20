import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';

const { classifyBrowserDevice } = loadTypeScript('lib/browserDevice.ts');
const desktopSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

test('desktop-mode iPad Safari is a tablet and a real Mac remains a laptop', () => {
  assert.deepEqual(classifyBrowserDevice({ userAgent: desktopSafari, platform: 'MacIntel', maxTouchPoints: 5 }), { name: 'iPad', type: 'tablet' });
  assert.deepEqual(classifyBrowserDevice({ userAgent: desktopSafari, platform: 'MacIntel', maxTouchPoints: 0 }), { name: 'Mac', type: 'laptop' });
});

test('phone and tablet user agents retain their device classes', () => {
  assert.equal(classifyBrowserDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' }).name, 'iPad');
  assert.equal(classifyBrowserDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }).type, 'mobile');
  assert.equal(classifyBrowserDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet)' }).type, 'tablet');
});
