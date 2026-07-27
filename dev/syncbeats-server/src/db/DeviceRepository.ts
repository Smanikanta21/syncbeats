// db/DeviceRepository.ts — Prisma-based implementation

import prisma from './prisma';

export interface PublicDevice {
  id:           string;
  device_key:   string;
  name:         string;
  user_agent:   string | null;
  created_at:   Date;
  updated_at:   Date;
  last_seen_at: Date;
}

export class DeviceRepository {
  async ensureForUser(
    userId: string,
    deviceKey: string,
    userAgent: string | null,
    ownerName: string
  ): Promise<{ device: PublicDevice; created: boolean }> {
    const existing = await prisma.device.findUnique({
      where: { userId_deviceKey: { userId, deviceKey } }
    });

    if (existing) {
      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), userAgent }
      });
      return { device: this.mapDevice(updated), created: false };
    }

    // If browser storage changed (new deviceKey) but fingerprint/userAgent matches,
    // reuse the existing device record instead of creating duplicates.
    const normalizedUserAgent = userAgent?.trim() || null;
    if (normalizedUserAgent) {
      const sameAgentDevice = await prisma.device.findFirst({
        where: { userId, userAgent: normalizedUserAgent },
        orderBy: { lastSeenAt: 'desc' },
      });

      if (sameAgentDevice) {
        try {
          const reused = await prisma.device.update({
            where: { id: sameAgentDevice.id },
            data: {
              deviceKey,
              lastSeenAt: new Date(),
              userAgent: normalizedUserAgent,
            },
          });
          return { device: this.mapDevice(reused), created: false };
        } catch (e: any) {
          if (e?.code === 'P2002') {
            const found = await prisma.device.findUnique({
              where: { userId_deviceKey: { userId, deviceKey } }
            });
            if (found) return { device: this.mapDevice(found), created: false };
          }
        }
      }
    }

    const defaultName = this.buildDefaultDeviceName(ownerName, userAgent);

    try {
      const created = await prisma.device.create({
        data: {
          userId,
          deviceKey,
          name: defaultName,
          userAgent: normalizedUserAgent,
        }
      });
      return { device: this.mapDevice(created), created: true };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const found = await prisma.device.findUnique({
          where: { userId_deviceKey: { userId, deviceKey } }
        });
        if (found) return { device: this.mapDevice(found), created: false };
      }
      throw e;
    }
  }

  async listByUser(userId: string): Promise<PublicDevice[]> {
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' }
    });
    return devices.map(d => this.mapDevice(d));
  }

  async rename(
    userId: string,
    deviceId: string,
    name: string
  ): Promise<PublicDevice | null> {
    const existing = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!existing || existing.userId !== userId) return null;

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { name }
    });
    return this.mapDevice(updated);
  }

  async findByUserAndKey(
    userId: string,
    deviceKey: string
  ): Promise<PublicDevice | null> {
    const device = await prisma.device.findUnique({
      where: { userId_deviceKey: { userId, deviceKey } }
    });
    return device ? this.mapDevice(device) : null;
  }

  async findByIdAndUser(
    userId: string,
    deviceId: string
  ): Promise<PublicDevice | null> {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== userId) return null;
    return this.mapDevice(device);
  }

  async replaceCurrentWithExisting(
    userId: string,
    currentDeviceKey: string,
    targetDeviceId: string,
    userAgent: string | null
  ): Promise<PublicDevice | null> {
    const target = await prisma.device.findUnique({ where: { id: targetDeviceId } });
    if (!target || target.userId !== userId) return null;

    const current = await prisma.device.findUnique({
      where: { userId_deviceKey: { userId, deviceKey: currentDeviceKey } }
    });

    if (current && current.id === target.id) {
      const same = await prisma.device.update({
        where: { id: target.id },
        data: {
          userAgent,
          lastSeenAt: new Date(),
        }
      });
      return this.mapDevice(same);
    }

    const updatedTarget = await prisma.$transaction(async (tx) => {
      if (current && current.id !== target.id) {
        await tx.device.delete({ where: { id: current.id } });
      }

      return tx.device.update({
        where: { id: target.id },
        data: {
          deviceKey: currentDeviceKey,
          userAgent,
          lastSeenAt: new Date(),
        }
      });
    });

    return this.mapDevice(updatedTarget);
  }

  async remove(userId: string, deviceId: string): Promise<boolean> {
    const target = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!target || target.userId !== userId) return false;
    
    await prisma.device.delete({ where: { id: deviceId } });
    return true;
  }

  private mapDevice(d: any): PublicDevice {
    return {
      id: d.id,
      device_key: d.deviceKey,
      name: d.name,
      user_agent: d.userAgent,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      last_seen_at: d.lastSeenAt,
    };
  }

  private buildDefaultDeviceName(ownerName: string, userAgent: string | null): string {
    const owner = ownerName?.trim() || 'My';
    const suffix = owner === 'My' ? '' : `'s`;
    const platform = this.detectPlatformLabel(userAgent);
    return `${owner}${suffix} ${platform}`.trim();
  }

  private detectPlatformLabel(userAgent: string | null): string {
    const ua = (userAgent ?? '').toLowerCase();

    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('mac')) return 'Mac';
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('linux')) return 'Linux';

    return 'Device';
  }
}
