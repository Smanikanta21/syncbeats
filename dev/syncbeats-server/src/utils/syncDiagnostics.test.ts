import assert from 'node:assert/strict';
import { normalizeSyncDiagnostic } from './syncDiagnostics';

assert.equal(normalizeSyncDiagnostic(null), null);
assert.equal(normalizeSyncDiagnostic({ roomId: '123456', status: 'arbitrary' }), null);
assert.equal(normalizeSyncDiagnostic({ roomId: 'bad', status: 'active' }), null);
const sanitized = normalizeSyncDiagnostic({ roomId: '123456', status: 'clock-untrusted',
  clockOffsetMs: 20, signedDriftMs: Infinity, measuredLatencyMs: 140, thresholdMs: 20,
  deviceType: 'mobile', correction: 'synced', tabVisible: true, token: 'must-not-be-logged',
  userAgent: 'must-not-be-logged', manualLatencyMs: 'wrong type' });
assert.ok(sanitized);
assert.equal(sanitized.clockOffsetMs, 20);
assert.equal(sanitized.signedDriftMs, null);
assert.equal(sanitized.manualLatencyMs, null);
assert.equal(sanitized.measuredLatencyMs, 140);
assert.equal(sanitized.tabVisible, true);
assert.equal('token' in sanitized, false);
assert.equal('userAgent' in sanitized, false);
console.log('Sync diagnostic validation: invalid reports rejected and log fields bounded.');
