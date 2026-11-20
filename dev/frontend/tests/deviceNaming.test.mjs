import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './loadTypeScript.mjs';
const { parseParticipantNames } = loadTypeScript('lib/deviceNaming.ts');
const participant = (overrides) => ({socketId: 'mac', displayName: 'Abhinay · Mac', joinedAt: 0, isReady: true, volume: 100, ...overrides});

test('recognizes older native labels without including Mac in the account name', () => {
  assert.deepEqual(parseParticipantNames(participant()), {userName: 'Abhinay', deviceName: 'Mac'});
  assert.equal(parseParticipantNames(participant({deviceName:'Device'})).deviceName, 'Mac');
  assert.deepEqual(parseParticipantNames(participant({displayName:'Abhinay · iPad'})), {userName: 'Abhinay', deviceName: 'iPad'});
});
test('uses the native or registered computer name before output and generic hints', () => {
  assert.equal(parseParticipantNames(participant({deviceName: "Abhinay’s MacBook Pro", outputDeviceName:'Default'})).deviceName, "Abhinay’s MacBook Pro");
  assert.equal(parseParticipantNames(participant({displayName:'Abhinay::Chrome', deviceName:'Studio Mac'})).deviceName, 'Studio Mac');
});
test('preserves existing web/output names and unrelated account punctuation', () => {
  assert.deepEqual(parseParticipantNames(participant({displayName:'Abhinay::iPhone'})), {userName:'Abhinay', deviceName:'iPhone'});
  assert.equal(parseParticipantNames(participant({displayName:'Name · Music', outputDeviceName:'Living room speaker'})).userName, 'Name · Music');
  assert.equal(parseParticipantNames(participant({deviceName:'  ', outputDeviceName:'Headphones'})).deviceName,'Headphones');
});
