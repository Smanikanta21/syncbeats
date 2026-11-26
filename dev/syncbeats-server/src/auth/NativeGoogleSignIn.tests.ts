import assert from 'node:assert/strict';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('An isolated TEST_DATABASE_URL is required');
  const target = new URL(url);
  assert(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname.includes('test'), 'Refusing a non-local or non-test database');
  process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'local-native-google-verification-secret'; process.env.GOOGLE_CLIENT_ID = 'fixture-client';
  const [{ default: db }, { nativeGoogleRoutes }, { AuthService }] = await Promise.all([import('../db/prisma'), import('./NativeGoogleSignIn'), import('./AuthService')]);
  const suffix = randomUUID();
  const user = await db.user.create({ data: { name: 'Native Google fixture', email: `native-google-${suffix}@example.invalid`, emailVerifiedAt: new Date(), authProvider: 'GOOGLE', googleId: suffix } });
  const auth = new AuthService();
  let verified = 0;
  const nonce = randomBytes(32).toString('base64url');
  const mock = {
    googleLogin: async (credential: string, _device?: string | null, _agent?: string | null, _ip?: string | null, expectedNonce?: string) => {
      assert.equal(credential, 'fixture-google-credential'); assert.equal(expectedNonce, nonce); verified++;
      return auth.nativeLogin(user.id);
    },
    nativeLogin: auth.nativeLogin.bind(auth),
  };
  const app = express(); app.use(express.json()); app.use('/auth/native/google', nativeGoogleRoutes(mock));
  const http = createServer(app); http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const origin = `http://127.0.0.1:${(http.address() as any).port}/auth/native/google`;
  let checks = 0; const check = (value: unknown, message: string) => { assert(value, message); checks++; console.log('PASS:', message); };
  const call = async (path: string, body?: unknown) => {
    const result = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-device-id': 'native-google-fixture' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, body: await result.json() as any, cache: result.headers.get('cache-control') };
  };
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const input = { credential: 'fixture-google-credential', codeChallenge: challenge, nonce };
  try {
    const capabilities = await call(''); check(capabilities.status === 200 && capabilities.body.version === 1 && capabilities.cache === 'no-store', 'Capabilities are available without credentials and cannot be cached');
    const first = await call('', input);
    check(first.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(first.body.code) && first.body.expiresIn === 90, 'Verified Google identity creates a short-lived code');
    check(verified === 1 && !first.body.token && !first.body.user, 'The browser receives no SyncBeats bearer token');
    const row = await db.nativeAuthCode.findUniqueOrThrow({ where: { codeHash: createHash('sha256').update(first.body.code).digest('base64url') } });
    check(row.userId === user.id && row.codeChallenge === challenge && !JSON.stringify(row).includes(first.body.code) && !JSON.stringify(row).includes(input.credential), 'Database stores only hashed code, PKCE challenge and verified account identity');
    check((await call('/exchange', { code: first.body.code, verifier: randomBytes(32).toString('base64url') })).status === 401, 'An intercepted callback cannot sign in without the private verifier');
    check(await db.nativeAuthCode.count({ where: { id: row.id } }) === 1, 'An incorrect verifier does not consume the legitimate request');
    const signedIn = await call('/exchange', { code: first.body.code, verifier });
    check(signedIn.status === 200 && signedIn.body.user.id === user.id && typeof signedIn.body.token === 'string', 'Correct proof issues the usual authenticated app session');
    check(auth.verifyToken(signedIn.body.token).sub === user.id && signedIn.body.defaultRoomId, 'The session uses the existing verified account and default room');
    check(await db.device.count({ where: { userId: user.id, deviceKey: 'native-google-fixture' } }) === 1, 'Device identity is registered only during app exchange');
    check((await call('/exchange', { code: first.body.code, verifier })).status === 401, 'Successful codes cannot be replayed');
    const race = await call('', input);
    const results = await Promise.all(Array.from({ length: 5 }, () => call('/exchange', { code: race.body.code, verifier })));
    check(results.filter(r => r.status === 200).length === 1 && results.filter(r => r.status === 401).length === 4, 'Concurrent exchanges consume a code exactly once');
    const expired = await call('', input);
    await db.nativeAuthCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    check((await call('/exchange', { code: expired.body.code, verifier })).status === 401, 'Expired codes cannot create sessions');
    const before = verified;
    for (const bad of [{ ...input, nonce: 'short' }, { ...input, codeChallenge: '' }, { ...input, credential: '' }]) check((await call('', bad)).status === 400, 'Malformed sign-in requests reject before provider verification');
    check(verified === before, 'Invalid inputs never reach Google identity verification');
    check((await call('', { ...input, nonce: randomBytes(32).toString('base64url') })).status === 401, 'A Google response from another login attempt is rejected');
    check((await call('', { ...input, credential: 'wrong' })).status === 401, 'Unverified Google credentials cannot create handoffs');
    const next = await call('', input);
    check(next.status === 200 && await db.nativeAuthCode.count({ where: { expiresAt: { lte: new Date() } } }) === 0, 'New requests remove expired handoffs');
    check((await call('/exchange', { code: '', verifier })).status === 401, 'Malformed exchange codes are rejected');
    console.log(`${checks} native Google API/database checks passed; Google provider verification was simulated.`);
  } finally {
    await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
