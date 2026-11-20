import assert from 'node:assert/strict';
import { deviceUserAgent } from './clientDevice';

const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
assert.match(deviceUserAgent(ua, 'ipad')!, /SyncBeatsDevice\/iPad$/);
assert.equal(deviceUserAgent(ua, undefined), ua);
assert.equal(deviceUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0)', 'ipad'), 'Mozilla/5.0 (iPad; CPU OS 18_0)');
assert.equal(deviceUserAgent('Mozilla/5.0 (Windows NT 10.0)', 'ipad'), 'Mozilla/5.0 (Windows NT 10.0)');
assert.equal(deviceUserAgent(undefined, 'ipad'), null);
console.log('iPad desktop-UA hint checks passed.');
