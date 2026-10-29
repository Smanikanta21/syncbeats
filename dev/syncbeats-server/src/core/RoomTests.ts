import './RoomQueue.test';
import { testPlayback } from './RoomPlayback.test';
import { testPersistence } from './RoomPersistence.test';

async function main() {
  testPlayback();
  await testPersistence();
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
