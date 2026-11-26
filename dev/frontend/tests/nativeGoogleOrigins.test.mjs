import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../lib/nativeGoogle.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flow = { state: 'A'.repeat(43), nonce: 'B'.repeat(43), challenge: 'C'.repeat(43), client: 'android' };
const code = 'D'.repeat(43);

function fixture() {
  const storage = new Map();
  const cookies = new Map();
  const writes = [];
  const requests = [];
  let result;
  const document = {
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
    set cookie(value) {
      writes.push(value);
      const pair = value.split(';')[0];
      const split = pair.indexOf('=');
      const key = pair.slice(0, split);
      if (value.includes('Max-Age=0')) cookies.delete(key);
      else cookies.set(key, pair.slice(split + 1));
    },
  };
  const window = {
    location: { origin: 'https://www.syncbeats.in', hostname: 'www.syncbeats.in', pathname: '/', search: '', hash: '',
      assign: url => { result = url; }, replace: url => { result = url; } },
    history: { replaceState: () => { window.location.hash = ''; } },
    sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) },
  };
  const exports = {};
  vm.runInNewContext(js, { exports, URL, URLSearchParams, Date, Error, JSON, Number, window, document, process: { env: {} },
    require(name) {
      assert.equal(name, './api');
      return { request: async (endpoint, input) => {
        requests.push({ endpoint, body: JSON.parse(input.body), hash: window.location.hash });
        return { version: 1, code };
      } };
    },
  });
  return { api: exports, window, storage, cookies, writes, requests, result: () => new URL(result, window.location.origin) };
}

for (const [start, callback] of [['www.syncbeats.in', 'syncbeats.in'], ['www.syncbeats.app', 'syncbeats.app']]) {
  test(`Google return from ${start} through ${callback} opens Android and rejects replay`, async () => {
    const f = fixture();
    f.window.location.origin = `https://${start}`;
    f.window.location.hostname = start;
    f.api.startNativeGoogle(flow);
    assert(f.writes[0].includes(`Domain=${callback}; Path=/; Max-Age=600; Secure; SameSite=Lax`));
    assert(!f.writes[0].includes('id_token') && !f.writes[0].includes('verifier'));
    f.storage.clear();
    f.window.location.origin = `https://${callback}`;
    f.window.location.hostname = callback;
    const fragment = `#state=${f.api.nativeGoogleState(flow)}&id_token=fixture-credential`;
    f.window.location.hash = fragment;
    await f.api.finishNativeGoogle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].endpoint, '/auth/native/google');
    assert.equal(f.requests[0].body.nonce, flow.nonce);
    assert.equal(f.requests[0].hash, '');
    assert.equal(f.result().pathname, '/auth/native/return');
    assert.equal(f.result().searchParams.get('client'), 'android');
    assert.equal(f.result().searchParams.get('code'), code);
    assert(f.api.nativeGoogleReturnLink(Object.fromEntries(f.result().searchParams)).startsWith('syncbeats-android://google/callback?'));
    assert.equal(f.cookies.size, 0);
    f.window.location.hash = fragment;
    await f.api.finishNativeGoogle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.result().searchParams.get('failed'), '1');
  });
}
test('expired shared Google request is cleared and rejected before code exchange', async () => {
  const f = fixture();
  f.api.startNativeGoogle(flow);
  f.storage.clear();
  const [key, value] = [...f.cookies][0];
  const expired = JSON.parse(decodeURIComponent(value));
  expired.createdAt = Date.now() - 600_001;
  f.cookies.set(key, encodeURIComponent(JSON.stringify(expired)));
  f.window.location.hash = `#state=${f.api.nativeGoogleState(flow)}&id_token=fixture-credential`;
  await f.api.finishNativeGoogle();
  assert.equal(f.requests.length, 0);
  assert.equal(f.result().searchParams.get('error'), 'sign_in_failed');
  assert.equal(f.cookies.size, 0);
});

function mountAuthProvider(f) {
  const effects = [];
  const webLogins = [];
  const popupMessages = [];
  f.window.addEventListener = () => {};
  f.window.removeEventListener = () => {};
  f.window.close = () => {};
  const exports = {};
  const authSource = fs.readFileSync(new URL('../context/AuthContext.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(authSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, URLSearchParams, window: f.window, console,
    require(name) {
      switch (name) {
        case 'react': return {
          createContext: () => ({ Provider: () => {} }),
          useState: value => [value, () => {}],
          useEffect: effect => effects.push(effect),
          useCallback: callback => callback,
          useMemo: callback => callback(),
        };
        case 'react/jsx-runtime': return { jsx: () => null };
        case '../lib/nativeGoogle': return f.api;
        case '../lib/api': return {
          getAuthToken: () => null,
          setAuthToken: () => {},
          authApi: { googleLogin: async credential => {
            webLogins.push(credential);
            return { token: 'browser-session', user: { id: 'test-user' } };
          } },
        };
        case '../lib/socket': return {};
        case '../lib/accountUpdates': return {};
        default: throw new Error('Unexpected auth import ' + name);
      }
    },
  });
  if (f.window.opener) f.window.opener.postMessage = message => popupMessages.push(message);
  exports.AuthProvider({ children: null });
  effects.forEach(effect => effect());
  return { webLogins, popupMessages };
}

for (const client of ['android', 'apple']) {
  test('root AuthProvider sends ' + client + ' Google returns to the app before web login or popup handling', async () => {
    const f = fixture();
    const attempt = { ...flow, client };
    f.api.startNativeGoogle(attempt);
    f.window.location.hash = '#state=' + f.api.nativeGoogleState(attempt) + '&id_token=fixture-credential';
    f.window.opener = {};
    const auth = mountAuthProvider(f);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.requests.length, 1);
    assert.deepEqual(auth.webLogins, []);
    assert.deepEqual(auth.popupMessages, []);
    assert.equal(f.result().pathname, '/auth/native/return');
    assert.equal(f.result().searchParams.get('client'), client);
    const callback = new URL(f.api.nativeGoogleReturnLink(Object.fromEntries(f.result().searchParams)));
    assert.equal(callback.protocol, client === 'android' ? 'syncbeats-android:' : 'syncbeats:');
  });
}

test('ordinary Google web login still enters the hub', async () => {
  const f = fixture();
  f.window.location.hash = '#state=browser-attempt&id_token=fixture-credential';
  const auth = mountAuthProvider(f);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(auth.webLogins, ['fixture-credential']);
  assert.equal(f.requests.length, 0);
  assert.equal(f.window.location.href, '/hub');
});
