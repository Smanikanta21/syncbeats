const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/nativeGoogle.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const calls = []; const values = new Map(); let destination; let fail = false; let checks = 0;
const window = {
  location: { origin: 'https://syncbeats.in', pathname: '/', search: '', hash: '', assign: url => { destination = url; }, replace: url => { destination = url; } },
  history: { replaceState: () => { window.location.hash = ''; } },
  sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
};
const code = 'D'.repeat(43);
const exportsObject = {};
const context = vm.createContext({ exports: exportsObject, URL, URLSearchParams, window, process: { env: {} }, require: name => {
  assert.equal(name, './api'); return { request: async (endpoint, input) => { calls.push({ endpoint, body: JSON.parse(input.body), fragment: window.location.hash }); if (fail) throw Error('fixture failure'); return { version: 1, code }; } };
} });
vm.runInContext(js, context);
const api = exportsObject;
const check = (value, message) => { assert(value, message); checks++; console.log('PASS:', message); };
const flow = { state: 'A'.repeat(43), nonce: 'B'.repeat(43), challenge: 'C'.repeat(43) };
const record = JSON.stringify({ ...flow, createdAt: Date.now() });
const fragment = '#state=syncbeats-native:' + flow.state + '&id_token=fictional-google-credential';
(async () => {
  check(api.nativeGoogleRequest({ state: flow.state, nonce: flow.nonce, code_challenge: flow.challenge }).state === flow.state, 'Valid native requests preserve independent session bindings');
  for (const bad of [{ state: 'short', nonce: flow.nonce, code_challenge: flow.challenge }, { state: [flow.state, flow.state], nonce: flow.nonce, code_challenge: flow.challenge }]) check(api.nativeGoogleRequest(bad) === null, 'Malformed or duplicate native parameters are rejected');
  const authorization = new URL(api.googleNativeAuthorization(flow, 'fixture-client', 'https://syncbeats.in'));
  check(authorization.origin === 'https://accounts.google.com' && authorization.searchParams.get('redirect_uri') === 'https://syncbeats.in' && authorization.searchParams.get('nonce') === flow.nonce, 'Google uses the existing registered website redirect and request nonce');
  for (const [origin, expected] of [['https://www.syncbeats.in', 'https://syncbeats.in'],
    ['https://www.syncbeats.app', 'https://syncbeats.app'], ['http://localhost:3000', 'http://localhost:3000']]) {
    const redirected = new URL(api.googleNativeAuthorization(flow, 'fixture-client', origin));
    check(redirected.searchParams.get('redirect_uri') === expected, 'Native callback matches the registered root at ' + origin);
  }
  check(api.isNativeGoogleReturn(fragment) && !api.isNativeGoogleReturn('#state=ordinary-web& id_token=fictional'), 'Ordinary web login remains separate from native handoffs');
  check(api.nativeGooglePending(fragment, record).credential === 'fictional-google-credential', 'The callback is bound to the pending native attempt');
  for (const [hash, saved] of [[fragment.replace(flow.state, 'wrong'), record], [fragment + '&state=other', record], [fragment + '&id_token=other', record], [fragment, null], [fragment, '{'], [fragment, JSON.stringify({ ...flow, createdAt: Date.now() - 600001 })]]) {
    assert.throws(() => api.nativeGooglePending(hash, saved)); checks++;
  }
  window.location.origin = 'https://www.syncbeats.in';
  api.startNativeGoogle(flow);
  check(new URL(destination).searchParams.get('redirect_uri') === 'https://syncbeats.in', 'Starting from the deployed www page uses the same Google callback as web login');
  check(new URL(destination).searchParams.get('state') === 'syncbeats-native:' + flow.state && values.size === 1, 'Starting sign-in persists only the session bindings');
  window.location.hash = fragment;
  await api.finishNativeGoogle();
  const callback = new URL(destination);
  check(callback.protocol === 'syncbeats:' && callback.hostname === 'google' && callback.searchParams.get('code') === code && callback.searchParams.get('state') === flow.state, 'Success returns a fixed custom-scheme callback containing only a code');
  check(!destination.includes('credential') && calls[0].fragment === '' && values.size === 0, 'The Google credential is removed before the network exchange and never enters the callback');
  check(calls[0].endpoint === '/auth/native/google' && calls[0].body.codeChallenge === flow.challenge && calls[0].body.nonce === flow.nonce, 'The browser sends the identity and bindings to the existing account backend');
  fail = true; api.startNativeGoogle(flow); window.location.hash = fragment;
  await api.finishNativeGoogle();
  check(new URL(destination).searchParams.get('error') === 'sign_in_failed' && !destination.includes(code), 'Failed identity verification returns no usable code');
  fail = false; api.startNativeGoogle(flow); window.location.hash = '#state=syncbeats-native:' + flow.state + '&error=access_denied';
  await api.finishNativeGoogle();
  check(new URL(destination).searchParams.get('error') === 'sign_in_failed', 'Cancelling Google returns control to the app');
  assert.throws(() => api.nativeGoogleCallback('wrong', code)); checks++;
  console.log(`${checks} native Google web flow checks passed; browser navigation and provider responses were simulated.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
