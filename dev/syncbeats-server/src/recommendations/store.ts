import { PrismaClient, Prisma } from '@prisma/client';
import { ARTISTS, artistsInText } from './catalog';
import { emptyTaste, Taste } from './engine';

export async function loadTaste(db: Pick<PrismaClient, 'musicTasteProfile'>, userId: string): Promise<Taste> {
  const row = await db.musicTasteProfile.findUnique({ where: { userId } });
  return row ? { ...row, onboardingStatus: row.onboardingStatus as Taste['onboardingStatus'] } : emptyTaste();
}
export async function recordSignal(db: PrismaClient, userId: string, artistId: string, kind: string, eventId: string, context = 'PERSONAL', secondsListened = 0): Promise<void> {
  if (!ARTISTS.some(a => a.id === artistId)) return;
  await db.$transaction(async tx => {
    // Serialize consent changes against event writes, so disabling activity
    // cannot leave an in-flight implicit event behind after the cleanup.
    await tx.$queryRaw(Prisma.sql`SELECT user_id FROM music_taste_profiles WHERE user_id = ${userId} FOR UPDATE`);
    if (!['LIKE', 'DISLIKE'].includes(kind) && !(await loadTaste(tx, userId)).useActivity) return;
    await tx.recommendationEvent.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId, artistId, kind, context, secondsListened }, update: {},
    });
  });
}
export async function recordTextSignal(db: PrismaClient, userId: string, text: string, kind: 'SEARCH' | 'PLAY', eventId: string, context = 'PERSONAL'): Promise<void> {
  if (!(await loadTaste(db, userId)).useActivity) return;
  for (const artist of artistsInText(text)) await recordSignal(db, userId, artist.id, kind, `${eventId}:${artist.id}`, context);
}

export async function loadSignals(db: PrismaClient, userId: string) {
  const [feedback, activity] = await Promise.all([
    // Persistent explicit feedback must survive a busy user's newer plays.
    db.recommendationEvent.findMany({ where: { userId, kind: { in: ['LIKE', 'DISLIKE'] } }, orderBy: { createdAt: 'desc' }, distinct: ['artistId'] }),
    db.recommendationEvent.findMany({ where: { userId, kind: { notIn: ['LIKE', 'DISLIKE'] }, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ]);
  return [...feedback, ...activity];
}
