import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCode, googleRedirectURI } from '../src/lib/googleCallback';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
const state = 's'.repeat(43), code = 'c'.repeat(43);
const callback = `${googleRedirectURI}?state=${state}&code=${code}`;
test('native Google callbacks require the exact scheme, state and single-use code shape', () => {
  assert.equal(googleCode(callback, state, 100, 200), code);
  assert.throws(() => googleCode(callback, 'wrong-state', 100, 200));
  assert.throws(() => googleCode(callback.replace('syncbeats-android:', 'https:'), state, 100, 200));
  assert.throws(() => googleCode(callback.replace('syncbeats-android:', 'syncbeats:'), state, 100, 200));
  assert.throws(() => googleCode(callback + '&code=' + code, state, 100, 200));
  assert.throws(() => googleCode(callback + '#token=unexpected', state, 100, 200));
  assert.throws(() => googleCode(callback, state, 100, 600_101));
  assert.throws(() => googleCode(callback, state, 100, 99));
});

function signInFixture(expoGo = false, cancel = false) {
  const calls: { path: string; body?: { code: string; verifier: string } }[] = [];
  let authorization: URL | undefined;
  const source = readFileSync(new URL('../src/session/google.ts', import.meta.url), 'utf8');
  const exports: { googleSignIn?: (api: unknown) => Promise<unknown> } = {};
  const context = createContext({ exports, URL, URLSearchParams, require: (name: string) => {
    switch (name) {
      case 'expo': return { isRunningInExpoGo: () => expoGo };
      case 'expo-crypto': return { getRandomBytesAsync: async () => randomBytes(32),
        CryptoDigestAlgorithm: { SHA256: 'sha256' }, CryptoEncoding: { BASE64: 'base64' },
        digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('base64') };
      case 'expo-web-browser': return { openAuthSessionAsync: async (url: string, redirect: string) => {
        authorization = new URL(url);
        assert.equal(redirect, googleRedirectURI);
        return cancel ? { type: 'cancel' } : { type: 'success', url: `${redirect}?state=${authorization.searchParams.get('state')}&code=${code}` };
      } };
      case '../lib/config': return { website: 'https://syncbeats.in' };
      case '../lib/googleCallback': return { googleCode, googleRedirectURI };
      default: throw new Error(`Unexpected import: ${name}`);
    }
  } });
  runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { signIn: () => exports.googleSignIn!({
    request: async (path: string) => { calls.push({ path }); return { version: 1 }; },
    post: async (path: string, body: { code: string; verifier: string }) => { calls.push({ path, body }); return { token: 'fixture-session' }; },
  }), calls, authorization: () => authorization };
}

test('Expo Go explains the installed-app requirement before contacting the server or opening Google', async () => {
  const fixture = signInFixture(true);
  await assert.rejects(fixture.signIn(), /installed SyncBeats app.*Expo Go/);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.authorization(), undefined);
});

test('installed Android Google sign-in identifies the client and exchanges a PKCE-bound return code', async () => {
  const fixture = signInFixture();
  await fixture.signIn();
  const url = fixture.authorization()!;
  assert.equal(url.pathname, '/auth/native');
  assert.equal(url.searchParams.get('client'), 'android');
  const body = fixture.calls[1].body!;
  assert.equal(fixture.calls[1].path, '/auth/native/google/exchange');
  assert.equal(body.code, code);
  assert.equal(createHash('sha256').update(body.verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.notEqual(url.searchParams.get('state'), url.searchParams.get('nonce'));
});

test('cancelling Google leaves the app signed out without exchanging a code', async () => {
  const fixture = signInFixture(false, true);
  assert.equal(await fixture.signIn(), null);
  assert.equal(fixture.calls.length, 1);
});
