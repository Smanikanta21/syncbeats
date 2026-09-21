// db/DeviceRepository.ts — Prisma-based implementation

import prisma from './prisma';
import { UAParser } from 'ua-parser-js';

export interface PublicDevice {
  id:           string;
  device_key:   string;
  name:         string;
  user_agent:   string | null;
  ip:           string | null;
  created_at:   Date;
  updated_at:   Date;
  last_seen_at: Date;
}

export class DeviceRepository {
  async ensureForUser(
    userId: string,
    deviceKey: string,
    userAgent: string | null,
    ownerName: string,
    ip: string | null = null
  ): Promise<{ device: PublicDevice; created: boolean }> {
    const existing = await prisma.device.findUnique({
      where: { userId_deviceKey: { userId, deviceKey } }
    });

    if (existing) {
      let newName = existing.name;
      
      // Auto-upgrade legacy or generic numbered names (e.g., 'Mac 1', 'iPhone 2', or just 'Mac')
      // to the new smart naming convention when the user logs in or loads the app.
      const isGeneric = /(Mac|iPhone|iPad|Android|Windows|Linux|Device)(\s+\d+)?$/i.test(existing.name);
      
      if (isGeneric && userAgent) {
        const smartName = this.buildDefaultDeviceName(ownerName, userAgent);
        if (smartName && smartName !== existing.name) {
          newName = smartName;
        }
      }

      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: { 
          name: newName,
          lastSeenAt: new Date(), 
          userAgent, 
          ...(ip ? { ip } : {}) 
        }
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
              ...(ip ? { ip } : {}),
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
          ip,
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
  ): Promise<{ device: PublicDevice, oldDeviceKey: string } | null> {
    const target = await prisma.device.findUnique({ where: { id: targetDeviceId } });
    if (!target || target.userId !== userId) return null;

    const current = await prisma.device.findUnique({
      where: { userId_deviceKey: { userId, deviceKey: currentDeviceKey } }
    });

    const oldDeviceKey = target.deviceKey;

    if (current && current.id === target.id) {
      const same = await prisma.device.update({
        where: { id: target.id },
        data: {
          userAgent,
          lastSeenAt: new Date(),
        }
      });
      return { device: this.mapDevice(same), oldDeviceKey };
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

    return { device: this.mapDevice(updatedTarget), oldDeviceKey };
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
      ip: d.ip ?? null,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      last_seen_at: d.lastSeenAt,
    };
  }

  private buildDefaultDeviceName(ownerName: string, userAgent: string | null): string {
    const owner = ownerName?.trim() || 'My';
    const suffix = owner === 'My' ? '' : `'s`;
    
    if (!userAgent) {
      return `${owner}${suffix} Device`.trim();
    }
    
    const parser = new UAParser(userAgent);
    const os = parser.getOS();
    const browser = parser.getBrowser();
    const device = parser.getDevice();
    
    let platformLabel = "Device";
    
    // Prioritize exact device model if available (e.g. Android models)
    if (device.model) {
      platformLabel = device.model;
      if (platformLabel.toLowerCase() === "macintosh" || platformLabel.toLowerCase() === "macbook") {
        platformLabel = "Mac";
      }
    } else if (os.name) {
      if (os.name.includes("Mac OS")) platformLabel = "Mac";
      else if (os.name.includes("iOS")) platformLabel = "iPhone";
      else if (os.name.includes("Windows")) platformLabel = "Windows PC";
      else if (os.name.includes("Android")) platformLabel = "Android Phone";
      else platformLabel = os.name;
    }

    // Append browser name if desktop
    if (browser.name && !device.type && !["iPhone", "Android Phone"].includes(platformLabel)) {
      return `${owner}${suffix} ${platformLabel} (${browser.name})`.trim();
    }

    return `${owner}${suffix} ${platformLabel}`.trim();
  }
}
