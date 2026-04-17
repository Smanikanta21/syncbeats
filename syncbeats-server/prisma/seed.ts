import prisma from '../src/db/prisma';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

function toNullableString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length ? normalized : null;
}

function toDate(value: unknown, fallback: Date = new Date()): Date {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function main() {
  try {
    const workspaceRoot = path.join(__dirname, '..', '..');

    const usersCSV = fs.readFileSync(path.join(workspaceRoot, 'Users.csv'), 'utf-8');
    const userRecords = parse(usersCSV, { columns: true });

    console.log(`Seeding ${userRecords.length} users...`);
    for (const record of userRecords) {
      const googleId = toNullableString(record.googleId);

      await prisma.user.upsert({
        where: { id: record.id },
        update: {
          name: record.name,
          email: record.email,
          googleId,
          authProvider: googleId ? 'GOOGLE' : 'LOCAL',
        },
        create: {
          id: record.id,
          name: record.name,
          email: record.email,
          passwordHash: toNullableString(record.password),
          googleId,
          authProvider: googleId ? 'GOOGLE' : 'LOCAL',
          createdAt: toDate(record.createdAt),
          updatedAt: toDate(record.updatedAt),
        },
      });
    }
    console.log('Users seeded');

    const devicesCSV = fs.readFileSync(path.join(workspaceRoot, 'Device.csv'), 'utf-8');
    const deviceRecords = parse(devicesCSV, { columns: true });

    console.log(`Seeding ${deviceRecords.length} devices...`);
    const userIds = new Set((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
    let skipped = 0;

    for (const record of deviceRecords) {
      if (!userIds.has(record.DeviceUserId)) {
        skipped += 1;
        continue;
      }

      const createdAt = toDate(record.createdAt);
      const lastSeenAt = toDate(record.lastSeenAt, createdAt);
      const updatedAt = toDate(record.updatedAt, lastSeenAt);

      await prisma.device.upsert({
        where: { id: record.id },
        update: {
          userId: record.DeviceUserId,
          deviceKey: `device_${record.id}`,
          name: record.name,
          userAgent: toNullableString(record.type),
          lastSeenAt,
          updatedAt,
        },
        create: {
          id: record.id,
          userId: record.DeviceUserId,
          deviceKey: `device_${record.id}`,
          name: record.name,
          userAgent: toNullableString(record.type),
          createdAt,
          updatedAt,
          lastSeenAt,
        },
      });
    }
    console.log(`Devices seeded (skipped ${skipped} rows with missing user)`);

    console.log('Seeding completed');
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
