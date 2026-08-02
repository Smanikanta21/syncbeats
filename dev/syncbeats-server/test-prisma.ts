import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function runTest(count: number) {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      roomId: "test-room",
      uploaderUserId: "test-user",
      trackUrl: "test-url",
      title: "test-title",
      artist: "test-artist",
      fileName: "test-file",
      mimeType: "test-mime",
      sizeBytes: BigInt(0),
      queueIndex: i,
      isCurrent: i === 0,
    });
  }
  
  try {
    await prisma.$transaction(
      data.map(item => prisma.roomQueueItem.create({ data: item }))
    );
    console.log(`Success for ${count}`);
  } catch (e: any) {
    if (e.code === 'P2003') {
      console.log(`Foreign key error for ${count} (Valid SQL)`);
    } else {
      console.error(`Error for ${count}:`, e.message);
    }
  }
}

async function main() {
  await runTest(50);
  await runTest(100);
  await runTest(200);
  await prisma.$disconnect();
}
main();
