import './RoomQueue.test';
import { testPlayback } from './RoomPlayback.test';
import { testPersistence } from './RoomPersistence.test';
import { testHybridSessions } from './HybridSession.test';

async function main() {
  testPlayback();
  testHybridSessions();
  await testPersistence();
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
