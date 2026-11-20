import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './loadTypeScript.mjs';

const { analyticsConsent, analyticsAllowed, saveAnalyticsConsent, readAnalyticsConsent, COOKIE_PREFERENCES_EVENT } = loadTypeScript('lib/cookiePreferences.ts');

test('optional analytics require an explicit boolean opt-in and stay off for malformed storage', () => {
  for (const raw of [null, '', 'invalid json', 'null', '{}', '{"analytics":false}', '{"analytics":"true"}']) {
    assert.equal(analyticsConsent(raw), false);
  }
  assert.equal(analyticsConsent('{"analytics":true}'), true);
  assert.equal(analyticsAllowed('dev.syncbeats.in', true), false);
  assert.equal(analyticsAllowed('localhost', true), false);
  assert.equal(analyticsAllowed('syncbeats.in', false), false);
  assert.equal(analyticsAllowed('www.syncbeats.in', true), true);
});

test('both consent grant and revocation persist and notify the current page', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = [];
  let stored = null;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
    dispatchEvent: event => events.push(event.type),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; });
  assert.equal(saveAnalyticsConsent(true), true);
  assert.equal(readAnalyticsConsent(), true);
  assert.equal(saveAnalyticsConsent(false), true);
  assert.equal(readAnalyticsConsent(), false);
  assert.deepEqual(events, [COOKIE_PREFERENCES_EVENT, COOKIE_PREFERENCES_EVENT]);
  window.localStorage.getItem = () => { throw new Error('blocked'); };
  window.localStorage.setItem = () => { throw new Error('blocked'); };
  assert.equal(readAnalyticsConsent(), false);
  assert.equal(saveAnalyticsConsent(true), false);
  assert.equal(events.length, 2);
});
