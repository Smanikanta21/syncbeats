import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';
const { roomJoinRetry, roomJoinTimedOut } = loadTypeScript('lib/roomJoinRetry.ts');
test('lost joins retry at bounded intervals', (t) => {
  t.mock.timers.enable({apis:['setTimeout']});
  let sends = 0;
  const stop = roomJoinRetry(() => sends++);
  assert.equal(sends, 1);
  t.mock.timers.tick(6000); assert.equal(sends, 2);
  t.mock.timers.tick(6000); assert.equal(sends, 3);
  t.mock.timers.tick(60000); assert.equal(sends, 3);
  stop();
});
test('response or disconnect cancels retries', (t) => {
  t.mock.timers.enable({apis:['setTimeout']});
  let sends = 0;
  const stop = roomJoinRetry(() => sends++);
  stop(); t.mock.timers.tick(60000);
  assert.equal(sends, 1);
});

test('timeout applies only to active room joins after session validation', () => {
  assert.equal(roomJoinTimedOut('connecting', false), true);
  assert.equal(roomJoinTimedOut('connecting', true), false);
  for(const status of ['pending','joined','denied','not_found']) assert.equal(roomJoinTimedOut(status,false),false);
});
