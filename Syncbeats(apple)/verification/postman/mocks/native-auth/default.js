// Local stand-in built from AuthRoutes.ts and AuthService.ts; never calls external services.
const http = require('http');
const namespace = 'syncbeatsNativeAuth';
const user = email => ({ id: 'native-test-account', name: 'Native Listener', email,
  auth_provider: 'LOCAL', email_verified_at: '2026-11-15T00:00:00.000Z',
  last_login_at: null, created_at: '2026-11-15T00:00:00.000Z' });
const session = (email, includeRoom = true) => ({ user: user(email), token: 'native-valid',
  device: null, needsDeviceRename: false, ...(includeRoom ? { defaultRoomId: '512804' } : {}) });
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const reply = (status, body, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const calls = await pm.state.get(namespace + '.calls') || [];
  if (path === '/__calls') return reply(200, calls);
  calls.push({ method: req.method, path, hasDeviceID: !!req.headers['x-device-id'],
    hasBearer: !!req.headers.authorization });
  await pm.state.set(namespace + '.calls', calls);
  const body = req.body || {};
  if (path === '/auth/login' && req.method === 'POST') {
    if (!body.email || !body.password) return reply(400, { error: 'email and password are required' });
    if (body.email === 'wrong@example.test') return reply(401, { error: 'Invalid password' });
    if (body.email === 'unverified@example.test') return reply(401, { error: 'UNVERIFIED_EMAIL: Please verify before logging in.' });
    if (body.email === 'setup@example.test') return reply(401, { error: 'GOOGLE_AUTH_SETUP_PASSWORD: An OTP has been sent to your email.' });
    if (body.email === 'server-error@example.test') return reply(503, '<html>Gateway unavailable</html>', 'text/html');
    if (body.email === 'timeout@example.test') return setTimeout(() => reply(200, session(body.email)), 2200);
    await pm.state.set(namespace + '.lastEmail', body.email);
    return reply(200, session(body.email));
  }
  if (path === '/auth/register' && req.method === 'POST') {
    if (!body.name || !body.email || !body.password || body.password.length < 8)
      return reply(400, { error: 'Name, email, and password with at least 8 characters are required' });
    if (body.email === 'conflict@example.test') return reply(409, { error: 'Email already registered' });
    await pm.state.set(namespace + '.registered', body.email);
    return reply(201, { ok: true });
  }
  if (path === '/auth/me' && req.method === 'GET') {
    if (req.headers.authorization === 'Bearer server-down') return reply(503, '<html>Gateway unavailable</html>', 'text/html');
    if (req.headers.authorization !== 'Bearer native-valid') return reply(401, { error: 'Invalid token' });
    return reply(200, session(await pm.state.get(namespace + '.lastEmail') || 'listener@example.test', false));
  }
  if (path === '/auth/google' && req.method === 'POST') {
    if (body.credential !== 'fixture-google-token') return reply(401, { error: 'Invalid Google credential' });
    return reply(200, session('google@example.test'));
  }
  if (['/auth/verification/resend', '/auth/password/forgot'].includes(path) && req.method === 'POST') {
    if (!body.email) return reply(400, { error: 'email is required' });
    return reply(200, { ok: true });
  }
  if (path === '/auth/password/reset' && req.method === 'POST') {
    if (body.otp !== '123456' || !body.password || body.password.length < 8)
      return reply(400, { error: 'Invalid or expired OTP' });
    return reply(200, { ok: true });
  }
  if (path === '/rooms/default' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer native-valid') return reply(401, { error: 'Invalid token' });
    return reply(200, { roomId: '512804', isNew: false });
  }
  reply(501, { error: 'Path not modeled by the native authentication verification' });
}).listen(process.env.PORT);
