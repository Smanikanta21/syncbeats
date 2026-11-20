import assert from 'node:assert/strict';
import { parseBetaSignup } from './betaSignup';

const good = { email: '  TESTER@Example.invalid ', consent: true };
const accepted = parseBetaSignup(good);
assert.equal(accepted.ok, true);
if (accepted.ok) {
  assert.equal(accepted.signup.email, 'tester@example.invalid');
  assert.equal(accepted.signup.macChip, 'unsure');
  assert.equal(accepted.signup.name, null);
}
for (const body of [null, [], 'text', { ...good, consent: undefined }, { ...good, consent: 'true' },
  { ...good, email: 'not-an-email' }, { ...good, email: 'test\0@example.invalid' },
  { ...good, name: 'x'.repeat(81) }, { ...good, macosVersion: 42 },
  { ...good, testingInterest: 'x'.repeat(501) }, { ...good, macChip: 'anything' }]) {
  assert.equal(parseBetaSignup(body).ok, false);
}
const bot = parseBetaSignup({ ...good, website: 'https://bot.invalid' });
assert.equal(bot.ok && bot.honeypot, true);
const details = parseBetaSignup({ ...good, name: ' Tester ', macChip: 'intel', macosVersion: ' macOS 15 ', testingInterest: ' Two speakers ' });
assert.equal(details.ok, true);
if (details.ok) assert.equal(details.signup.testingInterest, 'Two speakers');
console.log('Mac beta validation checks passed');
