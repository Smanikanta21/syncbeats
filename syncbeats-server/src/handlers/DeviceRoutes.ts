// handlers/DeviceRoutes.ts — /devices REST endpoints

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import { DeviceRepository } from '../db/DeviceRepository';

const repo = new DeviceRepository();

export function createDeviceRoutes(): Router {
  const router = Router();

  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const devices = await repo.listByUser(req.user!.sub);
      res.json({ devices });
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

  return router;
}
