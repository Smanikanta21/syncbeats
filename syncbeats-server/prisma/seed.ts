import prisma from '../src/db/prisma';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

async function main() {
  try {
    const workspaceRoot = path.join(__dirname, '..', '..');

    const usersCSV = fs.readFileSync(path.join(workspaceRoot, 'Users.csv'), 'utf-8');
    const userRecords = parse(usersCSV, { columns: true });

    console.log(`Seeding ${userRecords.length} users...`);
    for (const record of userRecords) {
      await prisma.user.upsert({
        where: { id: record.id },
        update: {
          name: record.name,
          email: record.email,
        },
        create: {
          id: record.id,
          name: record.name,
          email: record.email,
          passwordHash: record.password || 'temp_hash_change_me',
        },
      });
    }
    console.log('Users seeded');

    const devicesCSV = fs.readFileSync(path.join(workspaceRoot, 'Device.csv'), 'utf-8');
    const deviceRecords = parse(devicesCSV, { columns: true });

    console.log(`Seeding ${deviceRecords.length} devices...`);
    for (const record of deviceRecords) {
      await prisma.device.upsert({
        where: { id: record.id },
        update: {
          userId: record.DeviceUserId,
          deviceKey: `device_${record.id}`,
          name: record.name,
          lastSeenAt: new Date(record.lastSeenAt),
          updatedAt: new Date(record.updatedAt || record.lastSeenAt),
        },
        create: {
          id: record.id,
          userId: record.DeviceUserId,
          deviceKey: `device_${record.id}`,
          name: record.name,
          userAgent: null,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt || record.createdAt),
          lastSeenAt: new Date(record.lastSeenAt),
        },
      });
    }
    console.log('Devices seeded');

    console.log('Seeding completed');
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
