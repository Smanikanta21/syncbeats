// handlers/DeviceRoutes.ts - /devices REST endpoints

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import { DeviceRepository } from '../db/DeviceRepository';

const repo = new DeviceRepository();

export function createDeviceRoutes(): Router {
  const router = Router();

  function getDeviceContext(req: Request): { deviceKey: string | null; userAgent: string | null } {
    const deviceId = req.header('x-device-id');
    return {
      deviceKey: deviceId?.trim() || null,
      userAgent: req.header('user-agent') || null,
    };
  }

  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const { deviceKey, userAgent } = getDeviceContext(req);
      if (deviceKey) {
        await repo.ensureForUser(req.user!.sub, deviceKey, userAgent, req.user!.name);
      }
      const devices = await repo.listByUser(req.user!.sub);

      const io = req.app.get('io');
      const deviceRoomMap = new Map<string, string>();
      if (io) {
        const activeSockets = await io.in(`user:${req.user!.sub}`).fetchSockets();
        for (const s of activeSockets) {
          const deviceId = (s.data as any).deviceId;
          if (deviceId) {
            // Find the room they are in (filter out their own socket ID and the user room)
            const room = Array.from(s.rooms).find(r => r !== s.id && r !== `user:${req.user!.sub}`);
            if (room) deviceRoomMap.set(deviceId as string, room as string);
          }
        }
      }

      const now = Date.now();
      const enrichedDevices = devices.map(d => {
        const inRoomId = deviceRoomMap.get(d.device_key);
        const isOnline = inRoomId ? true : (now - d.last_seen_at.getTime() < 30000);
        return {
          ...d,
          isOnline,
          roomId: inRoomId || null,
        };
      });

      res.json({ devices: enrichedDevices });
    } catch (err) {
      console.error('[Devices] mine error:', err);
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  });

  router.patch('/:deviceId', requireAuth, async (req: Request, res: Response) => {
    const deviceId = req.params['deviceId'] as string;
    const { name } = req.body as { name?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    try {
      const device = await repo.rename(req.user!.sub, deviceId, name);
      if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      res.json({ device });
    } catch (err) {
      console.error('[Devices] rename error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.delete('/:deviceId', requireAuth, async (req: Request, res: Response) => {
    const deviceId = req.params['deviceId'] as string;

    try {
      const success = await repo.remove(req.user!.sub, deviceId);
      if (!success) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Devices] remove error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/replace', requireAuth, async (req: Request, res: Response) => {
    const { targetDeviceId } = req.body as { targetDeviceId?: string };
    const { deviceKey, userAgent } = getDeviceContext(req);

    if (!targetDeviceId?.trim()) {
      res.status(400).json({ error: 'targetDeviceId is required' });
      return;
    }

    if (!deviceKey) {
      res.status(400).json({ error: 'x-device-id is required' });
      return;
    }

    try {
      const device = await repo.replaceCurrentWithExisting(
        req.user!.sub,
        deviceKey,
        targetDeviceId,
        userAgent,
      );

      if (!device) {
        res.status(404).json({ error: 'Target device not found' });
        return;
      }

      res.json({ device });
    } catch (err) {
      console.error('[Devices] replace error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
